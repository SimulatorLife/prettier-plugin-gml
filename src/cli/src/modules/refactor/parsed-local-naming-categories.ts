import * as fs from "node:fs";
import path from "node:path";

import { Core } from "@gmloop/core";
import { Parser } from "@gmloop/parser";

type ParsedLocalNamingCategory = "staticVariable" | "loopIndexVariable";

type ParsedLocalNamingCategoryMap = ReadonlyMap<string, ParsedLocalNamingCategory>;

function createDeclarationLookupKey(name: string, start: number): string {
    return `${name}:${start}`;
}

function readNodeStartIndex(node: unknown): number | null {
    if (!Core.isObjectLike(node)) {
        return null;
    }

    const startValue = (node as Record<string, unknown>).start;
    if (typeof startValue === "number") {
        return startValue;
    }

    if (!Core.isObjectLike(startValue)) {
        return null;
    }

    const startRecord = startValue as Record<string, unknown>;
    return typeof startRecord.index === "number" ? startRecord.index : null;
}

function classifyVariableDeclarationSyntax(
    node: unknown,
    parent: unknown,
    key: string | number | null
): ParsedLocalNamingCategory | null {
    const declarationKind = Core.getVariableDeclarationKind(
        node as Parameters<typeof Core.getVariableDeclarationKind>[0]
    );
    if (declarationKind === "static") {
        return "staticVariable";
    }

    if (
        declarationKind === "var" &&
        Core.isObjectLike(parent) &&
        (parent as Record<string, unknown>).type === "ForStatement" &&
        key === "init"
    ) {
        return "loopIndexVariable";
    }

    return null;
}

function extractParsedLocalNamingCategories(sourceText: string): ParsedLocalNamingCategoryMap {
    const parsedCategories = new Map<string, ParsedLocalNamingCategory>();
    const ast = Parser.GMLParser.parse(sourceText, {
        getComments: false,
        getLocations: true,
        simplifyLocations: false
    });

    Core.walkAst(ast, (node, parent, key) => {
        if (!Core.isVariableDeclarationNode(node)) {
            return;
        }

        const syntaxCategory = classifyVariableDeclarationSyntax(node, parent, key);
        if (syntaxCategory === null) {
            return;
        }

        for (const declarator of node.declarations ?? []) {
            if (!Core.isVariableDeclaratorNode(declarator)) {
                continue;
            }

            const declarationName = Core.resolveNodeName(declarator.id ?? null);
            const declarationStart = readNodeStartIndex(declarator.id ?? declarator);
            if (!declarationName || declarationStart === null) {
                continue;
            }

            parsedCategories.set(createDeclarationLookupKey(declarationName, declarationStart), syntaxCategory);
        }
    });

    return parsedCategories;
}

/**
 * Resolves syntax-derived local naming categories for declarations in project files.
 */
export class ParsedLocalNamingCategoryResolver {
    private readonly categoryCache = new Map<string, ParsedLocalNamingCategoryMap>();
    private readonly projectRoot: string;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
    }

    /**
     * Resolve a local declaration's refined naming category when syntax provides
     * more precision than the semantic project index alone.
     */
    resolveCategory(filePath: string, name: string, start: number): ParsedLocalNamingCategory | null {
        const fileCategories = this.loadFileCategories(filePath);
        return fileCategories.get(createDeclarationLookupKey(name, start)) ?? null;
    }

    private loadFileCategories(filePath: string): ParsedLocalNamingCategoryMap {
        const cachedCategories = this.categoryCache.get(filePath);
        if (cachedCategories) {
            return cachedCategories;
        }

        const absoluteFilePath = path.resolve(this.projectRoot, filePath);
        let parsedCategories: ParsedLocalNamingCategoryMap = new Map();

        try {
            if (fs.existsSync(absoluteFilePath)) {
                const sourceText = fs.readFileSync(absoluteFilePath, "utf8");
                parsedCategories = extractParsedLocalNamingCategories(sourceText);
            }
        } catch {
            parsedCategories = new Map();
        }

        this.categoryCache.set(filePath, parsedCategories);
        return parsedCategories;
    }
}
