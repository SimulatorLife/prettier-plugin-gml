import * as fs from "node:fs";
import path from "node:path";

import { Core } from "@gmloop/core";
import { Parser } from "@gmloop/parser";
import { Semantic } from "@gmloop/semantic";

type MacroIdentifierEntry = {
    declarations?: Array<Record<string, unknown>>;
};

type SemanticFileRecord = {
    references?: Array<Record<string, unknown>>;
};

type MacroDependencyContext = {
    files: Record<string, SemanticFileRecord>;
    macros: Record<string, MacroIdentifierEntry>;
    projectRoot: string;
    selectedFilePaths?: Array<string>;
};

type MacroExpansionDependency = {
    path: string;
    macroName: string;
    referencedNames: Array<string>;
};

const DEFAULT_DECLARATION_KEYWORDS = new Set(["enum", "function", "globalvar", "static", "var"]);
const BUILT_IN_IDENTIFIER_NAMES = new Set(
    Core.normalizeIdentifierMetadataEntries(Core.getIdentifierMetadata()).map((entry) => entry.name.toLowerCase())
);

function createSelectedFilePredicate(selectedFilePaths?: Array<string>): (candidatePath: string) => boolean {
    if (!Array.isArray(selectedFilePaths) || selectedFilePaths.length === 0) {
        return () => true;
    }

    const includedFiles = new Set(selectedFilePaths);
    return (candidatePath) => includedFiles.has(candidatePath);
}

function readMacroDeclarationFilePath(entry: MacroIdentifierEntry): string | null {
    for (const declaration of entry.declarations ?? []) {
        if (typeof declaration.filePath === "string") {
            return declaration.filePath;
        }
    }

    return null;
}

function normalizeMacroBody(tokens: ReadonlyArray<unknown>): string {
    return tokens
        .flatMap((token) => {
            if (typeof token !== "string") {
                return [];
            }

            return token === "\\" ? ["\n"] : [token];
        })
        .join(" ");
}

function collectMacroReferenceNamesFromAst(bodySourceText: string): Set<string> {
    const ast = Parser.GMLParser.parse(`function __gmloop_macro_probe__() {\n${bodySourceText}\n}\n`, {
        getComments: false,
        getLocations: true,
        simplifyLocations: false,
        scopeTrackerOptions: {
            enabled: true,
            createScopeTracker: () => new Semantic.SemanticScopeCoordinator()
        }
    });
    const referenceNames = new Set<string>();

    Core.walkAst(ast, (node) => {
        if (!Core.isIdentifierNode(node)) {
            return;
        }

        const classifications = Core.asArray((node as { classifications?: Array<string> }).classifications);
        if (!classifications.includes("reference")) {
            return;
        }

        const declaration = (node as { declaration?: unknown }).declaration;
        if (Core.isObjectLike(declaration)) {
            return;
        }

        const identifierName = node.name;
        if (!Core.isNonEmptyString(identifierName)) {
            return;
        }

        if (BUILT_IN_IDENTIFIER_NAMES.has(identifierName.toLowerCase())) {
            return;
        }

        referenceNames.add(identifierName);
    });

    return referenceNames;
}

function collectMacroReferenceNamesFromTokens(tokens: ReadonlyArray<unknown>): Set<string> {
    const referenceNames = new Set<string>();
    let previousToken = "";

    for (const token of tokens) {
        if (typeof token !== "string") {
            continue;
        }

        if (token === "\\") {
            previousToken = "";
            continue;
        }

        const isIdentifier = Core.GML_IDENTIFIER_NAME_PATTERN.test(token);
        if (
            isIdentifier &&
            !DEFAULT_DECLARATION_KEYWORDS.has(previousToken) &&
            !BUILT_IN_IDENTIFIER_NAMES.has(token.toLowerCase())
        ) {
            referenceNames.add(token);
        }

        previousToken = token;
    }

    return referenceNames;
}

function collectMacroReferenceNames(tokens: ReadonlyArray<unknown>): Set<string> {
    const normalizedBody = normalizeMacroBody(tokens).trim();
    if (normalizedBody.length === 0) {
        return new Set();
    }

    try {
        return collectMacroReferenceNamesFromAst(normalizedBody);
    } catch {
        return collectMacroReferenceNamesFromTokens(tokens);
    }
}

function collectMacroDependencyNamesByMacro(
    macros: Record<string, MacroIdentifierEntry>,
    projectRoot: string
): Map<string, Set<string>> {
    const dependencyNamesByMacro = new Map<string, Set<string>>();
    const parsedMacroFiles = new Set<string>();

    for (const entry of Object.values(macros)) {
        const declarationFilePath = readMacroDeclarationFilePath(entry);
        if (!declarationFilePath || parsedMacroFiles.has(declarationFilePath)) {
            continue;
        }

        parsedMacroFiles.add(declarationFilePath);
        const absoluteFilePath = path.resolve(projectRoot, declarationFilePath);
        if (!fs.existsSync(absoluteFilePath)) {
            continue;
        }

        let sourceText: string;
        try {
            sourceText = fs.readFileSync(absoluteFilePath, "utf8");
        } catch {
            continue;
        }

        let ast: Record<string, unknown>;
        try {
            ast = Parser.GMLParser.parse(sourceText, {
                getComments: false,
                getLocations: false
            }) as Record<string, unknown>;
        } catch {
            continue;
        }

        const body = Core.asArray(ast.body);
        for (const statement of body) {
            if (!Core.isObjectLike(statement)) {
                continue;
            }

            const macroStatement = statement as {
                type?: string;
                name?: unknown;
                tokens?: unknown;
            };
            if (macroStatement.type !== "MacroDeclaration") {
                continue;
            }

            const macroNameNode = macroStatement.name;
            const macroName =
                Core.isIdentifierNode(macroNameNode) && Core.isNonEmptyString(macroNameNode.name)
                    ? macroNameNode.name
                    : null;
            if (!macroName) {
                continue;
            }

            dependencyNamesByMacro.set(macroName, collectMacroReferenceNames(Core.asArray(macroStatement.tokens)));
        }
    }

    return dependencyNamesByMacro;
}

function readMacroReferenceName(reference: Record<string, unknown>): string | null {
    const name = typeof reference.targetName === "string" ? reference.targetName : reference.name;
    return typeof name === "string" ? name : null;
}

/**
 * Resolve caller-scoped identifier dependencies introduced by bare macro
 * invocations in the selected project files.
 */
export function listMacroExpansionDependencies(context: MacroDependencyContext): Array<MacroExpansionDependency> {
    const shouldIncludePath = createSelectedFilePredicate(context.selectedFilePaths);
    const dependencyNamesByMacro = collectMacroDependencyNamesByMacro(context.macros, context.projectRoot);
    const dependencies: Array<MacroExpansionDependency> = [];
    const seenDependencyKeys = new Set<string>();

    for (const [filePath, fileRecord] of Object.entries(context.files)) {
        if (!shouldIncludePath(filePath)) {
            continue;
        }

        for (const reference of fileRecord.references ?? []) {
            if (!Core.isObjectLike(reference)) {
                continue;
            }

            const macroName = readMacroReferenceName(reference);
            if (!macroName) {
                continue;
            }

            const referencedNames = dependencyNamesByMacro.get(macroName);
            if (!referencedNames || referencedNames.size === 0) {
                continue;
            }

            const dependencyKey = `${filePath}:${macroName}`;
            if (seenDependencyKeys.has(dependencyKey)) {
                continue;
            }

            seenDependencyKeys.add(dependencyKey);
            dependencies.push({
                path: filePath,
                macroName,
                referencedNames: [...referencedNames].sort()
            });
        }
    }

    return dependencies;
}
