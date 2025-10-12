import { createRequire } from "node:module";

import {
    getNodeEndIndex,
    getNodeStartIndex,
    cloneLocation
} from "../../../shared/ast-locations.js";
import { collectCommentNodes } from "../comments/index.js";
import {
    getFeatherDiagnosticById,
    getFeatherDiagnostics,
    getFeatherMetadata
} from "../feather/metadata.js";

const require = createRequire(import.meta.url);
const TRAILING_MACRO_SEMICOLON_PATTERN = new RegExp(
    ";(?=[^\\S\\r\\n]*(?:(?:\\/\\/[^\\r\\n]*|\\/\\*[\\s\\S]*?\\*\/)[^\\S\\r\\n]*)*(?:\\r?\\n|$))"
);
const DATA_STRUCTURE_ACCESSOR_TOKENS = [
    "?",
    "|",
    "#",
    "@",
    "!",
    "$",
    "%",
    "&",
    "^",
    "~"
];
const NUMERIC_STRING_LITERAL_PATTERN =
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const ALLOWED_DELETE_MEMBER_TYPES = new Set([
    "MemberDotExpression",
    "MemberIndexExpression"
]);
const MANUAL_FIX_TRACKING_KEY = Symbol("manualFeatherFixes");
const IDENTIFIER_TOKEN_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const RESERVED_KEYWORD_TOKENS = new Set([
    "and",
    "break",
    "case",
    "continue",
    "constructor",
    "create",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "event",
    "for",
    "function",
    "globalvar",
    "if",
    "macro",
    "not",
    "or",
    "repeat",
    "return",
    "step",
    "switch",
    "until",
    "var",
    "while",
    "with"
]);
const RESERVED_IDENTIFIER_NAMES = buildReservedIdentifierNameSet();
const DEPRECATED_BUILTIN_VARIABLE_REPLACEMENTS =
    buildDeprecatedBuiltinVariableReplacements();
const ARGUMENT_IDENTIFIER_PATTERN = /^argument(\d+)$/;
const GM1041_CALL_ARGUMENT_TARGETS = new Map([
    ["instance_create_depth", [3]],
    ["instance_create_layer", [3]],
    ["instance_create_layer_depth", [4]],
    ["layer_instance_create", [3]]
]);
const FUNCTION_LIKE_TYPES = new Set([
    "FunctionDeclaration",
    "FunctionExpression",
    "LambdaExpression",
    "ConstructorDeclaration",
    "MethodDeclaration",
    "StructFunctionDeclaration",
    "StructDeclaration"
]);
const IDENTIFIER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FEATHER_TYPE_SYSTEM_INFO = buildFeatherTypeSystemInfo();
const AUTOMATIC_FEATHER_FIX_HANDLERS = createAutomaticFeatherFixHandlers();
const FEATHER_DIAGNOSTICS = getFeatherDiagnostics();
const FEATHER_FIX_IMPLEMENTATIONS =
    buildFeatherFixImplementations(FEATHER_DIAGNOSTICS);
const FEATHER_DIAGNOSTIC_FIXERS = buildFeatherDiagnosticFixers(
    FEATHER_DIAGNOSTICS,
    FEATHER_FIX_IMPLEMENTATIONS
);

export function preprocessSourceForFeatherFixes(sourceText) {
    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return {
            sourceText,
            metadata: null
        };
    }

    const gm1100Metadata = [];
    const gm1016Metadata = [];
    const sanitizedParts = [];
    const newlinePattern = /\r?\n/g;
    let lastIndex = 0;
    let lineNumber = 1;
    let pendingGM1100Context = null;

    const processLine = (line) => {
        const indentationMatch = line.match(/^\s*/);
        const indentation = indentationMatch ? indentationMatch[0] : "";
        const trimmed = line.trim();

        if (trimmed.length === 0) {
            return { line, context: pendingGM1100Context };
        }

        const booleanLiteralMatch = line.match(/^(\s*)(true|false)\s*;?\s*$/);

        if (booleanLiteralMatch) {
            const leadingWhitespace = booleanLiteralMatch[1] ?? "";
            const sanitizedRemainder = " ".repeat(
                Math.max(0, line.length - leadingWhitespace.length)
            );
            const sanitizedLine = `${leadingWhitespace}${sanitizedRemainder}`;
            const trimmedRightLength = line.replace(/\s+$/, "").length;
            const startColumn = leadingWhitespace.length;
            const endColumn = Math.max(startColumn, trimmedRightLength - 1);
            const lineStartIndex = lastIndex;

            gm1016Metadata.push({
                start: {
                    line: lineNumber,
                    column: startColumn,
                    index: lineStartIndex + startColumn
                },
                end: {
                    line: lineNumber,
                    column: endColumn,
                    index: lineStartIndex + endColumn
                }
            });

            return { line: sanitizedLine, context: null };
        }

        const varMatch = line.match(/^\s*var\s+([A-Za-z_][A-Za-z0-9_]*)\b/);

        if (varMatch) {
            const identifier = varMatch[1];
            const remainder = line.slice(varMatch[0].length);
            const trimmedRemainder = remainder.replace(/^\s*/, "");

            if (trimmedRemainder.startsWith("*")) {
                const leadingWhitespaceLength =
                    remainder.length - trimmedRemainder.length;
                const leadingWhitespace =
                    leadingWhitespaceLength > 0
                        ? remainder.slice(0, leadingWhitespaceLength)
                        : "";
                const sanitizedLine = [
                    line.slice(0, varMatch[0].length),
                    leadingWhitespace,
                    "=",
                    trimmedRemainder.slice(1)
                ].join("");

                gm1100Metadata.push({
                    type: "declaration",
                    line: lineNumber,
                    identifier
                });

                return {
                    line: sanitizedLine,
                    context: {
                        identifier,
                        indentation
                    }
                };
            }
        }

        if (trimmed.startsWith("=") && pendingGM1100Context?.identifier) {
            const rawRemainder = line.slice(indentation.length);
            const identifier = pendingGM1100Context.identifier;

            gm1100Metadata.push({
                type: "assignment",
                line: lineNumber,
                identifier
            });

            const sanitizedLine = `${indentation}${" ".repeat(
                Math.max(0, rawRemainder.length)
            )}`;

            return { line: sanitizedLine, context: null };
        }

        if (trimmed.startsWith("/") || trimmed.startsWith("*")) {
            return { line, context: pendingGM1100Context };
        }

        return { line, context: null };
    };

    let match;

    while ((match = newlinePattern.exec(sourceText)) !== null) {
        const lineEnd = match.index;
        const line = sourceText.slice(lastIndex, lineEnd);
        const newline = match[0];
        const { line: sanitizedLine, context } = processLine(line);

        sanitizedParts.push(sanitizedLine, newline);
        pendingGM1100Context = context;
        lastIndex = match.index + newline.length;
        lineNumber += 1;
    }

    const finalLine = sourceText.slice(lastIndex);
    if (
        finalLine.length > 0 ||
        sourceText.endsWith("\n") ||
        sourceText.endsWith("\r")
    ) {
        const { line: sanitizedLine, context } = processLine(finalLine);
        sanitizedParts.push(sanitizedLine);
        pendingGM1100Context = context;
    }

    const sanitizedSourceText = sanitizedParts.join("");
    const metadata = {};

    if (gm1100Metadata.length > 0) {
        metadata.GM1100 = gm1100Metadata;
    }

    if (gm1016Metadata.length > 0) {
        metadata.GM1016 = gm1016Metadata;
    }

    if (Object.keys(metadata).length === 0) {
        return {
            sourceText,
            metadata: null
        };
    }

    return {
        sourceText: sanitizedSourceText,
        metadata
    };
}

export function getFeatherDiagnosticFixers() {
    return new Map(FEATHER_DIAGNOSTIC_FIXERS);
}

export function applyFeatherFixes(
    ast,
    { sourceText, preprocessedFixMetadata, options } = {}
) {
    if (!ast || typeof ast !== "object") {
        return ast;
    }

    const appliedFixes = [];

    for (const entry of FEATHER_DIAGNOSTIC_FIXERS.values()) {
        const fixes = entry.applyFix(ast, {
            sourceText,
            preprocessedFixMetadata,
            options
        });

        if (Array.isArray(fixes) && fixes.length > 0) {
            appliedFixes.push(...fixes);
        }
    }

    if (appliedFixes.length > 0) {
        attachFeatherFixMetadata(ast, appliedFixes);
    }

    return ast;
}

function buildFeatherDiagnosticFixers(diagnostics, implementationRegistry) {
    const registry = new Map();

    for (const diagnostic of Array.isArray(diagnostics) ? diagnostics : []) {
        const diagnosticId = diagnostic?.id;

        if (!diagnosticId || registry.has(diagnosticId)) {
            continue;
        }

        const applyFix = createFixerForDiagnostic(
            diagnostic,
            implementationRegistry
        );

        if (typeof applyFix !== "function") {
            continue;
        }

        registry.set(diagnosticId, {
            diagnostic,
            applyFix
        });
    }

    return registry;
}

function createFixerForDiagnostic(diagnostic, implementationRegistry) {
    if (!implementationRegistry) {
        return createNoOpFixer();
    }

    const implementationFactory = implementationRegistry.get(diagnostic?.id);

    if (typeof implementationFactory !== "function") {
        return createNoOpFixer();
    }

    const implementation = implementationFactory(diagnostic);
    if (typeof implementation !== "function") {
        return createNoOpFixer();
    }

    return (ast, context) => {
        const fixes = implementation({
            ast,
            sourceText: context?.sourceText,
            preprocessedFixMetadata: context?.preprocessedFixMetadata,
            options: context?.options
        });

        return Array.isArray(fixes) ? fixes : [];
    };
}

function createNoOpFixer() {
    return () => [];
}

function buildFeatherFixImplementations(diagnostics) {
    const registry = new Map();

    for (const diagnostic of Array.isArray(diagnostics) ? diagnostics : []) {
        const diagnosticId = diagnostic?.id;

        if (!diagnosticId) {
            continue;
        }

        const handler = AUTOMATIC_FEATHER_FIX_HANDLERS.get(diagnosticId);

        if (handler) {
            registerAutomaticFeatherFix({
                registry,
                diagnostic,
                handler
            });
            continue;
        }

        registerManualOnlyFeatherFix({ registry, diagnostic });
    }

    return registry;
}

function registerAutomaticFeatherFix({ registry, diagnostic, handler }) {
    if (!diagnostic?.id || typeof handler !== "function") {
        return;
    }

    registerFeatherFixer(registry, diagnostic.id, () => (context = {}) => {
        const fixes = handler({ ...context, diagnostic });

        if (isNonEmptyArray(fixes)) {
            return fixes;
        }

        return registerManualFeatherFix({ ast: context.ast, diagnostic });
    });
}

function registerManualOnlyFeatherFix({ registry, diagnostic }) {
    if (!diagnostic?.id) {
        return;
    }

    registerFeatherFixer(
        registry,
        diagnostic.id,
        () =>
            ({ ast }) =>
                registerManualFeatherFix({ ast, diagnostic })
    );
}

function createAutomaticFeatherFixHandlers() {
    return new Map([
        [
            "GM1023",
            ({ ast, diagnostic }) =>
                replaceDeprecatedConstantReferences({ ast, diagnostic })
        ],
        [
            "GM1024",
            ({ ast, diagnostic }) =>
                replaceDeprecatedBuiltinVariables({ ast, diagnostic })
        ],
        [
            "GM1026",
            ({ ast, diagnostic }) =>
                rewriteInvalidPostfixExpressions({ ast, diagnostic })
        ],
        [
            "GM1028",
            ({ ast, diagnostic }) =>
                correctDataStructureAccessorTokens({ ast, diagnostic })
        ],
        [
            "GM1029",
            ({ ast, diagnostic }) =>
                convertNumericStringArgumentsToNumbers({ ast, diagnostic })
        ],
        [
            "GM1032",
            ({ ast, diagnostic }) =>
                normalizeArgumentBuiltinReferences({ ast, diagnostic })
        ],
        [
            "GM1033",
            ({ ast, sourceText, diagnostic }) =>
                removeDuplicateSemicolons({ ast, sourceText, diagnostic })
        ],
        [
            "GM1030",
            ({ ast, sourceText, diagnostic }) =>
                renameReservedIdentifiers({ ast, diagnostic, sourceText })
        ],
        [
            "GM1034",
            ({ ast, diagnostic }) =>
                relocateArgumentReferencesInsideFunctions({ ast, diagnostic })
        ],
        [
            "GM1036",
            ({ ast, diagnostic }) =>
                normalizeMultidimensionalArrayIndexing({ ast, diagnostic })
        ],
        [
            "GM1038",
            ({ ast, diagnostic }) =>
                removeDuplicateMacroDeclarations({ ast, diagnostic })
        ],
        [
            "GM1051",
            ({ ast, sourceText, diagnostic }) =>
                removeTrailingMacroSemicolons({ ast, sourceText, diagnostic })
        ],
        [
            "GM1016",
            ({ ast, preprocessedFixMetadata, diagnostic }) =>
                removeBooleanLiteralStatements({
                    ast,
                    diagnostic,
                    metadata: preprocessedFixMetadata
                })
        ],
        [
            "GM1041",
            ({ ast, diagnostic }) =>
                convertAssetArgumentStringsToIdentifiers({ ast, diagnostic })
        ],
        [
            "GM1100",
            ({ ast, preprocessedFixMetadata, diagnostic }) =>
                normalizeObviousSyntaxErrors({
                    ast,
                    diagnostic,
                    metadata: preprocessedFixMetadata
                })
        ],
        [
            "GM1058",
            ({ ast, diagnostic }) =>
                ensureConstructorDeclarationsForNewExpressions({
                    ast,
                    diagnostic
                })
        ],
        [
            "GM1054",
            ({ ast, diagnostic }) =>
                ensureConstructorParentsExist({ ast, diagnostic })
        ],
        [
            "GM1059",
            ({ ast, options, diagnostic }) =>
                renameDuplicateFunctionParameters({ ast, diagnostic, options })
        ],
        [
            "GM1062",
            ({ ast, diagnostic }) =>
                sanitizeMalformedJsDocTypes({
                    ast,
                    diagnostic,
                    typeSystemInfo: FEATHER_TYPE_SYSTEM_INFO
                })
        ],
        [
            "GM1056",
            ({ ast, diagnostic }) =>
                reorderOptionalParameters({ ast, diagnostic })
        ],
        [
            "GM1052",
            ({ ast, diagnostic }) =>
                replaceInvalidDeleteStatements({ ast, diagnostic })
        ],
        [
            "GM2020",
            ({ ast, diagnostic }) =>
                convertAllDotAssignmentsToWithStatements({ ast, diagnostic })
        ],
        [
            "GM2032",
            ({ ast, diagnostic }) =>
                ensureFileFindFirstBeforeClose({ ast, diagnostic })
        ],
        [
            "GM2031",
            ({ ast, diagnostic }) =>
                ensureFileFindSearchesAreSerialized({ ast, diagnostic })
        ],
        [
            "GM2023",
            ({ ast, diagnostic }) =>
                normalizeFunctionCallArgumentOrder({ ast, diagnostic })
        ],
        [
            "GM1063",
            ({ ast, diagnostic }) =>
                harmonizeTexturePointerTernaries({ ast, diagnostic })
        ],
        [
            "GM2044",
            ({ ast, diagnostic }) =>
                deduplicateLocalVariableDeclarations({ ast, diagnostic })
        ],
        [
            "GM2048",
            ({ ast, diagnostic }) =>
                ensureBlendEnableIsReset({ ast, diagnostic })
        ],
        [
            "GM2054",
            ({ ast, diagnostic }) =>
                ensureAlphaTestRefIsReset({ ast, diagnostic })
        ],
        [
            "GM2056",
            ({ ast, diagnostic }) =>
                ensureTextureRepeatIsReset({ ast, diagnostic })
        ],
        [
            "GM2064",
            ({ ast, diagnostic }) =>
                annotateInstanceVariableStructAssignments({ ast, diagnostic })
        ]
    ]);
}

function isNonEmptyArray(value) {
    return Array.isArray(value) && value.length > 0;
}

function convertAssetArgumentStringsToIdentifiers({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const entry of node) {
                visit(entry);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const calleeName =
                node.object?.type === "Identifier" ? node.object.name : null;

            if (
                typeof calleeName === "string" &&
                GM1041_CALL_ARGUMENT_TARGETS.has(calleeName)
            ) {
                const argumentIndexes =
                    GM1041_CALL_ARGUMENT_TARGETS.get(calleeName) ?? [];
                const args = Array.isArray(node.arguments)
                    ? node.arguments
                    : [];

                for (const argumentIndex of argumentIndexes) {
                    if (
                        typeof argumentIndex !== "number" ||
                        argumentIndex < 0 ||
                        argumentIndex >= args.length
                    ) {
                        continue;
                    }

                    const fixDetail = convertStringLiteralArgumentToIdentifier({
                        argument: args[argumentIndex],
                        container: args,
                        index: argumentIndex,
                        diagnostic
                    });

                    if (fixDetail) {
                        fixes.push(fixDetail);
                    }
                }
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function convertStringLiteralArgumentToIdentifier({
    argument,
    container,
    index,
    diagnostic
}) {
    if (!Array.isArray(container) || typeof index !== "number") {
        return null;
    }

    if (
        !argument ||
        argument.type !== "Literal" ||
        typeof argument.value !== "string"
    ) {
        return null;
    }

    const identifierName = extractIdentifierNameFromLiteral(argument.value);
    if (!identifierName) {
        return null;
    }

    const identifierNode = {
        type: "Identifier",
        name: identifierName
    };

    if (Object.hasOwn(argument, "start")) {
        identifierNode.start = cloneLocation(argument.start);
    }

    if (Object.hasOwn(argument, "end")) {
        identifierNode.end = cloneLocation(argument.end);
    }

    copyCommentMetadata(argument, identifierNode);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: identifierName,
        range: {
            start: getNodeStartIndex(argument),
            end: getNodeEndIndex(argument)
        }
    });

    if (!fixDetail) {
        return null;
    }

    container[index] = identifierNode;
    attachFeatherFixMetadata(identifierNode, [fixDetail]);

    return fixDetail;
}

function buildFeatherTypeSystemInfo() {
    const metadata = getFeatherMetadata();
    const typeSystem = metadata?.typeSystem;

    const baseTypes = new Set();
    const baseTypesLowercase = new Set();
    const specifierBaseTypes = new Set();

    const entries = Array.isArray(typeSystem?.baseTypes)
        ? typeSystem.baseTypes
        : [];

    for (const entry of entries) {
        const name = typeof entry?.name === "string" ? entry.name.trim() : "";

        if (!name) {
            continue;
        }

        baseTypes.add(name);
        baseTypesLowercase.add(name.toLowerCase());

        const specifierExamples = Array.isArray(entry?.specifierExamples)
            ? entry.specifierExamples
            : [];
        const hasDotSpecifier = specifierExamples.some((example) => {
            if (typeof example !== "string") {
                return false;
            }

            return example.trim().startsWith(".");
        });

        const description =
            typeof entry?.description === "string" ? entry.description : "";
        const requiresSpecifier =
            /requires specifiers/i.test(description) ||
            /constructor/i.test(description);

        if (hasDotSpecifier || requiresSpecifier) {
            specifierBaseTypes.add(name.toLowerCase());
        }
    }

    return {
        baseTypeNames: [...baseTypes],
        baseTypeNamesLower: baseTypesLowercase,
        specifierBaseTypeNamesLower: specifierBaseTypes
    };
}

function registerFeatherFixer(registry, diagnosticId, factory) {
    if (!registry || typeof registry.set !== "function") {
        return;
    }

    if (!diagnosticId || typeof factory !== "function") {
        return;
    }

    if (!registry.has(diagnosticId)) {
        registry.set(diagnosticId, factory);
    }
}

function normalizeArgumentBuiltinReferences({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                visit(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (isFunctionLikeNode(node)) {
            const functionFixes = fixArgumentReferencesWithinFunction(
                node,
                diagnostic
            );

            if (Array.isArray(functionFixes) && functionFixes.length > 0) {
                fixes.push(...functionFixes);
            }

            return;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function fixArgumentReferencesWithinFunction(functionNode, diagnostic) {
    const fixes = [];
    const references = [];

    const traverse = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                traverse(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node !== functionNode && isFunctionLikeNode(node)) {
            const nestedFixes = fixArgumentReferencesWithinFunction(
                node,
                diagnostic
            );

            if (Array.isArray(nestedFixes) && nestedFixes.length > 0) {
                fixes.push(...nestedFixes);
            }

            return;
        }

        const argumentIndex = getArgumentIdentifierIndex(node);

        if (typeof argumentIndex === "number") {
            references.push({ node, index: argumentIndex });
            return;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                traverse(value);
            }
        }
    };

    const body = functionNode?.body;

    if (body && typeof body === "object") {
        traverse(body);
    } else {
        traverse(functionNode);
    }

    if (references.length === 0) {
        return fixes;
    }

    const mapping = createArgumentIndexMapping(
        references.map((reference) => reference.index)
    );

    if (!(mapping instanceof Map) || mapping.size === 0) {
        return fixes;
    }

    const hasChanges = [...mapping.entries()].some(
        ([oldIndex, newIndex]) => oldIndex !== newIndex
    );

    if (!hasChanges) {
        return fixes;
    }

    for (const reference of references) {
        const newIndex = mapping.get(reference.index);

        if (typeof newIndex !== "number" || newIndex === reference.index) {
            continue;
        }

        const newName = `argument${newIndex}`;
        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: newName,
            range: {
                start: getNodeStartIndex(reference.node),
                end: getNodeEndIndex(reference.node)
            }
        });

        if (!fixDetail) {
            continue;
        }

        reference.node.name = newName;
        attachFeatherFixMetadata(reference.node, [fixDetail]);
        fixes.push(fixDetail);
    }

    return fixes;
}

function createArgumentIndexMapping(indices) {
    if (!Array.isArray(indices) || indices.length === 0) {
        return null;
    }

    const uniqueIndices = [
        ...new Set(
            indices.filter((index) => Number.isInteger(index) && index >= 0)
        )
    ].sort((left, right) => left - right);

    if (uniqueIndices.length === 0) {
        return null;
    }

    const mapping = new Map();
    let expectedIndex = 0;

    for (const index of uniqueIndices) {
        if (!Number.isInteger(index) || index < 0) {
            continue;
        }

        if (index === expectedIndex) {
            mapping.set(index, index);
            expectedIndex = index + 1;
            continue;
        }

        if (index > expectedIndex) {
            mapping.set(index, expectedIndex);
            expectedIndex += 1;
            continue;
        }

        mapping.set(index, expectedIndex);
        expectedIndex += 1;
    }

    return mapping;
}

function getArgumentIdentifierIndex(node) {
    if (!node || node.type !== "Identifier") {
        return null;
    }

    const name = node.name;

    if (typeof name !== "string") {
        return null;
    }

    const match = ARGUMENT_IDENTIFIER_PATTERN.exec(name);

    if (!match) {
        return null;
    }

    const parsed = Number.parseInt(match[1], 10);

    if (!Number.isInteger(parsed) || parsed < 0) {
        return null;
    }

    return parsed;
}

function removeDuplicateMacroDeclarations({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const seenMacros = new Set();

    const visit = (node, parent, property) => {
        if (!node) {
            return false;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                const child = node[index];
                const removed = visit(child, node, index);

                if (removed) {
                    index -= 1;
                }
            }

            return false;
        }

        if (typeof node !== "object") {
            return false;
        }

        if (node.type === "MacroDeclaration") {
            const macroName = node.name?.name;

            if (!macroName) {
                return false;
            }

            if (!seenMacros.has(macroName)) {
                seenMacros.add(macroName);
                return false;
            }

            if (!Array.isArray(parent) || typeof property !== "number") {
                return false;
            }

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: macroName,
                range: {
                    start: getNodeStartIndex(node),
                    end: getNodeEndIndex(node)
                }
            });

            if (!fixDetail) {
                return false;
            }

            parent.splice(property, 1);
            fixes.push(fixDetail);

            return true;
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }

        return false;
    };

    visit(ast, null, null);

    return fixes;
}

function replaceDeprecatedBuiltinVariables({ ast, diagnostic }) {
    if (
        !diagnostic ||
        !ast ||
        typeof ast !== "object" ||
        DEPRECATED_BUILTIN_VARIABLE_REPLACEMENTS.size === 0
    ) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property, owner, ownerKey) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index, owner, ownerKey);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "Identifier") {
            const fix = replaceDeprecatedIdentifier(
                node,
                parent,
                property,
                owner,
                ownerKey,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key, node, key);
            }
        }
    };

    visit(ast, null, null, null, null);

    return fixes;
}

function replaceDeprecatedIdentifier(
    node,
    parent,
    property,
    owner,
    ownerKey,
    diagnostic
) {
    if (!node || node.type !== "Identifier") {
        return null;
    }

    const normalizedName =
        typeof node.name === "string" ? node.name.toLowerCase() : null;

    if (!normalizedName || normalizedName.length === 0) {
        return null;
    }

    const replacementEntry =
        getDeprecatedBuiltinReplacementEntry(normalizedName);

    if (!replacementEntry) {
        return null;
    }

    if (
        shouldSkipDeprecatedIdentifierReplacement({
            parent,
            property,
            owner,
            ownerKey
        })
    ) {
        return null;
    }

    const originalName = node.name;
    const replacementName = replacementEntry.replacement;

    if (!replacementName || replacementName === originalName) {
        return null;
    }

    node.name = replacementName;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: replacementEntry.deprecated ?? originalName,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function shouldSkipDeprecatedIdentifierReplacement({
    parent,
    property,
    owner,
    ownerKey
}) {
    if (!parent) {
        return false;
    }

    if (parent.type === "MemberDotExpression" && property === "property") {
        return true;
    }

    if (parent.type === "VariableDeclarator" && property === "id") {
        return true;
    }

    if (parent.type === "MacroDeclaration" && property === "name") {
        return true;
    }

    if (parent.type === "EnumDeclaration" && property === "name") {
        return true;
    }

    if (parent.type === "EnumMember" && property === "name") {
        return true;
    }

    if (Array.isArray(parent)) {
        if (ownerKey === "params") {
            const ownerType = owner?.type;

            if (
                ownerType === "FunctionDeclaration" ||
                ownerType === "FunctionExpression" ||
                ownerType === "ConstructorDeclaration"
            ) {
                return true;
            }
        }
    }

    return false;
}

function buildDeprecatedBuiltinVariableReplacements() {
    const replacements = new Map();
    const diagnostic = getFeatherDiagnosticById("GM1024");

    if (!diagnostic) {
        return replacements;
    }

    const entries = deriveDeprecatedBuiltinVariableReplacementsFromExamples(
        diagnostic.badExample,
        diagnostic.goodExample
    );

    for (const entry of entries) {
        if (!replacements.has(entry.normalized)) {
            replacements.set(entry.normalized, entry);
        }
    }

    return replacements;
}

function deriveDeprecatedBuiltinVariableReplacementsFromExamples(
    badExample,
    goodExample
) {
    const entries = [];
    const badTokens = extractIdentifierTokens(badExample);
    const goodTokens = extractIdentifierTokens(goodExample);

    if (badTokens.length === 0 || goodTokens.length === 0) {
        return entries;
    }

    const goodTokenSet = new Set(goodTokens.map((token) => token.normalized));
    const deprecatedTokens = badTokens.filter(
        (token) => !goodTokenSet.has(token.normalized)
    );

    if (deprecatedTokens.length === 0) {
        return entries;
    }

    const badTokenSet = new Set(badTokens.map((token) => token.normalized));
    const replacementTokens = goodTokens.filter(
        (token) => !badTokenSet.has(token.normalized)
    );

    const pairCount = Math.min(
        deprecatedTokens.length,
        replacementTokens.length
    );

    for (let index = 0; index < pairCount; index += 1) {
        const deprecatedToken = deprecatedTokens[index];
        const replacementToken = replacementTokens[index];

        if (!deprecatedToken || !replacementToken) {
            continue;
        }

        entries.push({
            normalized: deprecatedToken.normalized,
            deprecated: deprecatedToken.token,
            replacement: replacementToken.token
        });
    }

    return entries;
}

function extractIdentifierTokens(text) {
    if (typeof text !== "string" || text.length === 0) {
        return [];
    }

    const matches = text.match(IDENTIFIER_TOKEN_PATTERN) ?? [];
    const tokens = [];
    const seen = new Set();

    for (const match of matches) {
        const normalized = match.toLowerCase();

        if (RESERVED_KEYWORD_TOKENS.has(normalized)) {
            continue;
        }

        if (seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        tokens.push({ token: match, normalized });
    }

    return tokens;
}

function getDeprecatedBuiltinReplacementEntry(name) {
    if (!name) {
        return null;
    }

    return DEPRECATED_BUILTIN_VARIABLE_REPLACEMENTS.get(name) ?? null;
}

function rewriteInvalidPostfixExpressions({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "IncDecStatement") {
            const fix = rewritePostfixStatement(
                node,
                parent,
                property,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function rewritePostfixStatement(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "IncDecStatement" || node.prefix !== false) {
        return null;
    }

    const argument = node.argument;

    if (!argument || typeof argument !== "object") {
        return null;
    }

    const argumentName = getIdentifierName(argument);

    if (
        typeof argumentName === "string" &&
        argumentName.startsWith("__featherFix_")
    ) {
        return null;
    }

    const siblings = parent;
    const temporaryName = createTemporaryIdentifierName(argument, siblings);

    if (!temporaryName) {
        return null;
    }

    const initializer = cloneNode(argument);
    const declarationIdentifier = createIdentifier(temporaryName, argument);

    if (!initializer || !declarationIdentifier) {
        return null;
    }

    const declarator = {
        type: "VariableDeclarator",
        id: declarationIdentifier,
        init: initializer
    };

    if (Object.prototype.hasOwnProperty.call(argument, "start")) {
        declarator.start = cloneLocation(argument.start);
    }

    if (Object.prototype.hasOwnProperty.call(argument, "end")) {
        declarator.end = cloneLocation(argument.end);
    }

    const variableDeclaration = {
        type: "VariableDeclaration",
        declarations: [declarator],
        kind: "var"
    };

    if (Object.prototype.hasOwnProperty.call(node, "start")) {
        variableDeclaration.start = cloneLocation(node.start);
    }

    if (Object.prototype.hasOwnProperty.call(node, "end")) {
        variableDeclaration.end = cloneLocation(node.end);
    }

    const temporaryIdentifier = createIdentifier(temporaryName, argument);

    if (!temporaryIdentifier) {
        return null;
    }

    const rewrittenStatement = {
        type: "IncDecStatement",
        operator: node.operator,
        prefix: node.prefix,
        argument: temporaryIdentifier
    };

    if (Object.prototype.hasOwnProperty.call(node, "start")) {
        rewrittenStatement.start = cloneLocation(node.start);
    }

    if (Object.prototype.hasOwnProperty.call(node, "end")) {
        rewrittenStatement.end = cloneLocation(node.end);
    }

    copyCommentMetadata(node, variableDeclaration);
    copyCommentMetadata(node, rewrittenStatement);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: getIdentifierName(argument),
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    parent.splice(property, 1, variableDeclaration, rewrittenStatement);

    attachFeatherFixMetadata(variableDeclaration, [fixDetail]);
    attachFeatherFixMetadata(rewrittenStatement, [fixDetail]);

    return fixDetail;
}

function normalizeMultidimensionalArrayIndexing({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "MemberIndexExpression") {
            const fix = convertMultidimensionalMemberIndex(
                node,
                parent,
                property,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function convertMultidimensionalMemberIndex(
    node,
    parent,
    property,
    diagnostic
) {
    if (
        !Array.isArray(parent) &&
        (typeof parent !== "object" || parent === null)
    ) {
        return null;
    }

    if (property === undefined || property === null) {
        return null;
    }

    if (!node || node.type !== "MemberIndexExpression") {
        return null;
    }

    const indices = Array.isArray(node.property) ? node.property : null;

    if (node.accessor && node.accessor !== "[") {
        // Non-standard accessors such as '[#' (ds_grid) use comma-separated
        // coordinates rather than nested lookups. Leave them unchanged so the
        // grid access semantics remain intact.
        return null;
    }

    if (!indices || indices.length <= 1) {
        return null;
    }

    const nestedExpression = buildNestedMemberIndexExpression({
        object: node.object,
        indices,
        template: node
    });

    if (!nestedExpression) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: getMemberExpressionRootIdentifier(node) ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    copyCommentMetadata(node, nestedExpression);

    if (Array.isArray(parent)) {
        parent[property] = nestedExpression;
    } else if (typeof parent === "object" && parent !== null) {
        parent[property] = nestedExpression;
    }

    attachFeatherFixMetadata(nestedExpression, [fixDetail]);

    return fixDetail;
}

function buildNestedMemberIndexExpression({ object, indices, template }) {
    if (!object || !Array.isArray(indices) || indices.length === 0) {
        return null;
    }

    const [firstIndex, ...remaining] = indices;
    const accessor = template?.accessor ?? "[";

    let current = {
        type: "MemberIndexExpression",
        object,
        property: [firstIndex],
        accessor
    };

    if (Object.hasOwn(template, "start")) {
        current.start = cloneLocation(template.start);
    }

    if (remaining.length === 0 && Object.hasOwn(template, "end")) {
        current.end = cloneLocation(template.end);
    }

    for (let index = 0; index < remaining.length; index += 1) {
        const propertyNode = remaining[index];

        const next = {
            type: "MemberIndexExpression",
            object: current,
            property: [propertyNode],
            accessor
        };

        if (Object.hasOwn(template, "start")) {
            next.start = cloneLocation(template.start);
        }

        if (index === remaining.length - 1 && Object.hasOwn(template, "end")) {
            next.end = cloneLocation(template.end);
        }

        current = next;
    }

    return current;
}

function removeDuplicateSemicolons({ ast, sourceText, diagnostic }) {
    if (
        !diagnostic ||
        !ast ||
        typeof sourceText !== "string" ||
        sourceText.length === 0
    ) {
        return [];
    }

    const fixes = [];
    const recordedRanges = new Set();

    const recordFix = (container, range) => {
        if (
            !range ||
            typeof range.start !== "number" ||
            typeof range.end !== "number"
        ) {
            return;
        }

        const key = `${range.start}:${range.end}`;
        if (recordedRanges.has(key)) {
            return;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: null,
            range
        });

        if (!fixDetail) {
            return;
        }

        recordedRanges.add(key);
        fixes.push(fixDetail);

        if (container && typeof container === "object") {
            attachFeatherFixMetadata(container, [fixDetail]);
        }
    };

    const processSegment = (container, startIndex, endIndex) => {
        if (typeof startIndex !== "number" || typeof endIndex !== "number") {
            return;
        }

        if (endIndex <= startIndex) {
            return;
        }

        const segment = sourceText.slice(startIndex, endIndex);

        if (!segment || segment.indexOf(";") === -1) {
            return;
        }

        for (const range of findDuplicateSemicolonRanges(segment, startIndex)) {
            recordFix(container, range);
        }
    };

    const processStatementList = (container, statements) => {
        if (!Array.isArray(statements) || statements.length === 0) {
            return;
        }

        const bounds = getStatementListBounds(container, sourceText);

        let previousEnd = bounds.start;

        for (const statement of statements) {
            const statementStart = getNodeStartIndex(statement);
            const statementEnd = getNodeEndIndex(statement);

            if (
                typeof previousEnd === "number" &&
                typeof statementStart === "number"
            ) {
                processSegment(container, previousEnd, statementStart);
            }

            if (typeof statementEnd === "number") {
                previousEnd = statementEnd;
            } else {
                previousEnd = statementStart;
            }
        }

        if (typeof previousEnd === "number" && typeof bounds.end === "number") {
            processSegment(container, previousEnd, bounds.end);
        }
    };

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (Array.isArray(node.body) && node.body.length > 0) {
            processStatementList(node, node.body);
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function getStatementListBounds(node, sourceText) {
    if (!node || typeof sourceText !== "string") {
        return { start: null, end: null };
    }

    let start = getNodeStartIndex(node);
    let end = getNodeEndIndex(node);

    if (node.type === "Program") {
        start = 0;
        end = sourceText.length;
    } else if (node.type === "BlockStatement") {
        if (typeof start === "number" && sourceText[start] === "{") {
            start += 1;
        }

        if (typeof end === "number" && sourceText[end - 1] === "}") {
            end -= 1;
        }
    } else if (node.type === "SwitchCase") {
        if (typeof start === "number") {
            const colonIndex = findCharacterInRange(
                sourceText,
                ":",
                start,
                end
            );

            if (colonIndex !== -1) {
                start = colonIndex + 1;
            }
        }
    }

    return {
        start: typeof start === "number" ? start : null,
        end: typeof end === "number" ? end : null
    };
}

function findCharacterInRange(text, character, start, end) {
    if (typeof start !== "number") {
        return -1;
    }

    const limit = typeof end === "number" ? end : text.length;
    const index = text.indexOf(character, start);

    if (index === -1 || index >= limit) {
        return -1;
    }

    return index;
}

function findDuplicateSemicolonRanges(segment, offset) {
    const ranges = [];

    if (typeof segment !== "string" || segment.length === 0) {
        return ranges;
    }

    let runStart = -1;
    let runLength = 0;
    let inLineComment = false;
    let inBlockComment = false;
    let inString = false;
    let stringDelimiter = null;

    for (let index = 0; index < segment.length; index += 1) {
        const char = segment[index];
        const nextChar = index + 1 < segment.length ? segment[index + 1] : "";

        if (inString) {
            if (char === "\\") {
                index += 1;
                continue;
            }

            if (char === stringDelimiter) {
                inString = false;
                stringDelimiter = null;
            }

            continue;
        }

        if (inLineComment) {
            if (char === "\n" || char === "\r") {
                inLineComment = false;
            }
            continue;
        }

        if (inBlockComment) {
            if (char === "*" && nextChar === "/") {
                inBlockComment = false;
                index += 1;
            }
            continue;
        }

        if (char === "/" && nextChar === "/") {
            inLineComment = true;
            index += 1;
            continue;
        }

        if (char === "/" && nextChar === "*") {
            inBlockComment = true;
            index += 1;
            continue;
        }

        if (char === '"' || char === "'") {
            inString = true;
            stringDelimiter = char;
            continue;
        }

        if (char === ";") {
            if (runStart === -1) {
                runStart = index;
                runLength = 1;
            } else {
                runLength += 1;
            }
            continue;
        }

        if (runStart !== -1 && runLength > 1) {
            ranges.push({
                start: offset + runStart + 1,
                end: offset + runStart + runLength
            });
        }

        runStart = -1;
        runLength = 0;
    }

    if (runStart !== -1 && runLength > 1) {
        ranges.push({
            start: offset + runStart + 1,
            end: offset + runStart + runLength
        });
    }

    return ranges;
}

function getMemberExpressionRootIdentifier(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Identifier") {
        return node.name ?? null;
    }

    if (
        node.type === "MemberDotExpression" ||
        node.type === "MemberIndexExpression"
    ) {
        return getMemberExpressionRootIdentifier(node.object);
    }

    if (node.type === "CallExpression") {
        return getMemberExpressionRootIdentifier(node.object);
    }

    return null;
}

function normalizeObviousSyntaxErrors({ ast, diagnostic, metadata }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const gm1100Entries = Array.isArray(metadata?.GM1100)
        ? metadata.GM1100
        : [];

    if (gm1100Entries.length === 0) {
        return [];
    }

    const nodeIndex = collectGM1100Candidates(ast);
    const handledNodes = new Set();
    const fixes = [];

    for (const entry of gm1100Entries) {
        const lineNumber = entry?.line;

        if (typeof lineNumber !== "number") {
            continue;
        }

        const candidates = nodeIndex.get(lineNumber) ?? [];
        let node = null;

        if (entry.type === "declaration") {
            node =
                candidates.find(
                    (candidate) => candidate?.type === "VariableDeclaration"
                ) ?? null;
        } else if (entry.type === "assignment") {
            node =
                candidates.find(
                    (candidate) => candidate?.type === "AssignmentExpression"
                ) ?? null;
        }

        if (!node || handledNodes.has(node)) {
            continue;
        }

        handledNodes.add(node);

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: entry?.identifier ?? null,
            range: {
                start: getNodeStartIndex(node),
                end: getNodeEndIndex(node)
            }
        });

        if (!fixDetail) {
            continue;
        }

        attachFeatherFixMetadata(node, [fixDetail]);
        fixes.push(fixDetail);
    }

    return fixes;
}

function removeTrailingMacroSemicolons({ ast, sourceText, diagnostic }) {
    if (
        !diagnostic ||
        typeof sourceText !== "string" ||
        sourceText.length === 0
    ) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (node.type === "MacroDeclaration") {
            const fixInfo = sanitizeMacroDeclaration(
                node,
                sourceText,
                diagnostic
            );
            if (fixInfo) {
                fixes.push(fixInfo);
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function removeBooleanLiteralStatements({ ast, diagnostic, metadata }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const gm1016MetadataEntries = extractFeatherPreprocessMetadata(
        metadata,
        "GM1016"
    );

    for (const entry of gm1016MetadataEntries) {
        const range = normalizePreprocessedRange(entry);

        if (!range) {
            continue;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: null,
            range
        });

        if (!fixDetail) {
            continue;
        }

        const owner = findInnermostBlockForRange(
            ast,
            range.start.index,
            range.end.index
        );

        if (owner && owner !== ast) {
            attachFeatherFixMetadata(owner, [fixDetail]);
        }

        fixes.push(fixDetail);
    }

    const arrayOwners = new WeakMap();

    const visitNode = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        for (const value of Object.values(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                arrayOwners.set(value, node);
                visitArray(value);
                continue;
            }

            visitNode(value);
        }
    };

    const visitArray = (array) => {
        if (!Array.isArray(array)) {
            return;
        }

        for (let index = 0; index < array.length; index += 1) {
            const item = array[index];

            if (
                item &&
                typeof item === "object" &&
                item.type === "ExpressionStatement"
            ) {
                const fix = removeBooleanLiteralExpression(item, array, index);

                if (fix) {
                    const owner = arrayOwners.get(array) ?? ast;
                    if (owner !== ast) {
                        attachFeatherFixMetadata(owner, [fix]);
                    }
                    fixes.push(fix);
                    array.splice(index, 1);
                    index -= 1;
                    continue;
                }
            }

            visitNode(item);
        }
    };

    function removeBooleanLiteralExpression(
        node,
        parentArray = null,
        index = -1
    ) {
        if (!parentArray || !Array.isArray(parentArray) || index < 0) {
            return null;
        }

        const expression = node.expression;

        if (!isBooleanLiteral(expression)) {
            return null;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: null,
            range: {
                start: getNodeStartIndex(node),
                end: getNodeEndIndex(node)
            }
        });

        if (!fixDetail) {
            return null;
        }

        return fixDetail;
    }

    visitNode(ast);

    if (fixes.length === 0) {
        return [];
    }

    return fixes;
}

function replaceDeprecatedConstantReferences({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const metadata = extractDeprecatedConstantReplacement(diagnostic);

    if (!metadata) {
        return [];
    }

    const { deprecatedConstant, replacementConstant } = metadata;

    if (!deprecatedConstant || !replacementConstant) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "Identifier" && node.name === deprecatedConstant) {
            const start = getNodeStartIndex(node);
            const end = getNodeEndIndex(node);

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: replacementConstant,
                range:
                    typeof start === "number" && typeof end === "number"
                        ? { start, end }
                        : null
            });

            if (!fixDetail) {
                return;
            }

            node.name = replacementConstant;
            attachFeatherFixMetadata(node, [fixDetail]);
            fixes.push(fixDetail);
            return;
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function extractDeprecatedConstantReplacement(diagnostic) {
    if (!diagnostic) {
        return null;
    }

    const badExample =
        typeof diagnostic.badExample === "string" ? diagnostic.badExample : "";
    const correction =
        typeof diagnostic.correction === "string"
            ? diagnostic.correction
            : "";
    const goodExample =
        typeof diagnostic.goodExample === "string" ? diagnostic.goodExample : "";

    const deprecatedMatch = badExample.match(
        /Constant\s+'([A-Za-z_][A-Za-z0-9_]*)'\s+is\s+deprecated/
    );
    const replacementFromCorrection = correction.match(
        /\b(?:modern|replacement)\s+constant\s+is\s+([A-Za-z_][A-Za-z0-9_]*)\b/i
    );

    let deprecatedConstant = deprecatedMatch?.[1] ?? null;
    let replacementConstant = replacementFromCorrection?.[1] ?? null;

    if (!replacementConstant) {
        const replacementFromGoodExample = findReplacementConstantInExample({
            goodExample,
            badExample,
            deprecatedConstant
        });

        if (replacementFromGoodExample) {
            replacementConstant = replacementFromGoodExample;
        }
    }

    if (!deprecatedConstant) {
        deprecatedConstant = findDeprecatedConstantInExample({
            badExample,
            goodExample,
            replacementConstant
        });
    }

    if (!deprecatedConstant || !replacementConstant) {
        return null;
    }

    return { deprecatedConstant, replacementConstant };
}

function collectIdentifiers(example) {
    if (typeof example !== "string" || example.length === 0) {
        return new Set();
    }

    const matches = example.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g);

    if (!Array.isArray(matches)) {
        return new Set();
    }

    return new Set(matches);
}

function isLikelyConstant(identifier) {
    if (typeof identifier !== "string" || identifier.length === 0) {
        return false;
    }

    if (/^[A-Z0-9_]+$/.test(identifier)) {
        return true;
    }

    if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(identifier)) {
        return true;
    }

    return false;
}

function findReplacementConstantInExample({
    goodExample,
    badExample,
    deprecatedConstant
}) {
    const goodIdentifiers = collectIdentifiers(goodExample);
    const badIdentifiers = collectIdentifiers(badExample);

    for (const identifier of goodIdentifiers) {
        if (identifier === deprecatedConstant) {
            continue;
        }

        if (badIdentifiers.has(identifier)) {
            continue;
        }

        if (isLikelyConstant(identifier)) {
            return identifier;
        }
    }

    return null;
}

function findDeprecatedConstantInExample({
    badExample,
    goodExample,
    replacementConstant
}) {
    const badIdentifiers = collectIdentifiers(badExample);
    const goodIdentifiers = collectIdentifiers(goodExample);

    for (const identifier of badIdentifiers) {
        if (identifier === replacementConstant) {
            continue;
        }

        if (goodIdentifiers.has(identifier)) {
            continue;
        }

        if (isLikelyConstant(identifier)) {
            return identifier;
        }
    }

    return null;
}

function extractFeatherPreprocessMetadata(metadata, key) {
    if (!metadata || typeof metadata !== "object") {
        return [];
    }

    const entries = metadata[key];

    return Array.isArray(entries) ? entries.filter(Boolean) : [];
}

function normalizePreprocessedRange(entry) {
    const startIndex = entry?.start?.index;
    const endIndex = entry?.end?.index;

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    if (endIndex < startIndex) {
        return null;
    }

    const startLine = entry?.start?.line;
    const endLine = entry?.end?.line;

    const startLocation = { index: startIndex };
    const endLocation = { index: endIndex };

    if (typeof startLine === "number") {
        startLocation.line = startLine;
    }

    if (typeof endLine === "number") {
        endLocation.line = endLine;
    }

    return { start: startLocation, end: endLocation };
}

function findInnermostBlockForRange(ast, startIndex, endIndex) {
    if (!ast || typeof ast !== "object") {
        return null;
    }

    let bestMatch = null;

    const visit = (node) => {
        if (!node || typeof node !== "object") {
            return;
        }

        const nodeStart = getNodeStartIndex(node);
        const nodeEnd = getNodeEndIndex(node);

        if (
            typeof nodeStart !== "number" ||
            typeof nodeEnd !== "number" ||
            nodeStart > startIndex ||
            nodeEnd < endIndex
        ) {
            return;
        }

        if (node.type === "BlockStatement") {
            if (!bestMatch) {
                bestMatch = node;
            } else {
                const bestStart = getNodeStartIndex(bestMatch);
                const bestEnd = getNodeEndIndex(bestMatch);

                if (
                    typeof bestStart === "number" &&
                    typeof bestEnd === "number" &&
                    (nodeStart > bestStart || nodeEnd < bestEnd)
                ) {
                    bestMatch = node;
                }
            }
        }

        for (const value of Object.values(node)) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    visit(item);
                }
                continue;
            }

            visit(value);
        }
    };

    visit(ast);

    return bestMatch;
}

function isBooleanLiteral(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type !== "Literal") {
        return false;
    }

    return (
        node.value === true ||
        node.value === false ||
        node.value === "true" ||
        node.value === "false"
    );
}

function sanitizeMacroDeclaration(node, sourceText, diagnostic) {
    if (!node || typeof node !== "object") {
        return null;
    }

    const tokens = Array.isArray(node.tokens) ? node.tokens : null;
    if (!tokens || tokens.length === 0) {
        return null;
    }

    const lastToken = tokens[tokens.length - 1];
    if (lastToken !== ";") {
        return null;
    }

    const startIndex = node.start?.index;
    const endIndex = node.end?.index;

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    const originalText = sourceText.slice(startIndex, endIndex + 1);

    // Only strip semicolons that appear at the end of the macro definition.
    const sanitizedText = originalText.replace(
        TRAILING_MACRO_SEMICOLON_PATTERN,
        ""
    );

    if (sanitizedText === originalText) {
        return null;
    }

    node.tokens = tokens.slice(0, tokens.length - 1);
    node._featherMacroText = sanitizedText;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.name?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function convertNumericStringArgumentsToNumbers({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const args = Array.isArray(node.arguments) ? node.arguments : [];

            for (const argument of args) {
                const fix = convertNumericStringLiteral(argument, diagnostic);

                if (fix) {
                    fixes.push(fix);
                }
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function convertNumericStringLiteral(argument, diagnostic) {
    const literal = extractLiteral(argument);

    if (!literal) {
        return null;
    }

    const rawValue = literal.value;

    if (typeof rawValue !== "string" || rawValue.length < 2) {
        return null;
    }

    if (!rawValue.startsWith('"') || !rawValue.endsWith('"')) {
        return null;
    }

    const numericText = rawValue.slice(1, -1);

    if (!NUMERIC_STRING_LITERAL_PATTERN.test(numericText)) {
        return null;
    }

    literal.value = numericText;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: numericText,
        range: {
            start: getNodeStartIndex(literal),
            end: getNodeEndIndex(literal)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(literal, [fixDetail]);

    return fixDetail;
}

function extractLiteral(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Literal") {
        return node;
    }

    if (node.type === "ParenthesizedExpression") {
        return extractLiteral(node.expression);
    }

    return null;
}

function ensureConstructorDeclarationsForNewExpressions({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const functionDeclarations = new Map();

    const collectFunctions = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                collectFunctions(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "FunctionDeclaration") {
            const functionName =
                typeof node.id === "string" && node.id.length > 0
                    ? node.id
                    : null;

            if (functionName && !functionDeclarations.has(functionName)) {
                functionDeclarations.set(functionName, node);
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                collectFunctions(value);
            }
        }
    };

    collectFunctions(ast);

    if (functionDeclarations.size === 0) {
        return [];
    }

    const convertedFunctions = new Set();

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "NewExpression") {
            const expression = node.expression;
            const constructorName =
                expression?.type === "Identifier" &&
                typeof expression.name === "string"
                    ? expression.name
                    : null;

            if (constructorName) {
                const functionNode = functionDeclarations.get(constructorName);

                if (
                    functionNode &&
                    functionNode.type === "FunctionDeclaration" &&
                    !convertedFunctions.has(functionNode)
                ) {
                    const fix = convertFunctionDeclarationToConstructor(
                        functionNode,
                        diagnostic
                    );

                    if (fix) {
                        fixes.push(fix);
                        convertedFunctions.add(functionNode);
                    }
                }
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function convertFunctionDeclarationToConstructor(functionNode, diagnostic) {
    if (!functionNode || functionNode.type !== "FunctionDeclaration") {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: typeof functionNode.id === "string" ? functionNode.id : null,
        range: {
            start: getNodeStartIndex(functionNode),
            end: getNodeEndIndex(functionNode)
        }
    });

    if (!fixDetail) {
        return null;
    }

    functionNode.type = "ConstructorDeclaration";

    if (!Object.hasOwn(functionNode, "parent")) {
        functionNode.parent = null;
    }

    attachFeatherFixMetadata(functionNode, [fixDetail]);

    return fixDetail;
}

function deduplicateLocalVariableDeclarations({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const scopeStack = [];

    const pushScope = (initialNames = []) => {
        const scope = new Map();

        if (Array.isArray(initialNames)) {
            for (const name of initialNames) {
                if (typeof name === "string" && name.length > 0) {
                    scope.set(name, true);
                }
            }
        }

        scopeStack.push(scope);
    };

    const popScope = () => {
        scopeStack.pop();
    };

    const declareLocal = (name) => {
        if (typeof name !== "string" || name.length === 0) {
            return true;
        }

        const scope = scopeStack[scopeStack.length - 1];

        if (!scope) {
            return true;
        }

        if (scope.has(name)) {
            return false;
        }

        scope.set(name, true);
        return true;
    };

    const handleVariableDeclaration = (node, parent, property) => {
        const declarations = Array.isArray(node.declarations)
            ? node.declarations
            : [];

        if (declarations.length === 0) {
            return [];
        }

        const retained = [];
        const duplicates = [];

        for (const declarator of declarations) {
            if (!declarator || typeof declarator !== "object") {
                retained.push(declarator);
                continue;
            }

            const name = getVariableDeclaratorName(declarator);

            if (!name) {
                retained.push(declarator);
                continue;
            }

            const isNewDeclaration = declareLocal(name);

            if (isNewDeclaration) {
                retained.push(declarator);
                continue;
            }

            duplicates.push(declarator);
        }

        if (duplicates.length === 0) {
            return [];
        }

        if (!Array.isArray(parent) || typeof property !== "number") {
            return [];
        }

        const fixDetails = [];
        const assignments = [];

        for (const declarator of duplicates) {
            const name = getVariableDeclaratorName(declarator);

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: name,
                range: {
                    start: getNodeStartIndex(declarator),
                    end: getNodeEndIndex(declarator)
                }
            });

            if (!fixDetail) {
                continue;
            }

            const assignment = createAssignmentFromDeclarator(declarator, node);

            if (assignment) {
                attachFeatherFixMetadata(assignment, [fixDetail]);
                assignments.push(assignment);
            }

            fixDetails.push(fixDetail);
        }

        if (fixDetails.length === 0) {
            return [];
        }

        node.declarations = retained;

        if (retained.length === 0) {
            if (assignments.length > 0) {
                parent.splice(property, 1, ...assignments);
            } else {
                parent.splice(property, 1);
            }
        } else if (assignments.length > 0) {
            parent.splice(property + 1, 0, ...assignments);
        }

        if (retained.length > 0) {
            attachFeatherFixMetadata(node, fixDetails);
        }

        return fixDetails;
    };

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                const initialLength = node.length;
                visit(node[index], node, index);

                if (node.length < initialLength) {
                    index -= 1;
                }
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (isFunctionLikeNode(node)) {
            const paramNames = getFunctionParameterNames(node);

            pushScope(paramNames);

            const params = Array.isArray(node.params) ? node.params : [];
            for (const param of params) {
                visit(param, node, "params");
            }

            visit(node.body, node, "body");
            popScope();
            return;
        }

        if (node.type === "VariableDeclaration" && node.kind === "var") {
            const fixDetails = handleVariableDeclaration(
                node,
                parent,
                property
            );

            if (Array.isArray(fixDetails) && fixDetails.length > 0) {
                fixes.push(...fixDetails);
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (key === "body" && isFunctionLikeNode(node)) {
                continue;
            }

            if (!value || typeof value !== "object") {
                continue;
            }

            visit(value, node, key);
        }
    };

    pushScope();
    visit(ast, null, null);
    popScope();

    return fixes;
}

function renameDuplicateFunctionParameters({ ast, diagnostic, options }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            node.forEach(visit);
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (
            node.type === "FunctionDeclaration" ||
            node.type === "ConstructorDeclaration"
        ) {
            const functionFixes = renameDuplicateParametersInFunction(
                node,
                diagnostic,
                options
            );
            if (Array.isArray(functionFixes) && functionFixes.length > 0) {
                fixes.push(...functionFixes);
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function renameDuplicateParametersInFunction(functionNode, diagnostic) {
    const params = Array.isArray(functionNode?.params)
        ? functionNode.params
        : [];

    if (params.length === 0) {
        return [];
    }

    const fixes = [];
    const seenNames = new Set();

    for (let index = 0; index < params.length; index += 1) {
        const param = params[index];
        const identifier = getFunctionParameterIdentifier(param);

        const hasIdentifier =
            identifier &&
            typeof identifier.name === "string" &&
            identifier.name.length > 0;

        if (!hasIdentifier) {
            continue;
        }

        const originalName = identifier.name;

        if (!seenNames.has(originalName)) {
            seenNames.add(originalName);
            continue;
        }

        const range = {
            start: getNodeStartIndex(identifier),
            end: getNodeEndIndex(identifier)
        };

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: originalName,
            range
        });

        if (fixDetail) {
            attachFeatherFixMetadata(functionNode, [fixDetail]);
            fixes.push(fixDetail);
        }

        params.splice(index, 1);
        index -= 1;
    }

    return fixes;
}

function getFunctionParameterIdentifier(param) {
    if (!param || typeof param !== "object") {
        return null;
    }

    if (param.type === "Identifier") {
        return param;
    }

    if (
        param.type === "DefaultParameter" &&
        param.left?.type === "Identifier"
    ) {
        return param.left;
    }

    if (
        param.type === "RestParameter" &&
        param.argument?.type === "Identifier"
    ) {
        return param.argument;
    }

    return null;
}

function replaceInvalidDeleteStatements({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "DeleteStatement") {
            const fix = convertDeleteStatementToUndefinedAssignment(
                node,
                parent,
                property,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function convertDeleteStatementToUndefinedAssignment(
    node,
    parent,
    property,
    diagnostic
) {
    if (!node || node.type !== "DeleteStatement" || !diagnostic) {
        return null;
    }

    if (!isValidDeleteTarget(node.argument)) {
        return null;
    }

    const targetName = getDeleteTargetName(node.argument);
    const assignment = {
        type: "AssignmentExpression",
        operator: "=",
        left: node.argument,
        right: createLiteral("undefined"),
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    copyCommentMetadata(node, assignment);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: targetName,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    if (!replaceNodeInParent(parent, property, assignment)) {
        return null;
    }

    attachFeatherFixMetadata(assignment, [fixDetail]);

    return fixDetail;
}

function isValidDeleteTarget(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (isIdentifierNode(node)) {
        return true;
    }

    return ALLOWED_DELETE_MEMBER_TYPES.has(node.type);
}

function isIdentifierNode(node) {
    return (
        node &&
        node.type === "Identifier" &&
        typeof node.name === "string" &&
        node.name.length > 0
    );
}

function getDeleteTargetName(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (isIdentifierNode(node)) {
        return node.name;
    }

    if (node.type === "MemberDotExpression") {
        return node.property?.name ?? null;
    }

    return null;
}

function replaceNodeInParent(parent, property, replacement) {
    if (Array.isArray(parent)) {
        if (
            typeof property !== "number" ||
            property < 0 ||
            property >= parent.length
        ) {
            return false;
        }

        parent[property] = replacement;
        return true;
    }

    if (parent && typeof parent === "object" && property != null) {
        parent[property] = replacement;
        return true;
    }

    return false;
}

function convertAllDotAssignmentsToWithStatements({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "AssignmentExpression") {
            const fix = convertAllAssignment(
                node,
                parent,
                property,
                diagnostic
            );
            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function normalizeFunctionCallArgumentOrder({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const state = {
        counter: 0
    };

    const visit = (node, parent, property, ancestors) => {
        if (!node) {
            return;
        }

        const nextAncestors = Array.isArray(ancestors)
            ? ancestors.concat([{ node, parent, property }])
            : [{ node, parent, property }];

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index, nextAncestors);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key, nextAncestors);
            }
        }

        if (node.type === "CallExpression") {
            const fix = normalizeCallExpressionArguments({
                node,
                parent,
                property,
                diagnostic,
                ancestors: nextAncestors,
                state
            });

            if (fix) {
                fixes.push(fix);
            }
        }
    };

    visit(ast, null, null, []);

    return fixes;
}

function normalizeCallExpressionArguments({
    node,
    parent,
    property,
    diagnostic,
    ancestors,
    state
}) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];
    if (args.length === 0) {
        return null;
    }

    const callArgumentInfos = [];

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];

        if (!argument || argument.type !== "CallExpression") {
            continue;
        }

        callArgumentInfos.push({
            argument,
            index
        });
    }

    if (callArgumentInfos.length < 2) {
        return null;
    }

    const statementContext = findStatementContext(ancestors);

    if (!statementContext) {
        return null;
    }

    const temporaryDeclarations = [];

    for (const { argument, index } of callArgumentInfos) {
        const tempName = buildTemporaryIdentifierName(state);
        const tempIdentifier = createIdentifier(tempName, argument);

        if (!tempIdentifier) {
            continue;
        }

        const declaration = createTemporaryVariableDeclaration(
            tempName,
            argument
        );

        if (!declaration) {
            continue;
        }

        temporaryDeclarations.push({
            declaration,
            index,
            identifier: tempIdentifier
        });
    }

    if (temporaryDeclarations.length !== callArgumentInfos.length) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.object?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    for (const { declaration, index, identifier } of temporaryDeclarations) {
        node.arguments[index] = createIdentifier(identifier.name, identifier);
    }

    statementContext.statements.splice(
        statementContext.index,
        0,
        ...temporaryDeclarations.map(({ declaration }) => declaration)
    );

    for (const { declaration } of temporaryDeclarations) {
        attachFeatherFixMetadata(declaration, [fixDetail]);
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function buildTemporaryIdentifierName(state) {
    if (!state || typeof state !== "object") {
        return "__feather_call_arg_0";
    }

    const nextIndex = typeof state.counter === "number" ? state.counter : 0;
    state.counter = nextIndex + 1;

    return `__feather_call_arg_${nextIndex}`;
}

function createTemporaryVariableDeclaration(name, init) {
    if (!name || !init || typeof init !== "object") {
        return null;
    }

    const id = createIdentifier(name, init);

    if (!id) {
        return null;
    }

    const declarator = {
        type: "VariableDeclarator",
        id,
        init,
        start: cloneLocation(init.start),
        end: cloneLocation(init.end)
    };

    const declaration = {
        type: "VariableDeclaration",
        declarations: [declarator],
        kind: "var",
        start: cloneLocation(init.start),
        end: cloneLocation(init.end)
    };

    return declaration;
}

function findStatementContext(ancestors) {
    if (!Array.isArray(ancestors)) {
        return null;
    }

    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        const entry = ancestors[index];

        if (
            !entry ||
            !Array.isArray(entry.parent) ||
            typeof entry.property !== "number"
        ) {
            continue;
        }

        const arrayAncestor = ancestors[index - 1];

        if (!arrayAncestor) {
            continue;
        }

        if (!isStatementArray(arrayAncestor)) {
            continue;
        }

        return {
            statements: entry.parent,
            index: entry.property
        };
    }

    return null;
}

function isStatementArray(entry) {
    if (!entry || !Array.isArray(entry.node)) {
        return false;
    }

    const owner = entry.parent;
    const propertyName = entry.property;

    if (!owner || typeof propertyName !== "string") {
        return false;
    }

    if (propertyName !== "body") {
        return false;
    }

    const parentType = owner?.type;

    return (
        parentType === "Program" ||
        parentType === "BlockStatement" ||
        parentType === "SwitchCase"
    );
}

function convertAllAssignment(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (
        !node ||
        node.type !== "AssignmentExpression" ||
        node.operator !== "="
    ) {
        return null;
    }

    const member = node.left;
    if (!member || member.type !== "MemberDotExpression") {
        return null;
    }

    const object = member.object;
    if (!object || object.type !== "Identifier" || object.name !== "all") {
        return null;
    }

    const propertyIdentifier = member.property;
    if (!propertyIdentifier || propertyIdentifier.type !== "Identifier") {
        return null;
    }

    const normalizedAssignment = {
        type: "AssignmentExpression",
        operator: node.operator,
        left: cloneIdentifier(propertyIdentifier),
        right: node.right,
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    const blockStatement = {
        type: "BlockStatement",
        body: [normalizedAssignment],
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    const parenthesizedExpression = {
        type: "ParenthesizedExpression",
        expression: cloneIdentifier(object),
        start: cloneLocation(object?.start ?? node.start),
        end: cloneLocation(object?.end ?? node.end)
    };

    const withStatement = {
        type: "WithStatement",
        test: parenthesizedExpression,
        body: blockStatement,
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    copyCommentMetadata(node, withStatement);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: propertyIdentifier?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    parent[property] = withStatement;
    attachFeatherFixMetadata(withStatement, [fixDetail]);

    return fixDetail;
}

function ensureBlendEnableIsReset({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureBlendEnableResetAfterCall(
                node,
                parent,
                property,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureBlendEnableResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_blendenable")) {
        return null;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (args.length === 0) {
        return null;
    }

    if (!shouldResetBlendEnable(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = siblings.length;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isBlendEnableResetCall(sibling)) {
            return null;
        }

        if (!isTriviallyIgnorableStatement(sibling)) {
            insertionIndex = index + 1;
            break;
        }
    }

    const resetCall = createBlendEnableResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.object?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const needsSeparator =
        !isAlphaTestDisableCall(nextSibling) &&
        !nextSibling &&
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling);

    if (needsSeparator) {
        siblings.splice(
            insertionIndex,
            0,
            createEmptyStatementLike(previousSibling)
        );
        insertionIndex += 1;
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureFileFindFirstBeforeClose({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureFileFindFirstBeforeCloseCall(
                node,
                parent,
                property,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureFileFindFirstBeforeCloseCall(
    node,
    parent,
    property,
    diagnostic
) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "file_find_close")) {
        return null;
    }

    const diagnosticMetadata = Array.isArray(node._appliedFeatherDiagnostics)
        ? node._appliedFeatherDiagnostics
        : [];

    const insertedForSerializedSearch = diagnosticMetadata.some(
        (entry) => entry?.id === "GM2031"
    );

    if (insertedForSerializedSearch) {
        return null;
    }

    const siblings = parent;

    for (let index = property - 1; index >= 0; index -= 1) {
        const sibling = siblings[index];

        if (!sibling) {
            continue;
        }

        if (containsFileFindFirstCall(sibling)) {
            return null;
        }
    }

    const fileFindFirstCall = createFileFindFirstCall(node);

    if (!fileFindFirstCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.object?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    siblings.splice(property, 0, fileFindFirstCall);
    attachFeatherFixMetadata(fileFindFirstCall, [fixDetail]);

    return fixDetail;
}

function containsFileFindFirstCall(node) {
    if (!node) {
        return false;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            if (containsFileFindFirstCall(item)) {
                return true;
            }
        }
        return false;
    }

    if (typeof node !== "object") {
        return false;
    }

    if (
        node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression"
    ) {
        return false;
    }

    if (
        node.type === "CallExpression" &&
        isIdentifierWithName(node.object, "file_find_first")
    ) {
        return true;
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object") {
            if (containsFileFindFirstCall(value)) {
                return true;
            }
        }
    }

    return false;
}

function createFileFindFirstCall(template) {
    const identifier = createIdentifier("file_find_first", template?.object);

    if (!identifier) {
        return null;
    }

    const searchPattern = createLiteral('""', null);
    const attributes = createIdentifier("fa_none", null);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: []
    };

    if (searchPattern) {
        callExpression.arguments.push(searchPattern);
    }

    if (attributes) {
        callExpression.arguments.push(attributes);
    }

    if (Object.hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function ensureAlphaTestRefIsReset({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureAlphaTestRefResetAfterCall(
                node,
                parent,
                property,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureConstructorParentsExist({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const constructors = new Map();
    const functions = new Map();

    const collect = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const entry of node) {
                collect(entry);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (
            node.type === "ConstructorDeclaration" &&
            typeof node.id === "string"
        ) {
            if (!constructors.has(node.id)) {
                constructors.set(node.id, node);
            }
        } else if (
            node.type === "FunctionDeclaration" &&
            typeof node.id === "string"
        ) {
            if (!functions.has(node.id)) {
                functions.set(node.id, node);
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                collect(value);
            }
        }
    };

    collect(ast);

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const entry of node) {
                visit(entry);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "ConstructorDeclaration") {
            const parentClause = node.parent;

            if (parentClause && typeof parentClause === "object") {
                const parentName = parentClause.id;

                if (typeof parentName === "string" && parentName.length > 0) {
                    if (!constructors.has(parentName)) {
                        const fallback = functions.get(parentName);

                        if (
                            fallback &&
                            fallback.type === "FunctionDeclaration"
                        ) {
                            fallback.type = "ConstructorDeclaration";

                            if (!Object.hasOwn(fallback, "parent")) {
                                fallback.parent = null;
                            }

                            constructors.set(parentName, fallback);
                            functions.delete(parentName);

                            const fixDetail = createFeatherFixDetail(
                                diagnostic,
                                {
                                    target: parentName,
                                    range: {
                                        start: getNodeStartIndex(fallback),
                                        end: getNodeEndIndex(fallback)
                                    }
                                }
                            );

                            if (fixDetail) {
                                attachFeatherFixMetadata(fallback, [fixDetail]);
                                fixes.push(fixDetail);
                            }
                        } else {
                            const fixDetail = createFeatherFixDetail(
                                diagnostic,
                                {
                                    target: parentName,
                                    range: {
                                        start: getNodeStartIndex(parentClause),
                                        end: getNodeEndIndex(parentClause)
                                    }
                                }
                            );

                            if (fixDetail) {
                                node.parent = null;
                                attachFeatherFixMetadata(node, [fixDetail]);
                                fixes.push(fixDetail);
                            }
                        }
                    }
                }
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function ensureAlphaTestRefResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_alphatestref")) {
        return null;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (args.length === 0) {
        return null;
    }

    if (isLiteralZero(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = siblings.length;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isAlphaTestRefResetCall(sibling)) {
            return null;
        }

        if (isAlphaTestDisableCall(sibling)) {
            insertionIndex = index;
            break;
        }
    }

    const resetCall = createAlphaTestRefResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.object?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const shouldInsertSeparator =
        !nextSibling &&
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling) &&
        !isAlphaTestDisableCall(nextSibling);

    if (shouldInsertSeparator) {
        siblings.splice(
            insertionIndex,
            0,
            createEmptyStatementLike(previousSibling)
        );
        insertionIndex += 1;
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureTextureRepeatIsReset({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const fix = ensureTextureRepeatResetAfterCall(
                node,
                parent,
                property,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function ensureTextureRepeatResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_texrepeat")) {
        return null;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (args.length === 0) {
        return null;
    }

    if (!shouldResetTextureRepeat(args[0])) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = siblings.length;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isTextureRepeatResetCall(sibling)) {
            return null;
        }

        if (!isTriviallyIgnorableStatement(sibling)) {
            insertionIndex = index + 1;
            break;
        }
    }

    const resetCall = createTextureRepeatResetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.object?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const needsSeparator =
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling);

    if (needsSeparator) {
        siblings.splice(
            insertionIndex,
            0,
            createEmptyStatementLike(previousSibling)
        );
        insertionIndex += 1;
    }

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function isTriviallyIgnorableStatement(node) {
    if (!node || typeof node !== "object") {
        return true;
    }

    if (node.type === "EmptyStatement") {
        return true;
    }

    if (Array.isArray(node)) {
        return node.length === 0;
    }

    return false;
}

function createEmptyStatementLike(template) {
    const empty = { type: "EmptyStatement" };

    if (template && typeof template === "object") {
        if (Object.hasOwn(template, "start")) {
            empty.start = cloneLocation(template.start);
        }

        if (Object.hasOwn(template, "end")) {
            empty.end = cloneLocation(template.end);
        }
    }

    return empty;
}

function hasOriginalBlankLineBetween(beforeNode, afterNode) {
    const beforeEndLine =
        typeof beforeNode?.end?.line === "number" ? beforeNode.end.line : null;
    const afterStartLine =
        typeof afterNode?.start?.line === "number"
            ? afterNode.start.line
            : null;

    if (beforeEndLine == null || afterStartLine == null) {
        return false;
    }

    return afterStartLine > beforeEndLine + 1;
}

function correctDataStructureAccessorTokens({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const accessorReplacement =
        getAccessorReplacementFromDiagnostic(diagnostic);

    if (!accessorReplacement) {
        return [];
    }

    const { incorrectAccessor, correctAccessor } = accessorReplacement;

    if (incorrectAccessor === correctAccessor) {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "MemberIndexExpression") {
            const fix = updateMemberIndexAccessor(node, {
                incorrectAccessor,
                correctAccessor,
                diagnostic
            });

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

function updateMemberIndexAccessor(
    node,
    { incorrectAccessor, correctAccessor, diagnostic }
) {
    if (!node || node.type !== "MemberIndexExpression") {
        return null;
    }

    if (
        typeof incorrectAccessor !== "string" ||
        typeof correctAccessor !== "string"
    ) {
        return null;
    }

    if (node.accessor !== incorrectAccessor) {
        return null;
    }

    node.accessor = correctAccessor;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: typeof node.object?.name === "string" ? node.object.name : null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function getAccessorReplacementFromDiagnostic(diagnostic) {
    if (!diagnostic) {
        return null;
    }

    const incorrectAccessor = extractAccessorFromExample(diagnostic.badExample);
    const correctAccessor = extractAccessorFromExample(diagnostic.goodExample);

    if (!incorrectAccessor || !correctAccessor) {
        return null;
    }

    if (incorrectAccessor === correctAccessor) {
        return null;
    }

    return { incorrectAccessor, correctAccessor };
}

function extractAccessorFromExample(example) {
    if (typeof example !== "string" || example.length === 0) {
        return null;
    }

    for (const token of DATA_STRUCTURE_ACCESSOR_TOKENS) {
        const search = `[${token}`;

        if (example.includes(search)) {
            return search;
        }
    }

    return null;
}

function ensureFileFindSearchesAreSerialized({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const state = createFileFindState();

    processStatementBlock(getProgramStatements(ast), state);

    return fixes;

    function processStatementBlock(statements, currentState) {
        if (
            !Array.isArray(statements) ||
            statements.length === 0 ||
            !currentState
        ) {
            return;
        }

        let index = 0;

        while (index < statements.length) {
            const statement = statements[index];

            if (isFileFindCloseStatement(statement)) {
                currentState.openCount = Math.max(
                    currentState.openCount - 1,
                    0
                );
                index += 1;
                continue;
            }

            const callNode = getFileFindFirstCallFromStatement(statement);

            if (callNode && currentState.openCount > 0) {
                const insertion = insertFileFindCloseBefore(
                    statements,
                    index,
                    callNode
                );

                if (insertion?.fixDetail) {
                    fixes.push(insertion.fixDetail);
                    currentState.openCount = Math.max(
                        currentState.openCount - 1,
                        0
                    );
                    index += insertion.insertedBefore;
                    continue;
                }
            }

            if (callNode) {
                currentState.openCount += 1;
            }

            handleNestedStatements(statement, currentState);
            index += 1;
        }
    }

    function handleNestedStatements(statement, currentState) {
        if (!statement || typeof statement !== "object" || !currentState) {
            return;
        }

        switch (statement.type) {
            case "BlockStatement": {
                processStatementBlock(statement.body ?? [], currentState);
                break;
            }
            case "IfStatement": {
                processBranch(statement, "consequent", currentState);

                if (statement.alternate) {
                    processBranch(statement, "alternate", currentState);
                }

                break;
            }
            case "WhileStatement":
            case "RepeatStatement":
            case "DoWhileStatement":
            case "ForStatement": {
                processBranch(statement, "body", currentState);
                break;
            }
            case "SwitchStatement": {
                const cases = Array.isArray(statement.cases)
                    ? statement.cases
                    : [];

                for (const caseClause of cases) {
                    const branchState = cloneFileFindState(currentState);
                    processStatementBlock(
                        caseClause?.consequent ?? [],
                        branchState
                    );
                }
                break;
            }
            case "TryStatement": {
                if (statement.block) {
                    processStatementBlock(
                        statement.block.body ?? [],
                        currentState
                    );
                }

                if (statement.handler) {
                    processBranch(statement.handler, "body", currentState);
                }

                if (statement.finalizer) {
                    processStatementBlock(
                        statement.finalizer.body ?? [],
                        currentState
                    );
                }
                break;
            }
            default:
                break;
        }
    }

    function processBranch(parent, key, currentState) {
        if (!parent || typeof parent !== "object" || !currentState) {
            return;
        }

        const statements = getBranchStatements(parent, key);

        if (!statements) {
            return;
        }

        const branchState = cloneFileFindState(currentState);
        processStatementBlock(statements, branchState);
    }

    function getBranchStatements(parent, key) {
        if (!parent || typeof parent !== "object" || !key) {
            return null;
        }

        let target = parent[key];

        if (!target) {
            return null;
        }

        if (target.type !== "BlockStatement") {
            target = ensureBlockStatement(parent, key, target);
        }

        if (!target || target.type !== "BlockStatement") {
            return null;
        }

        return Array.isArray(target.body) ? target.body : [];
    }

    function insertFileFindCloseBefore(statements, index, callNode) {
        if (!Array.isArray(statements) || typeof index !== "number") {
            return null;
        }

        const closeCall = createFileFindCloseCall(callNode);

        if (!closeCall) {
            return null;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: callNode?.object?.name ?? null,
            range: {
                start: getNodeStartIndex(callNode),
                end: getNodeEndIndex(callNode)
            }
        });

        if (!fixDetail) {
            return null;
        }

        attachFeatherFixMetadata(closeCall, [fixDetail]);
        statements.splice(index, 0, closeCall);

        return {
            fixDetail,
            insertedBefore: 1
        };
    }

    function getFileFindFirstCallFromStatement(statement) {
        if (!statement || typeof statement !== "object") {
            return null;
        }

        switch (statement.type) {
            case "CallExpression":
                return isIdentifierWithName(statement.object, "file_find_first")
                    ? statement
                    : null;
            case "AssignmentExpression":
                return getFileFindFirstCallFromExpression(statement.right);
            case "VariableDeclaration": {
                const declarations = Array.isArray(statement.declarations)
                    ? statement.declarations
                    : [];

                for (const declarator of declarations) {
                    const call = getFileFindFirstCallFromExpression(
                        declarator?.init
                    );
                    if (call) {
                        return call;
                    }
                }
                return null;
            }
            case "ReturnStatement":
            case "ThrowStatement":
                return getFileFindFirstCallFromExpression(statement.argument);
            case "ExpressionStatement":
                return getFileFindFirstCallFromExpression(statement.expression);
            default:
                return null;
        }
    }

    function getFileFindFirstCallFromExpression(expression) {
        if (!expression || typeof expression !== "object") {
            return null;
        }

        if (expression.type === "CallExpression") {
            return isIdentifierWithName(expression.object, "file_find_first")
                ? expression
                : null;
        }

        if (expression.type === "ParenthesizedExpression") {
            return getFileFindFirstCallFromExpression(expression.expression);
        }

        if (expression.type === "AssignmentExpression") {
            return getFileFindFirstCallFromExpression(expression.right);
        }

        if (expression.type === "SequenceExpression") {
            const expressions = Array.isArray(expression.expressions)
                ? expression.expressions
                : [];

            for (const item of expressions) {
                const call = getFileFindFirstCallFromExpression(item);
                if (call) {
                    return call;
                }
            }
        }

        if (
            expression.type === "BinaryExpression" ||
            expression.type === "LogicalExpression"
        ) {
            const leftCall = getFileFindFirstCallFromExpression(
                expression.left
            );
            if (leftCall) {
                return leftCall;
            }

            return getFileFindFirstCallFromExpression(expression.right);
        }

        if (
            expression.type === "ConditionalExpression" ||
            expression.type === "TernaryExpression"
        ) {
            const consequentCall = getFileFindFirstCallFromExpression(
                expression.consequent
            );
            if (consequentCall) {
                return consequentCall;
            }

            return getFileFindFirstCallFromExpression(expression.alternate);
        }

        return null;
    }

    function isFileFindCloseStatement(statement) {
        if (!statement || typeof statement !== "object") {
            return false;
        }

        if (statement.type === "CallExpression") {
            return isIdentifierWithName(statement.object, "file_find_close");
        }

        if (statement.type === "ExpressionStatement") {
            return isFileFindCloseStatement(statement.expression);
        }

        if (
            statement.type === "ReturnStatement" ||
            statement.type === "ThrowStatement"
        ) {
            return isFileFindCloseStatement(statement.argument);
        }

        return false;
    }

    function getProgramStatements(node) {
        if (!node || typeof node !== "object") {
            return [];
        }

        if (Array.isArray(node.body)) {
            return node.body;
        }

        if (node.body && Array.isArray(node.body.body)) {
            return node.body.body;
        }

        return [];
    }

    function createFileFindState() {
        return {
            openCount: 0
        };
    }

    function cloneFileFindState(existing) {
        if (!existing || typeof existing !== "object") {
            return createFileFindState();
        }

        return {
            openCount: existing.openCount ?? 0
        };
    }

    function createFileFindCloseCall(template) {
        const identifier = createIdentifier(
            "file_find_close",
            template?.object ?? template
        );

        if (!identifier) {
            return null;
        }

        const callExpression = {
            type: "CallExpression",
            object: identifier,
            arguments: []
        };

        if (Object.hasOwn(template, "start")) {
            callExpression.start = cloneLocation(template.start);
        }

        if (Object.hasOwn(template, "end")) {
            callExpression.end = cloneLocation(template.end);
        }

        return callExpression;
    }

    function ensureBlockStatement(parent, key, statement) {
        if (!parent || typeof parent !== "object" || !key) {
            return null;
        }

        if (!statement || typeof statement !== "object") {
            return null;
        }

        const block = {
            type: "BlockStatement",
            body: [statement]
        };

        if (Object.hasOwn(statement, "start")) {
            block.start = cloneLocation(statement.start);
        }

        if (Object.hasOwn(statement, "end")) {
            block.end = cloneLocation(statement.end);
        }

        parent[key] = block;

        return block;
    }
}

function harmonizeTexturePointerTernaries({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "TernaryExpression") {
            const fix = harmonizeTexturePointerTernary(
                node,
                parent,
                property,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
                return;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }
    };

    visit(ast, null, null);

    return fixes;
}

const INSTANCE_CREATE_FUNCTION_NAMES = new Set([
    "instance_create_layer",
    "instance_create_depth",
    "instance_create_depth_ext",
    "instance_create_layer_ext",
    "instance_create_at",
    "instance_create",
    "instance_create_z"
]);

function annotateInstanceVariableStructAssignments({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const entry of node) {
                visit(entry);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "CallExpression") {
            const callFixes = annotateInstanceCreateCall(node, diagnostic);

            if (Array.isArray(callFixes) && callFixes.length > 0) {
                fixes.push(...callFixes);
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function annotateInstanceCreateCall(node, diagnostic) {
    if (!node || node.type !== "CallExpression") {
        return [];
    }

    if (!isInstanceCreateIdentifier(node.object)) {
        return [];
    }

    const structArgument = findStructArgument(node.arguments);

    if (!structArgument) {
        return [];
    }

    return annotateVariableStructProperties(structArgument, diagnostic);
}

function isInstanceCreateIdentifier(node) {
    if (!node || node.type !== "Identifier") {
        return false;
    }

    if (INSTANCE_CREATE_FUNCTION_NAMES.has(node.name)) {
        return true;
    }

    return node.name?.startsWith?.("instance_create_") ?? false;
}

function findStructArgument(args) {
    if (!Array.isArray(args) || args.length === 0) {
        return null;
    }

    for (let index = args.length - 1; index >= 0; index -= 1) {
        const candidate = args[index];

        if (candidate && candidate.type === "StructExpression") {
            return candidate;
        }
    }

    return null;
}

function annotateVariableStructProperties(structExpression, diagnostic) {
    if (!structExpression || structExpression.type !== "StructExpression") {
        return [];
    }

    const properties = Array.isArray(structExpression.properties)
        ? structExpression.properties
        : [];

    if (properties.length === 0) {
        return [];
    }

    const fixes = [];

    for (const property of properties) {
        const fixDetail = annotateVariableStructProperty(property, diagnostic);

        if (fixDetail) {
            fixes.push(fixDetail);
        }
    }

    return fixes;
}

function annotateVariableStructProperty(property, diagnostic) {
    if (!property || property.type !== "Property") {
        return null;
    }

    const value = property.value;

    if (
        !value ||
        value.type !== "Identifier" ||
        typeof value.name !== "string"
    ) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: value.name,
        range: {
            start: getNodeStartIndex(property),
            end: getNodeEndIndex(property)
        },
        automatic: false
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(property, [fixDetail]);

    return fixDetail;
}

function harmonizeTexturePointerTernary(node, parent, property, diagnostic) {
    if (!node || node.type !== "TernaryExpression") {
        return null;
    }

    if (
        !parent ||
        parent.type !== "AssignmentExpression" ||
        property !== "right"
    ) {
        return null;
    }

    if (!isSpriteGetTextureCall(node.consequent)) {
        return null;
    }

    const alternate = node.alternate;

    if (!isNegativeOneLiteral(alternate)) {
        return null;
    }

    const pointerIdentifier = createIdentifier("pointer_null", alternate);

    if (!pointerIdentifier) {
        return null;
    }

    copyCommentMetadata(alternate, pointerIdentifier);
    node.alternate = pointerIdentifier;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: isIdentifier(parent.left) ? parent.left.name : null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function createAssignmentFromDeclarator(declarator, declarationNode) {
    if (!declarator || typeof declarator !== "object") {
        return null;
    }

    const identifier = declarator.id;

    if (!isIdentifier(identifier)) {
        return null;
    }

    if (!declarator.init) {
        return null;
    }

    const assignment = {
        type: "AssignmentExpression",
        operator: "=",
        left: cloneIdentifier(identifier),
        right: declarator.init,
        start: cloneLocation(declarator.start ?? declarationNode?.start),
        end: cloneLocation(declarator.end ?? declarationNode?.end)
    };

    copyCommentMetadata(declarator, assignment);

    return assignment;
}

function isFunctionLikeNode(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (typeof node.type !== "string") {
        return false;
    }

    return FUNCTION_LIKE_TYPES.has(node.type);
}

function getFunctionParameterNames(node) {
    const params = Array.isArray(node?.params) ? node.params : [];
    const names = [];

    for (const param of params) {
        if (!param || typeof param !== "object") {
            continue;
        }

        if (isIdentifier(param)) {
            if (param.name) {
                names.push(param.name);
            }
            continue;
        }

        if (param.type === "DefaultParameter" && isIdentifier(param.left)) {
            if (param.left.name) {
                names.push(param.left.name);
            }
            continue;
        }
    }

    return names;
}

function getVariableDeclaratorName(declarator) {
    if (!declarator || typeof declarator !== "object") {
        return null;
    }

    const identifier = declarator.id;

    if (!isIdentifier(identifier)) {
        return null;
    }

    return identifier.name ?? null;
}

function cloneIdentifier(node) {
    if (!node || node.type !== "Identifier") {
        return null;
    }

    const cloned = {
        type: "Identifier",
        name: node.name
    };

    if (Object.hasOwn(node, "start")) {
        cloned.start = cloneLocation(node.start);
    }

    if (Object.hasOwn(node, "end")) {
        cloned.end = cloneLocation(node.end);
    }

    return cloned;
}

function copyCommentMetadata(source, target) {
    if (!source || !target) {
        return;
    }

    [
        "leadingComments",
        "trailingComments",
        "innerComments",
        "comments"
    ].forEach((key) => {
        if (Object.hasOwn(source, key)) {
            target[key] = source[key];
        }
    });
}

function extractIdentifierNameFromLiteral(value) {
    if (typeof value !== "string") {
        return null;
    }

    const stripped = stripStringQuotes(value);
    if (!stripped) {
        return null;
    }

    if (!IDENTIFIER_NAME_PATTERN.test(stripped)) {
        return null;
    }

    return stripped;
}

function stripStringQuotes(value) {
    if (typeof value !== "string" || value.length < 2) {
        return null;
    }

    const firstChar = value[0];
    const lastChar = value[value.length - 1];

    if ((firstChar === '"' || firstChar === "'") && firstChar === lastChar) {
        return value.slice(1, -1);
    }

    return null;
}

function isIdentifierWithName(node, name) {
    if (!node || node.type !== "Identifier") {
        return false;
    }

    return node.name === name;
}

function isIdentifier(node) {
    return !!node && node.type === "Identifier";
}

function isLiteralZero(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    return node.value === "0" || node.value === 0;
}

function isLiteralOne(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    return node.value === "1" || node.value === 1;
}

function isLiteralTrue(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    return node.value === "true" || node.value === true;
}

function isLiteralFalse(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    return node.value === "false" || node.value === false;
}

function isAlphaTestRefResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_alphatestref")) {
        return false;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (args.length === 0) {
        return false;
    }

    return isLiteralZero(args[0]);
}

function isAlphaTestDisableCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_alphatestenable")) {
        return false;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (args.length === 0) {
        return false;
    }

    const [argument] = args;

    return isLiteralFalse(argument) || isLiteralZero(argument);
}

function createAlphaTestRefResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_alphatestref") {
        return null;
    }

    const literalZero = createLiteral("0", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalZero]
    };

    if (Object.hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function shouldResetBlendEnable(argument) {
    if (!argument || typeof argument !== "object") {
        return false;
    }

    return isLiteralFalse(argument) || isLiteralZero(argument);
}

function shouldResetTextureRepeat(argument) {
    if (!argument || typeof argument !== "object") {
        return false;
    }

    if (isLiteralFalse(argument) || isLiteralZero(argument)) {
        return false;
    }

    return isLiteralTrue(argument) || isLiteralOne(argument);
}

function isTextureRepeatResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_texrepeat")) {
        return false;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (args.length === 0) {
        return false;
    }

    const [argument] = args;

    return isLiteralFalse(argument) || isLiteralZero(argument);
}

function createTextureRepeatResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_texrepeat") {
        return null;
    }

    const literalFalse = createLiteral("false", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalFalse]
    };

    if (Object.hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function isBlendEnableResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_blendenable")) {
        return false;
    }

    const args = Array.isArray(node.arguments) ? node.arguments : [];

    if (args.length === 0) {
        return false;
    }

    const [argument] = args;

    return isLiteralTrue(argument) || isLiteralOne(argument);
}

function createBlendEnableResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_blendenable") {
        return null;
    }

    const literalTrue = createLiteral("true", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalTrue]
    };

    if (Object.hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function createLiteral(value, template) {
    const literalValue = typeof value === "number" ? String(value) : value;

    const literal = {
        type: "Literal",
        value: literalValue
    };

    if (template && typeof template === "object") {
        if (Object.hasOwn(template, "start")) {
            literal.start = cloneLocation(template.start);
        }

        if (Object.hasOwn(template, "end")) {
            literal.end = cloneLocation(template.end);
        }
    }

    return literal;
}

function reorderOptionalParameters({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                visit(item);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "FunctionDeclaration") {
            const fix = reorderFunctionOptionalParameters(node, diagnostic);

            if (fix) {
                fixes.push(fix);
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function reorderFunctionOptionalParameters(node, diagnostic) {
    if (!node || node.type !== "FunctionDeclaration") {
        return null;
    }

    const params = Array.isArray(node.params) ? node.params : null;

    if (!params || params.length === 0) {
        return null;
    }

    let encounteredOptional = false;
    let needsReordering = false;

    for (const param of params) {
        if (isOptionalParameter(param)) {
            encounteredOptional = true;
        } else if (encounteredOptional) {
            needsReordering = true;
            break;
        }
    }

    if (!needsReordering) {
        return null;
    }

    const requiredParams = [];
    const optionalParams = [];

    for (const param of params) {
        if (isOptionalParameter(param)) {
            optionalParams.push(param);
        } else {
            requiredParams.push(param);
        }
    }

    const reorderedParams = requiredParams.concat(optionalParams);

    if (reorderedParams.length !== params.length) {
        return null;
    }

    node.params = reorderedParams;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: getFunctionIdentifierName(node),
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function isOptionalParameter(parameter) {
    return parameter?.type === "DefaultParameter";
}

function getFunctionIdentifierName(node) {
    if (!node) {
        return null;
    }

    const { id, name, key } = node;

    if (typeof id === "string") {
        return id;
    }

    if (id && typeof id === "object") {
        if (typeof id.name === "string") {
            return id.name;
        }

        if (id.type === "Identifier" && typeof id.name === "string") {
            return id.name;
        }
    }

    if (typeof name === "string") {
        return name;
    }

    if (key && typeof key === "object" && typeof key.name === "string") {
        return key.name;
    }

    return null;
}

function sanitizeMalformedJsDocTypes({ ast, diagnostic, typeSystemInfo }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const comments = collectCommentNodes(ast);

    if (comments.length === 0) {
        return [];
    }

    const fixes = [];

    for (const comment of comments) {
        const result = sanitizeDocCommentType(comment, typeSystemInfo);

        if (!result) {
            continue;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: result.target ?? null,
            range: {
                start: getNodeStartIndex(comment),
                end: getNodeEndIndex(comment)
            }
        });

        if (!fixDetail) {
            continue;
        }

        attachFeatherFixMetadata(comment, [fixDetail]);
        fixes.push(fixDetail);
    }

    return fixes;
}

function sanitizeDocCommentType(comment, typeSystemInfo) {
    if (!comment || comment.type !== "CommentLine") {
        return null;
    }

    const rawValue = typeof comment.value === "string" ? comment.value : "";

    if (
        !rawValue ||
        rawValue.indexOf("@") === -1 ||
        rawValue.indexOf("{") === -1
    ) {
        return null;
    }

    const tagMatch = rawValue.match(/\/\s*@([A-Za-z]+)/);

    if (!tagMatch) {
        return null;
    }

    const tagName = tagMatch[1]?.toLowerCase();

    if (tagName !== "param" && tagName !== "return" && tagName !== "returns") {
        return null;
    }

    const annotation = extractTypeAnnotation(rawValue);

    if (!annotation) {
        return null;
    }

    const { beforeBrace, typeText, remainder, hadClosingBrace } = annotation;

    if (typeof typeText !== "string") {
        return null;
    }

    const sanitizedType = sanitizeTypeAnnotationText(typeText, typeSystemInfo);
    const needsClosingBrace = hadClosingBrace === false;
    const hasTypeChange = sanitizedType !== typeText.trim();

    if (!hasTypeChange && !needsClosingBrace) {
        return null;
    }

    const updatedValue = `${beforeBrace}${sanitizedType}}${remainder}`;

    if (updatedValue === rawValue) {
        return null;
    }

    comment.value = updatedValue;

    if (typeof comment.raw === "string") {
        comment.raw = `//${updatedValue}`;
    }

    const target =
        tagName === "param"
            ? extractParameterNameFromDocRemainder(remainder)
            : null;

    return {
        target
    };
}

function extractTypeAnnotation(value) {
    if (typeof value !== "string") {
        return null;
    }

    const braceIndex = value.indexOf("{");

    if (braceIndex === -1) {
        return null;
    }

    const beforeBrace = value.slice(0, braceIndex + 1);
    const afterBrace = value.slice(braceIndex + 1);

    const closingIndex = afterBrace.indexOf("}");
    let typeText;
    let remainder;
    let hadClosingBrace = true;

    if (closingIndex === -1) {
        const split = splitTypeAndRemainder(afterBrace);
        typeText = split.type;
        remainder = split.remainder;
        hadClosingBrace = false;
    } else {
        typeText = afterBrace.slice(0, closingIndex);
        remainder = afterBrace.slice(closingIndex + 1);
    }

    const trimmedType = typeof typeText === "string" ? typeText.trim() : "";

    return {
        beforeBrace,
        typeText: trimmedType,
        remainder,
        hadClosingBrace
    };
}

function splitTypeAndRemainder(text) {
    if (typeof text !== "string") {
        return { type: "", remainder: "" };
    }

    let depthSquare = 0;
    let depthAngle = 0;
    let depthParen = 0;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];

        if (char === "[") {
            depthSquare += 1;
        } else if (char === "]") {
            depthSquare = Math.max(0, depthSquare - 1);
        } else if (char === "<") {
            depthAngle += 1;
        } else if (char === ">") {
            depthAngle = Math.max(0, depthAngle - 1);
        } else if (char === "(") {
            depthParen += 1;
        } else if (char === ")") {
            depthParen = Math.max(0, depthParen - 1);
        }

        if (
            WHITESPACE_PATTERN.test(char) &&
            depthSquare === 0 &&
            depthAngle === 0 &&
            depthParen === 0
        ) {
            const typePart = text.slice(0, index).trimEnd();
            const remainder = text.slice(index);
            return { type: typePart, remainder };
        }
    }

    return {
        type: text.trim(),
        remainder: ""
    };
}

const WHITESPACE_PATTERN = /\s/;

function sanitizeTypeAnnotationText(typeText, typeSystemInfo) {
    if (typeof typeText !== "string" || typeText.length === 0) {
        return typeText ?? "";
    }

    const normalized = typeText.trim();
    const balanced = balanceTypeAnnotationDelimiters(normalized);

    const specifierSanitized = fixSpecifierSpacing(
        balanced,
        typeSystemInfo?.specifierBaseTypeNamesLower
    );

    return fixTypeUnionSpacing(
        specifierSanitized,
        typeSystemInfo?.baseTypeNamesLower
    );
}

function balanceTypeAnnotationDelimiters(typeText) {
    if (typeof typeText !== "string" || typeText.length === 0) {
        return typeText ?? "";
    }

    const stack = [];

    for (const char of typeText) {
        if (char === "[") {
            stack.push("]");
        } else if (char === "<") {
            stack.push(">");
        } else if (char === "(") {
            stack.push(")");
        } else if (char === "]" || char === ">" || char === ")") {
            if (stack.length > 0 && stack[stack.length - 1] === char) {
                stack.pop();
            }
        }
    }

    if (stack.length === 0) {
        return typeText;
    }

    return typeText + stack.reverse().join("");
}

function fixSpecifierSpacing(typeText, specifierBaseTypes) {
    if (typeof typeText !== "string" || typeText.length === 0) {
        return typeText ?? "";
    }

    if (!(specifierBaseTypes instanceof Set) || specifierBaseTypes.size === 0) {
        return typeText;
    }

    const patternSource = [...specifierBaseTypes]
        .map((name) => escapeRegExp(name))
        .join("|");

    if (!patternSource) {
        return typeText;
    }

    const regex = new RegExp(`\\b(${patternSource})\\b`, "gi");
    let result = "";
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(typeText)) !== null) {
        const matchStart = match.index;
        const matchEnd = regex.lastIndex;
        const before = typeText.slice(lastIndex, matchStart);
        const matchedText = typeText.slice(matchStart, matchEnd);
        result += before + matchedText;

        const remainder = typeText.slice(matchEnd);
        const specifierInfo = readSpecifierToken(remainder);

        if (specifierInfo) {
            if (specifierInfo.needsDot) {
                result += `.${specifierInfo.token}`;
            } else {
                result += remainder.slice(0, specifierInfo.consumedLength);
            }

            regex.lastIndex = matchEnd + specifierInfo.consumedLength;
            lastIndex = regex.lastIndex;
        } else {
            lastIndex = matchEnd;
        }
    }

    result += typeText.slice(lastIndex);
    return result;
}

function readSpecifierToken(text) {
    if (typeof text !== "string" || text.length === 0) {
        return null;
    }

    let offset = 0;

    while (offset < text.length && WHITESPACE_PATTERN.test(text[offset])) {
        offset += 1;
    }

    if (offset === 0) {
        return null;
    }

    const firstChar = text[offset];

    if (
        !firstChar ||
        firstChar === "." ||
        firstChar === "," ||
        firstChar === "|" ||
        firstChar === "}"
    ) {
        return {
            consumedLength: offset,
            needsDot: false
        };
    }

    let consumed = offset;
    let token = "";
    let depthSquare = 0;
    let depthAngle = 0;
    let depthParen = 0;

    while (consumed < text.length) {
        const char = text[consumed];

        if (
            WHITESPACE_PATTERN.test(char) &&
            depthSquare === 0 &&
            depthAngle === 0 &&
            depthParen === 0
        ) {
            break;
        }

        if (
            (char === "," || char === "|" || char === "}") &&
            depthSquare === 0 &&
            depthAngle === 0 &&
            depthParen === 0
        ) {
            break;
        }

        if (char === "[") {
            depthSquare += 1;
        } else if (char === "]") {
            depthSquare = Math.max(0, depthSquare - 1);
        } else if (char === "<") {
            depthAngle += 1;
        } else if (char === ">") {
            depthAngle = Math.max(0, depthAngle - 1);
        } else if (char === "(") {
            depthParen += 1;
        } else if (char === ")") {
            depthParen = Math.max(0, depthParen - 1);
        }

        token += char;
        consumed += 1;
    }

    if (token.length === 0) {
        return {
            consumedLength: offset,
            needsDot: false
        };
    }

    return {
        consumedLength: consumed,
        token,
        needsDot: true
    };
}

function fixTypeUnionSpacing(typeText, baseTypesLower) {
    if (typeof typeText !== "string" || typeText.length === 0) {
        return typeText ?? "";
    }

    if (!(baseTypesLower instanceof Set) || baseTypesLower.size === 0) {
        return typeText;
    }

    if (!WHITESPACE_PATTERN.test(typeText)) {
        return typeText;
    }

    if (hasDelimiterOutsideNesting(typeText, [",", "|"])) {
        return typeText;
    }

    const segments = splitTypeSegments(typeText);

    if (segments.length <= 1) {
        return typeText;
    }

    const trimmedSegments = segments
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);

    if (trimmedSegments.length <= 1) {
        return typeText;
    }

    const recognizedCount = trimmedSegments.reduce((count, segment) => {
        const baseTypeName = extractBaseTypeName(segment);

        if (baseTypeName && baseTypesLower.has(baseTypeName.toLowerCase())) {
            return count + 1;
        }

        return count;
    }, 0);

    if (recognizedCount < 2) {
        return typeText;
    }

    return trimmedSegments.join(",");
}

function splitTypeSegments(text) {
    const segments = [];
    let current = "";
    let depthSquare = 0;
    let depthAngle = 0;
    let depthParen = 0;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];

        if (char === "[") {
            depthSquare += 1;
        } else if (char === "]") {
            depthSquare = Math.max(0, depthSquare - 1);
        } else if (char === "<") {
            depthAngle += 1;
        } else if (char === ">") {
            depthAngle = Math.max(0, depthAngle - 1);
        } else if (char === "(") {
            depthParen += 1;
        } else if (char === ")") {
            depthParen = Math.max(0, depthParen - 1);
        }

        if (
            (WHITESPACE_PATTERN.test(char) || char === "," || char === "|") &&
            depthSquare === 0 &&
            depthAngle === 0 &&
            depthParen === 0
        ) {
            if (current.trim().length > 0) {
                segments.push(current.trim());
            }
            current = "";
            continue;
        }

        current += char;
    }

    if (current.trim().length > 0) {
        segments.push(current.trim());
    }

    return segments;
}

function hasDelimiterOutsideNesting(text, delimiters) {
    if (typeof text !== "string" || text.length === 0) {
        return false;
    }

    const delimiterSet = new Set(delimiters ?? []);
    let depthSquare = 0;
    let depthAngle = 0;
    let depthParen = 0;

    for (const char of text) {
        if (char === "[") {
            depthSquare += 1;
        } else if (char === "]") {
            depthSquare = Math.max(0, depthSquare - 1);
        } else if (char === "<") {
            depthAngle += 1;
        } else if (char === ">") {
            depthAngle = Math.max(0, depthAngle - 1);
        } else if (char === "(") {
            depthParen += 1;
        } else if (char === ")") {
            depthParen = Math.max(0, depthParen - 1);
        }

        if (
            delimiterSet.has(char) &&
            depthSquare === 0 &&
            depthAngle === 0 &&
            depthParen === 0
        ) {
            return true;
        }
    }

    return false;
}

function createTemporaryIdentifierName(argument, siblings) {
    const existingNames = new Set();

    if (Array.isArray(siblings)) {
        for (const entry of siblings) {
            collectIdentifierNames(entry, existingNames);
        }
    }

    const baseName = sanitizeIdentifierName(
        getIdentifierName(argument) || "value"
    );
    const prefix = `__featherFix_${baseName}`;
    let candidate = prefix;
    let suffix = 1;

    while (existingNames.has(candidate)) {
        candidate = `${prefix}_${suffix}`;
        suffix += 1;
    }

    return candidate;
}

function sanitizeIdentifierName(name) {
    if (typeof name !== "string" || name.length === 0) {
        return "value";
    }

    let sanitized = name.replace(/[^A-Za-z0-9_]/g, "_");

    if (!/^[A-Za-z_]/.test(sanitized)) {
        sanitized = `value_${sanitized}`;
    }

    return sanitized || "value";
}

function collectIdentifierNames(node, registry) {
    if (!node || !registry) {
        return;
    }

    if (Array.isArray(node)) {
        for (const entry of node) {
            collectIdentifierNames(entry, registry);
        }
        return;
    }

    if (typeof node !== "object") {
        return;
    }

    if (node.type === "Identifier" && typeof node.name === "string") {
        registry.add(node.name);
    }

    for (const value of Object.values(node)) {
        if (value && typeof value === "object") {
            collectIdentifierNames(value, registry);
        }
    }
}

function getIdentifierName(node) {
    if (!node) {
        return null;
    }

    if (node.type === "Identifier" && typeof node.name === "string") {
        return node.name;
    }

    return null;
}

function cloneNode(node) {
    if (node === null || typeof node !== "object") {
        return node;
    }

    if (Array.isArray(node)) {
        return node.map((entry) => cloneNode(entry));
    }

    const clone = {};

    for (const [key, value] of Object.entries(node)) {
        clone[key] = cloneNode(value);
    }

    return clone;
}

function createIdentifier(name, template) {
    if (!name) {
        return null;
    }

    const identifier = {
        type: "Identifier",
        name
    };

    if (template && typeof template === "object") {
        if (Object.hasOwn(template, "start")) {
            identifier.start = cloneLocation(template.start);
        }

        if (Object.hasOwn(template, "end")) {
            identifier.end = cloneLocation(template.end);
        }
    }

    return identifier;
}

function isSpriteGetTextureCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return isIdentifierWithName(node.object, "sprite_get_texture");
}

function isNegativeOneLiteral(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "Literal") {
        return node.value === "-1" || node.value === -1;
    }

    if (
        node.type === "UnaryExpression" &&
        node.operator === "-" &&
        node.prefix
    ) {
        const argument = node.argument;

        if (!argument || argument.type !== "Literal") {
            return false;
        }

        return argument.value === "1" || argument.value === 1;
    }

    return false;
}

function extractBaseTypeName(segment) {
    if (typeof segment !== "string") {
        return null;
    }

    const match = segment.match(/^[A-Za-z_][A-Za-z0-9_]*/);

    return match ? match[0] : null;
}

function extractParameterNameFromDocRemainder(remainder) {
    if (typeof remainder !== "string") {
        return null;
    }

    const match = remainder.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)/);

    return match ? match[1] : null;
}

function escapeRegExp(text) {
    if (typeof text !== "string") {
        return "";
    }

    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renameReservedIdentifiers({ ast, diagnostic, sourceText }) {
    if (
        !diagnostic ||
        !ast ||
        typeof ast !== "object" ||
        RESERVED_IDENTIFIER_NAMES.size === 0
    ) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                visit(child);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (
            node.type === "VariableDeclaration" &&
            isSupportedVariableDeclaration(node)
        ) {
            const declarationFixes =
                renameReservedIdentifiersInVariableDeclaration(
                    node,
                    diagnostic
                );

            if (
                Array.isArray(declarationFixes) &&
                declarationFixes.length > 0
            ) {
                fixes.push(...declarationFixes);
            }
        } else if (node.type === "MacroDeclaration") {
            const macroFix = renameReservedIdentifierInMacro(
                node,
                diagnostic,
                sourceText
            );

            if (macroFix) {
                fixes.push(macroFix);
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return fixes;
}

function isSupportedVariableDeclaration(node) {
    if (!node || node.type !== "VariableDeclaration") {
        return false;
    }

    const kind = typeof node.kind === "string" ? node.kind.toLowerCase() : null;

    return kind === "var" || kind === "static";
}

function renameReservedIdentifiersInVariableDeclaration(node, diagnostic) {
    const declarations = Array.isArray(node?.declarations)
        ? node.declarations
        : [];

    if (declarations.length === 0) {
        return [];
    }

    const fixes = [];

    for (const declarator of declarations) {
        if (!declarator || declarator.type !== "VariableDeclarator") {
            continue;
        }

        const fix = renameReservedIdentifierNode(declarator.id, diagnostic);

        if (fix) {
            fixes.push(fix);
        }
    }

    return fixes;
}

function renameReservedIdentifierNode(identifier, diagnostic, options = {}) {
    if (!identifier || identifier.type !== "Identifier") {
        return null;
    }

    const name = identifier.name;

    if (!isReservedIdentifier(name)) {
        return null;
    }

    const replacement = getReplacementIdentifierName(name);

    if (!replacement || replacement === name) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: name ?? null,
        range: {
            start: getNodeStartIndex(identifier),
            end: getNodeEndIndex(identifier)
        }
    });

    if (!fixDetail) {
        return null;
    }

    identifier.name = replacement;

    if (typeof options.onRename === "function") {
        try {
            options.onRename({
                identifier,
                originalName: name,
                replacement
            });
        } catch {
            // Swallow callback errors to avoid interrupting the fix pipeline.
        }
    }

    attachFeatherFixMetadata(identifier, [fixDetail]);

    return fixDetail;
}

function renameReservedIdentifierInMacro(node, diagnostic, sourceText) {
    if (!node || node.type !== "MacroDeclaration") {
        return null;
    }

    return renameReservedIdentifierNode(node.name, diagnostic, {
        onRename: ({ originalName, replacement }) => {
            const updatedText = buildMacroReplacementText({
                macro: node,
                originalName,
                replacement,
                sourceText
            });

            if (typeof updatedText === "string") {
                node._featherMacroText = updatedText;
            }
        }
    });
}

function isReservedIdentifier(name) {
    if (typeof name !== "string" || name.length === 0) {
        return false;
    }

    return RESERVED_IDENTIFIER_NAMES.has(name.toLowerCase());
}

function getReplacementIdentifierName(originalName) {
    if (typeof originalName !== "string" || originalName.length === 0) {
        return null;
    }

    let candidate = `_${originalName}`;
    const seen = new Set();

    while (isReservedIdentifier(candidate)) {
        if (seen.has(candidate)) {
            return null;
        }

        seen.add(candidate);
        candidate = `_${candidate}`;
    }

    return candidate;
}

function buildMacroReplacementText({
    macro,
    originalName,
    replacement,
    sourceText
}) {
    if (
        !macro ||
        macro.type !== "MacroDeclaration" ||
        typeof replacement !== "string"
    ) {
        return null;
    }

    const baseText = getMacroBaseText(macro, sourceText);

    if (typeof baseText !== "string" || baseText.length === 0) {
        return null;
    }

    if (typeof originalName === "string" && originalName.length > 0) {
        const nameIndex = baseText.indexOf(originalName);

        if (nameIndex >= 0) {
            return (
                baseText.slice(0, nameIndex) +
                replacement +
                baseText.slice(nameIndex + originalName.length)
            );
        }
    }

    return null;
}

function getMacroBaseText(macro, sourceText) {
    if (!macro || macro.type !== "MacroDeclaration") {
        return null;
    }

    if (
        typeof macro._featherMacroText === "string" &&
        macro._featherMacroText.length > 0
    ) {
        return macro._featherMacroText;
    }

    if (typeof sourceText !== "string" || sourceText.length === 0) {
        return null;
    }

    const startIndex = getNodeStartIndex(macro);
    const endIndex = getNodeEndIndex(macro);

    if (
        typeof startIndex !== "number" ||
        typeof endIndex !== "number" ||
        endIndex < startIndex
    ) {
        return null;
    }

    return sourceText.slice(startIndex, endIndex);
}

function buildReservedIdentifierNameSet() {
    try {
        const metadata = require("../../../../resources/gml-identifiers.json");
        const identifiers = metadata?.identifiers;

        if (identifiers && typeof identifiers === "object") {
            const disallowedTypes = new Set(["literal", "keyword"]);

            return new Set(
                Object.entries(identifiers)
                    .filter(([name, info]) => {
                        if (typeof name !== "string" || name.length === 0) {
                            return false;
                        }

                        const type =
                            typeof info?.type === "string" ? info.type : "";
                        return !disallowedTypes.has(type.toLowerCase());
                    })
                    .map(([name]) => name.toLowerCase())
            );
        }
    } catch {
        // Ignore metadata loading failures and fall back to a no-op set.
    }

    return new Set();
}

function registerManualFeatherFix({ ast, diagnostic }) {
    if (!ast || typeof ast !== "object" || !diagnostic?.id) {
        return [];
    }

    const manualFixIds = getManualFeatherFixRegistry(ast);

    if (manualFixIds.has(diagnostic.id)) {
        return [];
    }

    manualFixIds.add(diagnostic.id);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        automatic: false,
        range: null,
        target: null
    });

    return [fixDetail];
}

function getManualFeatherFixRegistry(ast) {
    let registry = ast[MANUAL_FIX_TRACKING_KEY];

    if (registry instanceof Set) {
        return registry;
    }

    registry = new Set();

    Object.defineProperty(ast, MANUAL_FIX_TRACKING_KEY, {
        configurable: true,
        enumerable: false,
        writable: false,
        value: registry
    });

    return registry;
}

function createFeatherFixDetail(
    diagnostic,
    { target = null, range = null, automatic = true } = {}
) {
    if (!diagnostic) {
        return null;
    }

    return {
        id: diagnostic.id ?? null,
        title: diagnostic.title ?? null,
        description: diagnostic.description ?? null,
        correction: diagnostic.correction ?? null,
        target,
        range,
        automatic
    };
}

function attachFeatherFixMetadata(target, fixes) {
    if (
        !target ||
        typeof target !== "object" ||
        !Array.isArray(fixes) ||
        fixes.length === 0
    ) {
        return;
    }

    const key = "_appliedFeatherDiagnostics";

    if (!Array.isArray(target[key])) {
        Object.defineProperty(target, key, {
            configurable: true,
            enumerable: false,
            writable: true,
            value: []
        });
    }

    target[key].push(...fixes);
}

const ARGUMENT_BUILTINS = new Set([
    "argument",
    "argument_relative",
    "argument_count",
    ...Array.from({ length: 16 }, (_, index) => `argument${index}`)
]);

function relocateArgumentReferencesInsideFunctions({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const programBody = Array.isArray(ast.body) ? ast.body : null;

    if (!programBody || programBody.length === 0) {
        return [];
    }

    const fixes = [];

    for (let index = 0; index < programBody.length; index += 1) {
        const entry = programBody[index];

        if (!isFunctionDeclaration(entry)) {
            continue;
        }

        const block = getFunctionBlock(entry);

        if (!block) {
            continue;
        }

        let nextIndex = index + 1;

        while (nextIndex < programBody.length) {
            const candidate = programBody[nextIndex];

            if (!candidate || typeof candidate !== "object") {
                break;
            }

            if (isFunctionDeclaration(candidate)) {
                break;
            }

            const argumentReference =
                findArgumentReferenceOutsideFunctions(candidate);

            if (!argumentReference) {
                break;
            }

            programBody.splice(nextIndex, 1);
            block.body.push(candidate);

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: argumentReference?.name ?? null,
                range: {
                    start: getNodeStartIndex(candidate),
                    end: getNodeEndIndex(candidate)
                }
            });

            if (fixDetail) {
                attachFeatherFixMetadata(candidate, [fixDetail]);
                fixes.push(fixDetail);
            }
        }
    }

    return fixes;
}

function isFunctionDeclaration(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    return node.type === "FunctionDeclaration";
}

function getFunctionBlock(declaration) {
    const body = declaration?.body;

    if (!body || body.type !== "BlockStatement") {
        return null;
    }

    const blockBody = Array.isArray(body.body) ? body.body : null;

    if (!blockBody) {
        return null;
    }

    return body;
}

function findArgumentReferenceOutsideFunctions(node) {
    let match = null;

    const visit = (current, isRoot = false) => {
        if (!current || match) {
            return;
        }

        if (Array.isArray(current)) {
            for (const item of current) {
                visit(item, false);

                if (match) {
                    break;
                }
            }

            return;
        }

        if (typeof current !== "object") {
            return;
        }

        if (!isRoot && isFunctionLikeNode(current)) {
            return;
        }

        if (current.type === "Identifier") {
            const builtin = getArgumentBuiltinName(current.name);

            if (builtin) {
                match = { name: builtin };
                return;
            }
        }

        if (
            current.type === "MemberIndexExpression" &&
            isIdentifierWithName(current.object, "argument")
        ) {
            match = { name: "argument" };
            return;
        }

        if (
            current.type === "MemberDotExpression" &&
            isIdentifierWithName(current.object, "argument")
        ) {
            match = { name: "argument" };
            return;
        }

        for (const value of Object.values(current)) {
            if (
                !value ||
                (typeof value !== "object" && !Array.isArray(value))
            ) {
                continue;
            }

            visit(value, false);

            if (match) {
                break;
            }
        }
    };

    visit(node, true);

    return match;
}

function getArgumentBuiltinName(name) {
    if (typeof name !== "string") {
        return null;
    }

    if (ARGUMENT_BUILTINS.has(name)) {
        return name;
    }

    return null;
}

function getNodeStartLine(node) {
    const location = node?.start;

    if (
        location &&
        typeof location === "object" &&
        typeof location.line === "number"
    ) {
        return location.line;
    }

    return undefined;
}

function collectGM1100Candidates(node) {
    const index = new Map();

    const visit = (candidate) => {
        if (!candidate) {
            return;
        }

        if (Array.isArray(candidate)) {
            for (const item of candidate) {
                visit(item);
            }
            return;
        }

        if (typeof candidate !== "object") {
            return;
        }

        if (
            (candidate.type === "VariableDeclaration" ||
                candidate.type === "AssignmentExpression") &&
            typeof getNodeStartLine(candidate) === "number"
        ) {
            const line = getNodeStartLine(candidate);

            if (typeof line === "number") {
                if (!index.has(line)) {
                    index.set(line, []);
                }

                index.get(line).push(candidate);
            }
        }

        for (const value of Object.values(candidate)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(node);

    return index;
}
