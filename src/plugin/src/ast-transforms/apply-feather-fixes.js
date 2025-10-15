import GMLParser from "gamemaker-language-parser";

import {
    getNodeEndIndex,
    getNodeStartIndex,
    cloneLocation
} from "../../../shared/ast-locations.js";
import {
    getArrayProperty,
    getBodyStatements,
    getCallExpressionArguments,
    isBooleanLiteral,
    isVarVariableDeclaration
} from "../../../shared/ast-node-helpers.js";
import {
    isNonEmptyString,
    isNonEmptyTrimmedString,
    toTrimmedString
} from "../../../shared/string-utils.js";
import { loadReservedIdentifierNames } from "../reserved-identifiers.js";
import { isFiniteNumber } from "../../../shared/number-utils.js";
import { asArray, isNonEmptyArray } from "../../../shared/array-utils.js";
import { hasOwn, isObjectLike } from "../../../shared/object-utils.js";
import { escapeRegExp } from "../../../shared/regexp.js";
import { collectCommentNodes, getCommentArray } from "../comments/index.js";
import {
    getFeatherDiagnosticById,
    getFeatherDiagnostics,
    getFeatherMetadata
} from "../feather/metadata.js";

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
const FILE_FIND_BLOCK_CALL_TARGETS = new Set(["file_find_next"]);
const FILE_FIND_CLOSE_FUNCTION_NAME = "file_find_close";
const READ_ONLY_BUILT_IN_VARIABLES = new Set(["working_directory"]);
const FILE_ATTRIBUTE_IDENTIFIER_PATTERN = /^fa_[A-Za-z0-9_]+$/;
const STRING_LENGTH_CALL_BLACKLIST = new Set([
    "string_byte_at",
    "string_byte_length",
    "string_height",
    "string_height_ext",
    "string_length",
    "string_pos",
    "string_pos_ext",
    "string_width",
    "string_width_ext"
]);
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
const RESERVED_IDENTIFIER_NAMES = loadReservedIdentifierNames();
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

function getCallArgumentsOrEmpty(node) {
    if (!node || typeof node !== "object") {
        return [];
    }

    const args = getCallExpressionArguments(node);
    return Array.isArray(node.arguments) ? args : [];
}
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

        if (isNonEmptyArray(fixes)) {
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

    for (const diagnostic of asArray(diagnostics)) {
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

        return asArray(fixes);
    };
}

function createNoOpFixer() {
    return () => [];
}

function removeDuplicateEnumMembers({ ast, diagnostic }) {
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

        if (node.type === "EnumDeclaration") {
            const members = asArray(node.members);

            if (members.length > 1) {
                const seen = new Map();

                for (let index = 0; index < members.length; index += 1) {
                    const member = members[index];

                    if (!member || typeof member !== "object") {
                        continue;
                    }

                    const name = member.name?.name;

                    if (typeof name !== "string" || name.length === 0) {
                        continue;
                    }

                    const normalizedName = name.toLowerCase();

                    if (!seen.has(normalizedName)) {
                        seen.set(normalizedName, member);
                        continue;
                    }

                    const fixDetail = createFeatherFixDetail(diagnostic, {
                        target: name,
                        range: {
                            start: getNodeStartIndex(member),
                            end: getNodeEndIndex(member)
                        }
                    });

                    if (fixDetail) {
                        fixes.push(fixDetail);
                        attachFeatherFixMetadata(node, [fixDetail]);
                    }

                    members.splice(index, 1);
                    index -= 1;
                }

                if (members.length === 0) {
                    node.hasTrailingComma = false;
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

function removeBreakStatementsWithoutEnclosingLoops({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visitArray = (array, owner, property, breakableDepth) => {
        if (!Array.isArray(array)) {
            return;
        }

        let index = 0;

        while (index < array.length) {
            const removed = visit(
                array[index],
                array,
                index,
                breakableDepth,
                owner
            );

            if (!removed) {
                index += 1;
            }
        }
    };

    const visit = (node, parent, property, breakableDepth, owner) => {
        if (!node) {
            return false;
        }

        if (Array.isArray(node)) {
            visitArray(node, owner, property, breakableDepth);
            return false;
        }

        if (typeof node !== "object") {
            return false;
        }

        if (node.type === "BreakStatement" && breakableDepth === 0) {
            if (!Array.isArray(parent) || typeof property !== "number") {
                return false;
            }

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: "break",
                range: {
                    start: getNodeStartIndex(node),
                    end: getNodeEndIndex(node)
                }
            });

            if (!fixDetail) {
                return false;
            }

            parent.splice(property, 1);

            let metadataTarget = null;

            if (owner && owner !== ast) {
                metadataTarget = owner;
            } else if (Array.isArray(parent)) {
                metadataTarget = parent;
            }

            if (metadataTarget) {
                attachFeatherFixMetadata(metadataTarget, [fixDetail]);
            }

            fixes.push(fixDetail);

            return true;
        }

        const nextBreakableDepth =
            breakableDepth + (isBreakableConstruct(node) ? 1 : 0);

        for (const [key, value] of Object.entries(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                visitArray(value, node, key, nextBreakableDepth);
                continue;
            }

            visit(value, node, key, nextBreakableDepth, node);
        }

        return false;
    };

    visit(ast, null, null, 0, null);

    return fixes;
}

function isBreakableConstruct(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    switch (node.type) {
        case "DoUntilStatement":
        case "ForStatement":
        case "RepeatStatement":
        case "SwitchStatement":
        case "WhileStatement":
        case "WithStatement":
            return true;
        default:
            return false;
    }
}

function buildFeatherFixImplementations(diagnostics) {
    const registry = new Map();

    for (const diagnostic of asArray(diagnostics)) {
        const diagnosticId = diagnostic?.id;

        if (!diagnosticId) {
            continue;
        }

        if (diagnosticId === "GM1000") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = removeBreakStatementsWithoutEnclosingLoops({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1002") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = splitGlobalVarInlineInitializers({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1003") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = sanitizeEnumAssignments({ ast, diagnostic });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1005") {
            registerFeatherFixer(registry, diagnosticId, () => {
                const callTemplate =
                    createFunctionCallTemplateFromDiagnostic(diagnostic);

                return ({ ast }) => {
                    const fixes = ensureRequiredArgumentProvided({
                        ast,
                        diagnostic,
                        callTemplate
                    });

                    if (isNonEmptyArray(fixes)) {
                        return fixes;
                    }

                    return registerManualFeatherFix({ ast, diagnostic });
                };
            });
            continue;
        }

        if (diagnosticId === "GM1004") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = removeDuplicateEnumMembers({ ast, diagnostic });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1007") {
            registerFeatherFixer(
                registry,
                diagnosticId,
                () =>
                    ({ ast, sourceText }) => {
                        const fixes = flagInvalidAssignmentTargets({
                            ast,
                            sourceText,
                            diagnostic
                        });

                        if (isNonEmptyArray(fixes)) {
                            return fixes;
                        }

                        return registerManualFeatherFix({ ast, diagnostic });
                    }
            );
            continue;
        }

        if (diagnosticId === "GM2000") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureBlendModeIsReset({ ast, diagnostic });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2003") {
            registerFeatherFixer(
                registry,
                diagnosticId,
                () =>
                    ({ ast, sourceText }) => {
                        const fixes = ensureShaderResetIsCalled({
                            ast,
                            diagnostic,
                            sourceText
                        });

                        if (isNonEmptyArray(fixes)) {
                            return fixes;
                        }

                        return registerManualFeatherFix({ ast, diagnostic });
                    }
            );
            continue;
        }

        if (diagnosticId === "GM2004") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = convertUnusedIndexForLoops({ ast, diagnostic });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2007") {
            registerFeatherFixer(
                registry,
                diagnosticId,
                () =>
                    ({ ast, sourceText }) => {
                        const fixes = ensureVarDeclarationsAreTerminated({
                            ast,
                            sourceText,
                            diagnostic
                        });

                        if (isNonEmptyArray(fixes)) {
                            return fixes;
                        }

                        return registerManualFeatherFix({ ast, diagnostic });
                    }
            );
            continue;
        }

        if (diagnosticId === "GM2008") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = closeOpenVertexBatches({ ast, diagnostic });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1008") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = convertReadOnlyBuiltInAssignments({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1010") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureNumericOperationsUseRealLiteralCoercion({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1013") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = resolveWithOtherVariableReferences({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2012") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureVertexFormatsClosedBeforeStartingNewOnes({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2040") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = removeInvalidEventInheritedCalls({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2030") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureDrawPrimitiveEndCallsAreBalanced({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2015") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureVertexFormatDefinitionsAreClosed({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2016") {
            registerFeatherFixer(
                registry,
                diagnosticId,
                () =>
                    ({ ast, sourceText }) => {
                        const fixes = localizeInstanceVariableAssignments({
                            ast,
                            diagnostic,
                            sourceText
                        });

                        if (isNonEmptyArray(fixes)) {
                            return fixes;
                        }

                        return registerManualFeatherFix({ ast, diagnostic });
                    }
            );
            continue;
        }

        if (diagnosticId === "GM2028") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensurePrimitiveBeginPrecedesEnd({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2025") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = annotateMissingUserEvents({ ast, diagnostic });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1063") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = harmonizeTexturePointerTernaries({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2005") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureSurfaceTargetResetForGM2005({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1064") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = removeRedeclaredGlobalFunctions({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2011") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureVertexBuffersAreClosed({ ast, diagnostic });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2009") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureVertexBeginPrecedesEnd({ ast, diagnostic });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2043") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureLocalVariablesAreDeclaredBeforeUse({
                    ast,
                    diagnostic
                });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2033") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = removeDanglingFileFindCalls({ ast, diagnostic });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2050") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureFogIsReset({ ast, diagnostic });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2035") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureGpuStateIsPopped({ ast, diagnostic });

                if (isNonEmptyArray(fixes)) {
                    return fixes;
                }

                return registerManualFeatherFix({ ast, diagnostic });
            });
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

        if (diagnosticId === "GM1017") {
            registerFeatherFixer(
                registry,
                diagnosticId,
                () =>
                    ({ ast, sourceText }) => {
                        const fixes = captureDeprecatedFunctionManualFixes({
                            ast,
                            sourceText,
                            diagnostic
                        });

                        if (isNonEmptyArray(fixes)) {
                            return fixes;
                        }

                        return registerManualFeatherFix({ ast, diagnostic });
                    }
            );
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

function resolveWithOtherVariableReferences({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const variableDeclarations = new Map();
    const ancestorStack = [];

    const visit = (
        node,
        parent,
        property,
        arrayOwner,
        arrayProperty,
        context
    ) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; index += 1) {
                visit(
                    node[index],
                    node,
                    index,
                    arrayOwner ?? parent,
                    arrayProperty ?? property,
                    context
                );
            }
            return;
        }

        ancestorStack.push(node);

        if (isVarVariableDeclaration(node)) {
            recordVariableDeclaration(variableDeclarations, {
                declaration: node,
                parent,
                property,
                owner: arrayOwner ?? null
            });
        }

        const insideWithOther = Boolean(context?.insideWithOther);

        if (insideWithOther && node.type === "Identifier") {
            convertIdentifierReference({
                identifier: node,
                parent,
                property,
                arrayOwner,
                arrayProperty,
                variableDeclarations,
                diagnostic,
                fixes,
                ancestorStack,
                context
            });
            ancestorStack.pop();
            return;
        }

        if (
            node.type === "WithStatement" &&
            isWithStatementTargetingOther(node)
        ) {
            visit(node.test, node, "test", null, null, {
                insideWithOther,
                withBodies: context?.withBodies ?? []
            });

            visit(node.body, node, "body", node, "body", {
                insideWithOther: true,
                withBodies: [...(context?.withBodies ?? []), node.body]
            });

            ancestorStack.pop();
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                visit(value, node, key, node, key, context);
            } else {
                visit(value, node, key, null, null, context);
            }
        }

        ancestorStack.pop();
    };

    visit(ast, null, null, null, null, {
        insideWithOther: false,
        withBodies: []
    });

    return fixes;
}

function recordVariableDeclaration(registry, context) {
    if (!registry || !context) {
        return;
    }

    const { declaration, parent, property, owner } = context;

    if (!Array.isArray(parent) || typeof property !== "number") {
        return;
    }

    const declarations = Array.isArray(declaration?.declarations)
        ? declaration.declarations
        : [];

    if (declarations.length !== 1) {
        return;
    }

    const declarator = declarations[0];

    if (
        !declarator ||
        declarator.id?.type !== "Identifier" ||
        !declarator.init
    ) {
        return;
    }

    const name = declarator.id.name;

    if (!name) {
        return;
    }

    const startIndex = getNodeStartIndex(declaration);
    const entry = {
        declaration,
        declarator,
        parent,
        property,
        owner,
        startIndex: typeof startIndex === "number" ? startIndex : null,
        replaced: false,
        invalid: false,
        assignment: null,
        fixDetail: null
    };

    if (!registry.has(name)) {
        registry.set(name, []);
    }

    registry.get(name).push(entry);
}

function convertIdentifierReference({
    identifier,
    parent,
    property,
    arrayOwner,
    arrayProperty,
    variableDeclarations,
    diagnostic,
    fixes,
    ancestorStack,
    context
}) {
    if (!identifier || identifier.type !== "Identifier") {
        return;
    }

    const ownerNode = Array.isArray(parent) ? arrayOwner : parent;
    const ownerProperty = Array.isArray(parent) ? arrayProperty : property;

    if (
        Array.isArray(parent) &&
        (!ownerNode || typeof ownerNode !== "object")
    ) {
        return;
    }

    if (
        !ownerNode ||
        !shouldConvertIdentifierInWith(identifier, ownerNode, ownerProperty)
    ) {
        return;
    }

    const candidates = variableDeclarations.get(identifier.name);

    if (!Array.isArray(candidates) || candidates.length === 0) {
        return;
    }

    const withBodies = Array.isArray(context?.withBodies)
        ? context.withBodies
        : [];
    const identifierStart = getNodeStartIndex(identifier);
    const identifierEnd = getNodeEndIndex(identifier);

    let matchedContext = null;

    for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const candidate = candidates[index];

        if (!candidate || candidate.invalid) {
            continue;
        }

        if (candidate.owner && withBodies.includes(candidate.owner)) {
            continue;
        }

        if (candidate.owner && !ancestorStack.includes(candidate.owner)) {
            continue;
        }

        if (
            typeof candidate.startIndex === "number" &&
            typeof identifierStart === "number" &&
            candidate.startIndex > identifierStart
        ) {
            continue;
        }

        matchedContext = candidate;
        break;
    }

    if (!matchedContext) {
        return;
    }

    if (!matchedContext.replaced) {
        const assignment = promoteVariableDeclaration(
            matchedContext,
            diagnostic,
            fixes
        );

        if (!assignment) {
            matchedContext.invalid = true;
            return;
        }
    }

    const memberExpression = createOtherMemberExpression(identifier);

    if (Array.isArray(parent)) {
        parent[property] = memberExpression;
    } else if (parent && typeof parent === "object") {
        parent[property] = memberExpression;
    }

    const range =
        typeof identifierStart === "number" && typeof identifierEnd === "number"
            ? { start: identifierStart, end: identifierEnd }
            : null;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: identifier.name ?? null,
        range
    });

    if (!fixDetail) {
        return;
    }

    attachFeatherFixMetadata(memberExpression, [fixDetail]);
    fixes.push(fixDetail);
}

function promoteVariableDeclaration(context, diagnostic, fixes) {
    if (!context || context.replaced) {
        return context?.assignment ?? null;
    }

    if (
        !Array.isArray(context.parent) ||
        typeof context.property !== "number"
    ) {
        return null;
    }

    const declaration = context.declaration;
    const declarator = context.declarator;

    if (
        !declarator ||
        declarator.id?.type !== "Identifier" ||
        !declarator.init
    ) {
        return null;
    }

    const assignment = {
        type: "AssignmentExpression",
        operator: "=",
        left: cloneIdentifier(declarator.id),
        right: declarator.init,
        start: cloneLocation(declaration.start),
        end: cloneLocation(declaration.end)
    };

    copyCommentMetadata(declaration, assignment);

    context.parent[context.property] = assignment;

    const startIndex = getNodeStartIndex(declaration);
    const endIndex = getNodeEndIndex(declaration);
    const range =
        typeof startIndex === "number" && typeof endIndex === "number"
            ? { start: startIndex, end: endIndex }
            : null;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: declarator.id?.name ?? null,
        range
    });

    if (fixDetail) {
        attachFeatherFixMetadata(assignment, [fixDetail]);
        fixes.push(fixDetail);
        context.fixDetail = fixDetail;
    }

    context.replaced = true;
    context.assignment = assignment;

    return assignment;
}

function isWithStatementTargetingOther(node) {
    if (!node || node.type !== "WithStatement") {
        return false;
    }

    const testExpression =
        node.test?.type === "ParenthesizedExpression"
            ? node.test.expression
            : node.test;

    return isIdentifierWithName(testExpression, "other");
}

function shouldConvertIdentifierInWith(identifier, parent, property) {
    if (!identifier || identifier.type !== "Identifier") {
        return false;
    }

    if (!parent || typeof parent !== "object") {
        return false;
    }

    if (identifier.name === "other" || identifier.name === "self") {
        return false;
    }

    if (parent.type === "AssignmentExpression" && property === "left") {
        return false;
    }

    if (parent.type === "CallExpression" && property === "object") {
        return false;
    }

    if (
        parent.type === "MemberDotExpression" ||
        parent.type === "MemberIndexExpression"
    ) {
        return false;
    }

    if (
        property === "property" ||
        property === "id" ||
        property === "name" ||
        property === "params"
    ) {
        return false;
    }

    if (
        parent.type === "FunctionDeclaration" ||
        parent.type === "FunctionExpression"
    ) {
        if (property === "name" || property === "id") {
            return false;
        }
    }

    if (parent.type === "StructLiteralMember" && property === "key") {
        return false;
    }

    return true;
}

function createOtherMemberExpression(identifier) {
    const memberExpression = {
        type: "MemberDotExpression",
        object: createIdentifier("other"),
        property: cloneIdentifier(identifier)
    };

    if (Object.hasOwn(identifier, "start")) {
        memberExpression.start = cloneLocation(identifier.start);
    }

    if (Object.hasOwn(identifier, "end")) {
        memberExpression.end = cloneLocation(identifier.end);
    }

    return memberExpression;
}

function createAutomaticFeatherFixHandlers() {
    return new Map([
        [
            "GM1009",
            ({ ast, diagnostic, sourceText }) => {
                const fixes = [];

                const attributeFixes = convertFileAttributeAdditionsToBitwiseOr(
                    {
                        ast,
                        diagnostic
                    }
                );

                if (isNonEmptyArray(attributeFixes)) {
                    fixes.push(...attributeFixes);
                }

                const roomFixes = convertRoomNavigationArithmetic({
                    ast,
                    diagnostic,
                    sourceText
                });

                if (isNonEmptyArray(roomFixes)) {
                    fixes.push(...roomFixes);
                }

                return fixes;
            }
        ],
        [
            "GM1021",
            ({ ast, diagnostic }) =>
                applyMissingFunctionCallCorrections({ ast, diagnostic })
        ],
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
            ({ ast, diagnostic, sourceText }) =>
                normalizeArgumentBuiltinReferences({
                    ast,
                    diagnostic,
                    sourceText
                })
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
            "GM1012",
            ({ ast, diagnostic }) =>
                convertStringLengthPropertyAccesses({ ast, diagnostic })
        ],
        [
            "GM1014",
            ({ ast, diagnostic }) => addMissingEnumMembers({ ast, diagnostic })
        ],
        [
            "GM1051",
            ({ ast, sourceText, diagnostic }) =>
                removeTrailingMacroSemicolons({ ast, sourceText, diagnostic })
        ],
        [
            "GM1015",
            ({ ast, diagnostic }) =>
                preventDivisionOrModuloByZero({ ast, diagnostic })
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
            "GM2026",
            ({ ast, diagnostic }) => ensureHalignIsReset({ ast, diagnostic })
        ],
        [
            "GM2029",
            ({ ast, diagnostic }) =>
                ensureDrawVertexCallsAreWrapped({ ast, diagnostic })
        ],
        [
            "GM1063",
            ({ ast, diagnostic }) =>
                harmonizeTexturePointerTernaries({ ast, diagnostic })
        ],
        [
            "GM2042",
            ({ ast, diagnostic }) => balanceGpuStateStack({ ast, diagnostic })
        ],
        [
            "GM2044",
            ({ ast, diagnostic }) =>
                deduplicateLocalVariableDeclarations({ ast, diagnostic })
        ],
        [
            "GM2046",
            ({ ast, diagnostic }) =>
                ensureSurfaceTargetsAreReset({ ast, diagnostic })
        ],
        [
            "GM2048",
            ({ ast, diagnostic }) =>
                ensureBlendEnableIsReset({ ast, diagnostic })
        ],
        [
            "GM2051",
            ({ ast, diagnostic }) => ensureCullModeIsReset({ ast, diagnostic })
        ],
        [
            "GM2052",
            ({ ast, diagnostic }) =>
                ensureColourWriteEnableIsReset({ ast, diagnostic })
        ],
        [
            "GM2053",
            ({ ast, diagnostic }) =>
                ensureAlphaTestEnableIsReset({ ast, diagnostic })
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
            "GM2061",
            ({ ast, diagnostic }) =>
                convertNullishCoalesceOpportunities({ ast, diagnostic })
        ],
        [
            "GM2064",
            ({ ast, diagnostic }) =>
                annotateInstanceVariableStructAssignments({ ast, diagnostic })
        ]
    ]);
}

function convertStringLengthPropertyAccesses({ ast, diagnostic }) {
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

        if (node.type === "MemberDotExpression") {
            const fix = convertLengthAccess(node, parent, property, diagnostic);

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

function convertLengthAccess(node, parent, property, diagnostic) {
    if (!node || node.type !== "MemberDotExpression") {
        return null;
    }

    if (!parent || property === undefined || property === null) {
        return null;
    }

    if (parent.type === "AssignmentExpression" && parent.left === node) {
        return null;
    }

    if (parent.type === "CallExpression" && parent.object === node) {
        return null;
    }

    const propertyIdentifier = node.property;

    if (!isIdentifierWithName(propertyIdentifier, "length")) {
        return null;
    }

    const argumentExpression = node.object;

    if (!argumentExpression || typeof argumentExpression !== "object") {
        return null;
    }

    if (!isStringReturningExpression(argumentExpression)) {
        return null;
    }

    const stringLengthIdentifier = createIdentifier(
        "string_length",
        propertyIdentifier
    );

    if (!stringLengthIdentifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: stringLengthIdentifier,
        arguments: [argumentExpression]
    };

    if (hasOwn(node, "start")) {
        callExpression.start = cloneLocation(node.start);
    }

    if (hasOwn(node, "end")) {
        callExpression.end = cloneLocation(node.end);
    }

    copyCommentMetadata(node, callExpression);

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

    if (Array.isArray(parent)) {
        parent[property] = callExpression;
    } else if (parent && typeof property === "string") {
        parent[property] = callExpression;
    } else {
        return null;
    }

    attachFeatherFixMetadata(callExpression, [fixDetail]);

    return fixDetail;
}

function isStringReturningExpression(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "CallExpression") {
        const callee = node.object;

        if (isIdentifierWithName(callee, "string")) {
            return true;
        }

        if (callee?.type === "Identifier") {
            const name = callee.name;

            if (STRING_LENGTH_CALL_BLACKLIST.has(name)) {
                return false;
            }

            if (name.startsWith("string_")) {
                return true;
            }
        }
    }

    return false;
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
                const args = getCallArgumentsOrEmpty(node);

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
        const name = toTrimmedString(entry?.name);

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

function sanitizeEnumAssignments({ ast, diagnostic }) {
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

        if (node.type === "EnumMember") {
            const fix = sanitizeEnumMember(node, diagnostic);

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

function sanitizeEnumMember(node, diagnostic) {
    if (!node || typeof node !== "object" || !diagnostic) {
        return null;
    }

    const initializer = node.initializer;

    if (!hasInvalidEnumInitializer(initializer)) {
        return null;
    }

    const originalEnd = getNodeEndIndex(node);
    const startIndex = getNodeStartIndex(node);

    node._featherOriginalInitializer = initializer ?? null;
    node.initializer = null;

    if (hasOwn(node.name ?? {}, "end")) {
        node.end = cloneLocation(node.name.end);
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.name?.name ?? null,
        range:
            typeof startIndex === "number" && typeof originalEnd === "number"
                ? {
                    start: startIndex,
                    end: originalEnd
                }
                : null
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function hasInvalidEnumInitializer(initializer) {
    if (initializer == null) {
        return false;
    }

    if (typeof initializer === "string") {
        const normalized = initializer.trim();

        if (normalized.length === 0) {
            return true;
        }

        if (isIntegerLiteralString(normalized)) {
            return false;
        }

        return true;
    }

    if (typeof initializer === "number") {
        return !Number.isInteger(initializer);
    }

    if (typeof initializer === "object") {
        if (initializer.type === "Literal") {
            const value = initializer.value;

            if (typeof value === "number") {
                return !Number.isInteger(value);
            }

            if (typeof value === "string") {
                return !isIntegerLiteralString(value.trim());
            }
        }

        return true;
    }

    return true;
}

function isIntegerLiteralString(candidate) {
    if (typeof candidate !== "string" || candidate.length === 0) {
        return false;
    }

    if (/^[+-]?\d+$/.test(candidate)) {
        return true;
    }

    if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(candidate)) {
        return true;
    }

    if (/^[+-]?0[bB][01]+$/.test(candidate)) {
        return true;
    }

    return false;
}

function splitGlobalVarInlineInitializers({ ast, diagnostic }) {
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

        if (node.type === "GlobalVarStatement") {
            const fixDetails = splitGlobalVarStatementInitializers({
                statement: node,
                parent,
                property,
                diagnostic
            });

            if (isNonEmptyArray(fixDetails)) {
                fixes.push(...fixDetails);
            }

            return;
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

function splitGlobalVarStatementInitializers({
    statement,
    parent,
    property,
    diagnostic
}) {
    if (!statement || statement.type !== "GlobalVarStatement") {
        return [];
    }

    if (!Array.isArray(parent) || typeof property !== "number") {
        return [];
    }

    const declarators = Array.isArray(statement.declarations)
        ? statement.declarations
        : [];

    if (declarators.length === 0) {
        return [];
    }

    const assignments = [];

    for (const declarator of declarators) {
        const assignmentInfo = createAssignmentFromGlobalVarDeclarator({
            statement,
            declarator,
            diagnostic
        });

        if (!assignmentInfo) {
            continue;
        }

        assignments.push(assignmentInfo);
        clearGlobalVarDeclaratorInitializer(declarator);
    }

    if (assignments.length === 0) {
        return [];
    }

    const fixDetails = assignments.map((entry) => entry.fixDetail);

    parent.splice(
        property + 1,
        0,
        ...assignments.map((entry) => entry.assignment)
    );

    attachFeatherFixMetadata(statement, fixDetails);

    for (const { assignment, fixDetail } of assignments) {
        attachFeatherFixMetadata(assignment, [fixDetail]);
    }

    return fixDetails;
}

function createAssignmentFromGlobalVarDeclarator({
    statement,
    declarator,
    diagnostic
}) {
    if (!declarator || declarator.type !== "VariableDeclarator") {
        return null;
    }

    const initializer = declarator.init;

    if (!initializer || typeof initializer !== "object") {
        return null;
    }

    const identifier = cloneIdentifier(declarator.id);

    if (!identifier) {
        return null;
    }

    if (declarator.id && declarator.id.isGlobalIdentifier) {
        identifier.isGlobalIdentifier = true;
    }

    const assignment = {
        type: "AssignmentExpression",
        operator: "=",
        left: identifier,
        right: initializer
    };

    if (hasOwn(declarator, "start")) {
        assignment.start = cloneLocation(declarator.start);
    } else if (hasOwn(statement, "start")) {
        assignment.start = cloneLocation(statement.start);
    }

    if (hasOwn(initializer, "end")) {
        assignment.end = cloneLocation(initializer.end);
    } else if (hasOwn(declarator, "end")) {
        assignment.end = cloneLocation(declarator.end);
    } else if (hasOwn(statement, "end")) {
        assignment.end = cloneLocation(statement.end);
    }

    copyCommentMetadata(declarator, assignment);
    copyCommentMetadata(initializer, assignment);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: identifier?.name ?? null,
        range: {
            start: getNodeStartIndex(declarator),
            end: getNodeEndIndex(declarator)
        }
    });

    if (!fixDetail) {
        return null;
    }

    return { assignment, fixDetail };
}

function clearGlobalVarDeclaratorInitializer(declarator) {
    if (!declarator || declarator.type !== "VariableDeclarator") {
        return;
    }

    declarator.init = null;

    if (
        declarator.id &&
        typeof declarator.id === "object" &&
        hasOwn(declarator.id, "end")
    ) {
        declarator.end = cloneLocation(declarator.id.end);
    }
}

const NODE_REMOVED = Symbol("flaggedInvalidAssignmentRemovedNode");

function flagInvalidAssignmentTargets({ ast, diagnostic, sourceText }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property, container, index) => {
        if (!node) {
            return null;
        }

        if (Array.isArray(node)) {
            for (
                let arrayIndex = 0;
                arrayIndex < node.length;
                arrayIndex += 1
            ) {
                const child = node[arrayIndex];
                const result = visit(child, parent, property, node, arrayIndex);

                if (result === NODE_REMOVED) {
                    arrayIndex -= 1;
                }
            }
            return null;
        }

        if (typeof node !== "object") {
            return null;
        }

        if (node.type === "ExpressionStatement") {
            const removalFix = removeInvalidAssignmentExpression({
                statement: node,
                container,
                index,
                diagnostic,
                sourceText
            });

            if (removalFix) {
                fixes.push(removalFix);
                return NODE_REMOVED;
            }
        }

        if (node.type === "AssignmentExpression") {
            const fix = flagInvalidAssignmentTarget(
                node,
                diagnostic,
                sourceText
            );

            if (fix) {
                if (
                    shouldRemoveInvalidAssignmentFromContainer({
                        parent,
                        property,
                        container
                    })
                ) {
                    removeNodeFromContainer(container, index, node);
                    fixes.push(fix);
                    return NODE_REMOVED;
                }

                fixes.push(fix);
            }

            return null;
        }

        for (const [childKey, value] of Object.entries(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                visit(value, node, childKey, value, null);
                continue;
            }

            visit(value, node, childKey, null, null);
        }

        return null;
    };

    visit(ast, null, null, null, null);

    return fixes;
}

function removeInvalidAssignmentExpression({
    statement,
    container,
    index,
    diagnostic,
    sourceText
}) {
    if (!statement || statement.type !== "ExpressionStatement") {
        return null;
    }

    const expression = statement.expression;

    if (!expression || expression.type !== "AssignmentExpression") {
        return null;
    }

    if (isAssignableTarget(expression.left)) {
        return null;
    }

    const fixDetail = flagInvalidAssignmentTarget(
        expression,
        diagnostic,
        sourceText
    );

    if (!fixDetail) {
        return null;
    }

    removeNodeFromContainer(container, index, statement);

    attachFeatherFixMetadata(statement, [fixDetail]);

    return fixDetail;
}

function getFiniteIndex(value) {
    return isFiniteNumber(value) && value >= 0 ? value : null;
}

function removeNodeFromContainer(container, index, node) {
    if (!Array.isArray(container)) {
        return;
    }

    let removalIndex = getFiniteIndex(index);

    if (removalIndex === null) {
        removalIndex = getFiniteIndex(container.indexOf(node));
    }

    if (removalIndex !== null) {
        container.splice(removalIndex, 1);
    }
}

function shouldRemoveInvalidAssignmentFromContainer({
    parent,
    property,
    container
}) {
    if (!parent || !Array.isArray(container) || property !== "body") {
        return false;
    }

    const parentType = parent?.type ?? null;

    return parentType === "Program" || parentType === "BlockStatement";
}

function flagInvalidAssignmentTarget(node, diagnostic, sourceText) {
    if (!node || node.type !== "AssignmentExpression") {
        return null;
    }

    const left = node.left;

    if (!left || isAssignableTarget(left)) {
        return null;
    }

    const startIndex = getNodeStartIndex(left);
    const endIndex = getNodeEndIndex(left);

    const range =
        typeof startIndex === "number" && typeof endIndex === "number"
            ? {
                start: startIndex,
                end: endIndex
            }
            : null;

    const targetText = getSourceTextSlice({
        sourceText,
        startIndex,
        endIndex
    });

    const fixDetail = createFeatherFixDetail(diagnostic, {
        automatic: false,
        range,
        target: targetText
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function isAssignableTarget(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (node.type === "Identifier") {
        return true;
    }

    if (
        node.type === "MemberDotExpression" ||
        node.type === "MemberIndexExpression"
    ) {
        return true;
    }

    return false;
}

function getSourceTextSlice({ sourceText, startIndex, endIndex }) {
    if (typeof sourceText !== "string") {
        return null;
    }

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    if (startIndex < 0 || endIndex > sourceText.length) {
        return null;
    }

    const slice = sourceText.slice(startIndex, endIndex);

    if (slice.length === 0) {
        return null;
    }

    return slice.trim() || null;
}

function convertReadOnlyBuiltInAssignments({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const nameRegistry = collectAllIdentifierNames(ast);

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
            const fixDetail = convertReadOnlyAssignment(
                node,
                parent,
                property,
                diagnostic,
                nameRegistry
            );

            if (fixDetail) {
                fixes.push(fixDetail);
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

function convertReadOnlyAssignment(
    node,
    parent,
    property,
    diagnostic,
    nameRegistry
) {
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

    const identifier = node.left;

    if (!identifier || identifier.type !== "Identifier") {
        return null;
    }

    if (!READ_ONLY_BUILT_IN_VARIABLES.has(identifier.name)) {
        return null;
    }

    const replacementName = createReadOnlyReplacementName(
        identifier.name,
        nameRegistry
    );
    const replacementIdentifier = createIdentifierFromTemplate(
        replacementName,
        identifier
    );

    const declarator = {
        type: "VariableDeclarator",
        id: replacementIdentifier,
        init: node.right,
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    const declaration = {
        type: "VariableDeclaration",
        declarations: [declarator],
        kind: "var",
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    copyCommentMetadata(node, declaration);

    parent[property] = declaration;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: identifier.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(declaration, [fixDetail]);

    replaceReadOnlyIdentifierReferences(
        parent,
        property + 1,
        identifier.name,
        replacementName
    );

    return fixDetail;
}

function replaceReadOnlyIdentifierReferences(
    siblings,
    startIndex,
    originalName,
    replacementName
) {
    if (!Array.isArray(siblings)) {
        return;
    }

    for (let index = startIndex; index < siblings.length; index += 1) {
        renameIdentifiersInNode(siblings[index], originalName, replacementName);
    }
}

function renameIdentifiersInNode(root, originalName, replacementName) {
    const stack = [{ node: root, parent: null, property: null, ancestors: [] }];

    while (stack.length > 0) {
        const { node, parent, property, ancestors } = stack.pop();

        if (!node) {
            continue;
        }

        if (Array.isArray(node)) {
            const arrayContext = { node, parent, property };
            const nextAncestors = ancestors.concat(arrayContext);

            for (let index = node.length - 1; index >= 0; index -= 1) {
                stack.push({
                    node: node[index],
                    parent: node,
                    property: index,
                    ancestors: nextAncestors
                });
            }
            continue;
        }

        if (typeof node !== "object") {
            continue;
        }

        if (node.type === "Identifier" && node.name === originalName) {
            if (
                !shouldSkipIdentifierReplacement({
                    parent,
                    property,
                    ancestors
                })
            ) {
                const replacement = createIdentifierFromTemplate(
                    replacementName,
                    node
                );

                if (parent && property !== null && property !== undefined) {
                    parent[property] = replacement;
                }
            }
            continue;
        }

        const nextAncestors = ancestors.concat({ node, parent, property });

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                stack.push({
                    node: value,
                    parent: node,
                    property: key,
                    ancestors: nextAncestors
                });
            }
        }
    }
}

const IDENTIFIER_DECLARATION_CONTEXTS = new Set([
    "VariableDeclarator:id",
    "FunctionDeclaration:id",
    "ConstructorDeclaration:id",
    "StructDeclaration:id",
    "EnumDeclaration:name",
    "EnumMember:name",
    "ConstructorParentClause:id",
    "MacroDeclaration:name",
    "NamespaceDeclaration:id",
    "DefaultParameter:left"
]);

function shouldSkipIdentifierReplacement({ parent, property, ancestors }) {
    if (!parent) {
        return true;
    }

    if (parent.type === "MemberDotExpression" && property === "property") {
        return true;
    }

    if (parent.type === "NamespaceAccessExpression" && property === "name") {
        return true;
    }

    const contextKey = parent.type ? `${parent.type}:${property}` : null;

    if (contextKey && IDENTIFIER_DECLARATION_CONTEXTS.has(contextKey)) {
        return true;
    }

    if (!Array.isArray(parent)) {
        return false;
    }

    let arrayIndex = -1;
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        if (ancestors[index].node === parent) {
            arrayIndex = index;
            break;
        }
    }

    if (arrayIndex === -1) {
        return false;
    }

    const arrayContext = ancestors[arrayIndex];
    const ownerContext = arrayIndex > 0 ? ancestors[arrayIndex - 1] : null;
    const containerNode = ownerContext?.node ?? null;
    const containerProperty = arrayContext?.property ?? null;

    if (
        containerNode &&
        containerProperty === "params" &&
        (containerNode.type === "FunctionDeclaration" ||
            containerNode.type === "ConstructorDeclaration" ||
            containerNode.type === "StructDeclaration" ||
            containerNode.type === "ConstructorParentClause")
    ) {
        return true;
    }

    return false;
}

function createReadOnlyReplacementName(originalName, nameRegistry) {
    const baseName = isNonEmptyString(originalName) ? originalName : "value";
    const sanitized = baseName.replace(/[^a-zA-Z0-9_]/g, "_");
    let candidate = `__feather_${sanitized}`;
    let suffix = 1;

    while (nameRegistry.has(candidate)) {
        suffix += 1;
        candidate = `__feather_${sanitized}_${suffix}`;
    }

    nameRegistry.add(candidate);

    return candidate;
}

function collectAllIdentifierNames(root) {
    const names = new Set();

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            for (const value of node) {
                visit(value);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
        }

        if (node.type === "Identifier" && typeof node.name === "string") {
            names.add(node.name);
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(root);

    return names;
}

function convertFileAttributeAdditionsToBitwiseOr({ ast, diagnostic }) {
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

        if (node.type === "BinaryExpression") {
            const fix = normalizeFileAttributeAddition(node, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
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

function normalizeFileAttributeAddition(node, diagnostic) {
    if (!node || node.type !== "BinaryExpression") {
        return null;
    }

    if (node.operator !== "+") {
        return null;
    }

    const leftIdentifier = unwrapIdentifierFromExpression(node.left);
    const rightIdentifier = unwrapIdentifierFromExpression(node.right);

    if (
        !isFileAttributeIdentifier(leftIdentifier) ||
        !isFileAttributeIdentifier(rightIdentifier)
    ) {
        return null;
    }

    const originalOperator = node.operator;
    node.operator = "|";

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: originalOperator ?? null,
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

function unwrapIdentifierFromExpression(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Identifier") {
        return node;
    }

    if (node.type === "ParenthesizedExpression") {
        return unwrapIdentifierFromExpression(node.expression);
    }

    return null;
}

function unwrapLiteralFromExpression(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Literal") {
        return node;
    }

    if (node.type === "ParenthesizedExpression") {
        return unwrapLiteralFromExpression(node.expression);
    }

    return null;
}

function isFileAttributeIdentifier(node) {
    if (!node || node.type !== "Identifier") {
        return false;
    }

    if (typeof node.name !== "string") {
        return false;
    }

    return FILE_ATTRIBUTE_IDENTIFIER_PATTERN.test(node.name);
}

function convertRoomNavigationArithmetic({ ast, diagnostic, sourceText }) {
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
            const fix = rewriteRoomGotoCall({
                node,
                diagnostic,
                sourceText
            });

            if (fix) {
                fixes.push(fix);
            }
        }

        if (node.type === "BinaryExpression") {
            const fix = rewriteRoomNavigationBinaryExpression({
                node,
                parent,
                property,
                diagnostic,
                sourceText
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

function rewriteRoomNavigationBinaryExpression({
    node,
    parent,
    property,
    diagnostic,
    sourceText
}) {
    if (!node || node.type !== "BinaryExpression") {
        return null;
    }

    if (!isEligibleRoomBinaryParent(parent, property)) {
        return null;
    }

    const navigation = resolveRoomNavigationFromBinaryExpression(node);

    if (!navigation) {
        return null;
    }

    const { direction, baseIdentifier } = navigation;
    const replacementName =
        direction === "previous" ? "room_previous" : "room_next";
    const calleeIdentifier = createIdentifier(replacementName, baseIdentifier);
    const argumentIdentifier = cloneIdentifier(baseIdentifier);

    if (!calleeIdentifier || !argumentIdentifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: calleeIdentifier,
        arguments: [argumentIdentifier]
    };

    if (Object.hasOwn(node, "start")) {
        callExpression.start = cloneLocation(node.start);
    }

    if (Object.hasOwn(node, "end")) {
        callExpression.end = cloneLocation(node.end);
    }

    copyCommentMetadata(node, callExpression);

    const startIndex = getNodeStartIndex(node);
    const endIndex = getNodeEndIndex(node);
    const range =
        typeof startIndex === "number" && typeof endIndex === "number"
            ? { start: startIndex, end: endIndex }
            : null;

    const target =
        getSourceTextSlice({
            sourceText,
            startIndex,
            endIndex
        }) ?? null;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target,
        range
    });

    if (!fixDetail) {
        return null;
    }

    fixDetail.replacement = replacementName;

    if (Array.isArray(parent)) {
        parent[property] = callExpression;
    } else if (parent && typeof property === "string") {
        parent[property] = callExpression;
    } else {
        return null;
    }

    attachFeatherFixMetadata(callExpression, [fixDetail]);

    return fixDetail;
}

function rewriteRoomGotoCall({ node, diagnostic, sourceText }) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "room_goto")) {
        return null;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length !== 1) {
        return null;
    }

    const navigation = resolveRoomNavigationFromBinaryExpression(args[0]);

    if (!navigation) {
        return null;
    }

    const replacementName =
        navigation.direction === "previous"
            ? "room_goto_previous"
            : "room_goto_next";

    const startIndex = getNodeStartIndex(node);
    const endIndex = getNodeEndIndex(node);
    const range =
        typeof startIndex === "number" && typeof endIndex === "number"
            ? { start: startIndex, end: endIndex }
            : null;

    const target =
        getSourceTextSlice({
            sourceText,
            startIndex,
            endIndex
        }) ??
        node.object?.name ??
        null;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target,
        range
    });

    if (!fixDetail) {
        return null;
    }

    fixDetail.replacement = replacementName;

    const updatedCallee = createIdentifier(replacementName, node.object);

    if (!updatedCallee) {
        return null;
    }

    node.object = updatedCallee;
    node.arguments = [];

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function resolveRoomNavigationFromBinaryExpression(node) {
    if (!node || node.type !== "BinaryExpression") {
        return null;
    }

    const leftIdentifier = unwrapIdentifierFromExpression(node.left);
    const rightIdentifier = unwrapIdentifierFromExpression(node.right);
    const leftLiteral = unwrapLiteralFromExpression(node.left);
    const rightLiteral = unwrapLiteralFromExpression(node.right);

    if (isIdentifierWithName(leftIdentifier, "room")) {
        if (node.operator === "+") {
            if (isLiteralOne(rightLiteral)) {
                return { direction: "next", baseIdentifier: leftIdentifier };
            }

            if (isNegativeOneLiteral(rightLiteral)) {
                return {
                    direction: "previous",
                    baseIdentifier: leftIdentifier
                };
            }
        }

        if (node.operator === "-") {
            if (isLiteralOne(rightLiteral)) {
                return {
                    direction: "previous",
                    baseIdentifier: leftIdentifier
                };
            }

            if (isNegativeOneLiteral(rightLiteral)) {
                return { direction: "next", baseIdentifier: leftIdentifier };
            }
        }
    }

    if (isIdentifierWithName(rightIdentifier, "room")) {
        if (node.operator === "+") {
            if (isLiteralOne(leftLiteral)) {
                return { direction: "next", baseIdentifier: rightIdentifier };
            }

            if (isNegativeOneLiteral(leftLiteral)) {
                return {
                    direction: "previous",
                    baseIdentifier: rightIdentifier
                };
            }
        }

        if (node.operator === "-") {
            if (isLiteralOne(leftLiteral)) {
                return {
                    direction: "previous",
                    baseIdentifier: rightIdentifier
                };
            }

            if (isNegativeOneLiteral(leftLiteral)) {
                return { direction: "next", baseIdentifier: rightIdentifier };
            }
        }
    }

    return null;
}

function isEligibleRoomBinaryParent(parent, property) {
    if (!parent) {
        return false;
    }

    if (parent.type === "VariableDeclarator" && property === "init") {
        return true;
    }

    if (parent.type === "AssignmentExpression" && property === "right") {
        return true;
    }

    return false;
}

function preventDivisionOrModuloByZero({ ast, diagnostic }) {
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

        if (node.type === "BinaryExpression") {
            const fix = normalizeDivisionBinaryExpression(node, diagnostic);

            if (fix) {
                fixes.push(fix);
            }
        } else if (node.type === "AssignmentExpression") {
            const fix = normalizeDivisionAssignmentExpression(node, diagnostic);

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

function normalizeDivisionBinaryExpression(node, diagnostic) {
    if (!node || node.type !== "BinaryExpression") {
        return null;
    }

    if (node.operator !== "/" && node.operator !== "%") {
        return null;
    }

    const zeroLiteralInfo = findZeroLiteralInfo(node.right);

    if (!zeroLiteralInfo) {
        return null;
    }

    const { literal, container, property } = zeroLiteralInfo;
    const replacementLiteral = createLiteral("1", literal);

    if (!replacementLiteral) {
        return null;
    }

    if (container && property) {
        container[property] = replacementLiteral;
    } else {
        node.right = replacementLiteral;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: literal?.value ?? null,
        range: {
            start: getNodeStartIndex(literal),
            end: getNodeEndIndex(literal)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function normalizeDivisionAssignmentExpression(node, diagnostic) {
    if (!node || node.type !== "AssignmentExpression") {
        return null;
    }

    if (node.operator !== "/=" && node.operator !== "%=") {
        return null;
    }

    const zeroLiteralInfo = findZeroLiteralInfo(node.right);

    if (!zeroLiteralInfo) {
        return null;
    }

    const { literal, container, property } = zeroLiteralInfo;
    const replacementLiteral = createLiteral("1", literal);

    if (!replacementLiteral) {
        return null;
    }

    if (container && property) {
        container[property] = replacementLiteral;
    } else {
        node.right = replacementLiteral;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: literal?.value ?? null,
        range: {
            start: getNodeStartIndex(literal),
            end: getNodeEndIndex(literal)
        }
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function findZeroLiteralInfo(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "Literal") {
        return isZeroLiteral(node)
            ? { literal: node, container: null, property: null }
            : null;
    }

    if (node.type === "ParenthesizedExpression") {
        if (!node.expression || typeof node.expression !== "object") {
            return null;
        }

        const innerInfo = findZeroLiteralInfo(node.expression);

        if (!innerInfo) {
            return null;
        }

        if (!innerInfo.container) {
            return {
                literal: innerInfo.literal,
                container: node,
                property: "expression"
            };
        }

        return innerInfo;
    }

    if (node.type === "UnaryExpression") {
        if (node.operator !== "+" && node.operator !== "-") {
            return null;
        }

        if (!node.argument || typeof node.argument !== "object") {
            return null;
        }

        const innerInfo = findZeroLiteralInfo(node.argument);

        if (!innerInfo) {
            return null;
        }

        if (!innerInfo.container) {
            return {
                literal: innerInfo.literal,
                container: node,
                property: "argument"
            };
        }

        return innerInfo;
    }

    return null;
}

function isZeroLiteral(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    const rawValue = node.value;

    if (typeof rawValue === "number") {
        return rawValue === 0;
    }

    if (typeof rawValue !== "string" || rawValue.length === 0) {
        return false;
    }

    const normalized = Number(rawValue);

    if (!Number.isFinite(normalized)) {
        return false;
    }

    return normalized === 0;
}

function normalizeArgumentBuiltinReferences({ ast, diagnostic, sourceText }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const documentedParamNamesByFunction = buildDocumentedParamNameLookup(
        ast,
        sourceText
    );

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
            const documentedParamNames =
                documentedParamNamesByFunction.get(node) ?? new Set();
            const functionFixes = fixArgumentReferencesWithinFunction(
                node,
                diagnostic,
                documentedParamNames
            );

            if (isNonEmptyArray(functionFixes)) {
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

function fixArgumentReferencesWithinFunction(
    functionNode,
    diagnostic,
    documentedParamNames = new Set()
) {
    const fixes = [];
    const references = [];
    const aliasDeclarations = [];

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

        if (node.type === "VariableDeclarator") {
            const aliasIndex = getArgumentIdentifierIndex(node.init);

            if (
                typeof aliasIndex === "number" &&
                node.id?.type === "Identifier" &&
                typeof node.id.name === "string" &&
                node.id.name.length > 0
            ) {
                aliasDeclarations.push({
                    index: aliasIndex,
                    name: node.id.name,
                    init: node.init,
                    declarator: node
                });
            }
        }

        if (node !== functionNode && isFunctionLikeNode(node)) {
            const nestedFixes = fixArgumentReferencesWithinFunction(
                node,
                diagnostic,
                documentedParamNames
            );

            if (isNonEmptyArray(nestedFixes)) {
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

    if (documentedParamNames.size > 0 && aliasDeclarations.length > 0) {
        const normalizedDocNames = new Set(
            [...documentedParamNames].map(normalizeDocParamNameForComparison)
        );

        const aliasInfos = aliasDeclarations
            .map((alias) => {
                const mappedIndex = mapping.get(alias.index);
                const normalizedAliasName =
                    typeof alias.name === "string" ? alias.name : null;

                return {
                    index:
                        typeof mappedIndex === "number"
                            ? mappedIndex
                            : alias.index,
                    name: normalizedAliasName,
                    init: alias.init,
                    declarator: alias.declarator
                };
            })
            .filter(
                (alias) =>
                    typeof alias.index === "number" &&
                    typeof alias.name === "string" &&
                    alias.name.length > 0 &&
                    normalizedDocNames.has(
                        normalizeDocParamNameForComparison(alias.name)
                    )
            );

        if (aliasInfos.length > 0) {
            const aliasByIndex = new Map();
            const aliasInitNodes = new Set();

            for (const alias of aliasInfos) {
                aliasByIndex.set(alias.index, alias);
                if (alias.init) {
                    aliasInitNodes.add(alias.init);
                }
            }

            for (const reference of references) {
                const normalizedIndex = mapping.has(reference.index)
                    ? mapping.get(reference.index)
                    : reference.index;
                const alias = aliasByIndex.get(normalizedIndex);

                if (!alias || aliasInitNodes.has(reference.node)) {
                    continue;
                }

                if (reference.node?.type !== "Identifier") {
                    continue;
                }

                if (reference.node.name === alias.name) {
                    continue;
                }

                const aliasStart = getNodeStartIndex(alias.declarator);
                const referenceStart = getNodeStartIndex(reference.node);

                if (
                    typeof aliasStart === "number" &&
                    typeof referenceStart === "number" &&
                    referenceStart < aliasStart
                ) {
                    continue;
                }

                const aliasFixDetail = createFeatherFixDetail(diagnostic, {
                    target: alias.name,
                    range: {
                        start: getNodeStartIndex(reference.node),
                        end: getNodeEndIndex(reference.node)
                    }
                });

                if (aliasFixDetail) {
                    attachFeatherFixMetadata(reference.node, [aliasFixDetail]);
                    fixes.push(aliasFixDetail);
                }

                reference.node.name = alias.name;
            }
        }
    }

    return fixes;
}

function buildDocumentedParamNameLookup(ast, sourceText) {
    const lookup = new WeakMap();

    if (!ast || typeof ast !== "object") {
        return lookup;
    }

    const comments = Array.isArray(ast.comments) ? ast.comments : [];
    const paramComments = comments
        .filter(
            (comment) =>
                comment &&
                comment.type === "CommentLine" &&
                typeof comment.value === "string" &&
                /@param\b/i.test(comment.value)
        )
        .sort((left, right) => {
            const leftStart =
                typeof left.start === "number"
                    ? left.start
                    : Number.NEGATIVE_INFINITY;
            const rightStart =
                typeof right.start === "number"
                    ? right.start
                    : Number.NEGATIVE_INFINITY;
            return leftStart - rightStart;
        });

    if (paramComments.length === 0) {
        return lookup;
    }

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
            const documentedNames = extractDocumentedParamNames(
                node,
                paramComments,
                sourceText
            );

            if (documentedNames.size > 0) {
                lookup.set(node, documentedNames);
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

    return lookup;
}

function extractDocumentedParamNames(functionNode, paramComments, sourceText) {
    const documentedNames = new Set();
    if (!functionNode || typeof functionNode !== "object") {
        return documentedNames;
    }

    const functionStart = getNodeStartIndex(functionNode);

    if (typeof functionStart !== "number") {
        return documentedNames;
    }

    let lastIndex = -1;

    for (let index = paramComments.length - 1; index >= 0; index -= 1) {
        const comment = paramComments[index];
        const commentEnd = getCommentEndIndex(comment);

        if (commentEnd !== null && commentEnd < functionStart) {
            lastIndex = index;
            break;
        }
    }

    if (lastIndex === -1) {
        return documentedNames;
    }

    let boundary = functionStart;

    for (let index = lastIndex; index >= 0; index -= 1) {
        const comment = paramComments[index];
        const commentEnd = getCommentEndIndex(comment);
        const commentStart = getCommentStartIndex(comment);

        if (commentEnd === null || commentEnd >= boundary) {
            continue;
        }

        if (typeof commentStart === "number" && commentStart >= boundary) {
            continue;
        }

        if (!isWhitespaceBetween(commentEnd + 1, boundary, sourceText)) {
            break;
        }

        const paramName = extractParamNameFromComment(comment.value);

        if (!paramName) {
            break;
        }

        documentedNames.add(paramName);
        boundary = typeof commentStart === "number" ? commentStart : commentEnd;
    }

    return documentedNames;
}

function getCommentStartIndex(comment) {
    if (!comment || typeof comment !== "object") {
        return null;
    }

    const start = comment.start;

    if (typeof start === "number") {
        return start;
    }

    if (start && typeof start.index === "number") {
        return start.index;
    }

    return null;
}

function isWhitespaceBetween(startIndex, endIndex, sourceText) {
    if (!sourceText || typeof sourceText !== "string") {
        return true;
    }

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return true;
    }

    if (startIndex >= endIndex) {
        return true;
    }

    const slice = sourceText.slice(startIndex, endIndex);
    return !/\S/.test(slice);
}

function extractParamNameFromComment(value) {
    if (typeof value !== "string") {
        return null;
    }

    const match = value.match(/@param\s+(?:\{[^}]+\}\s*)?(\S+)/i);
    if (!match) {
        return null;
    }

    let name = match[1] ?? "";
    name = name.trim();

    if (name.startsWith("[") && name.endsWith("]")) {
        name = name.slice(1, -1);
    }

    const equalsIndex = name.indexOf("=");
    if (equalsIndex !== -1) {
        name = name.slice(0, equalsIndex);
    }

    return name.trim();
}

function normalizeDocParamNameForComparison(name) {
    if (typeof name !== "string") {
        return "";
    }

    return name.trim().toLowerCase();
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

    if (hasOwn(argument, "start")) {
        declarator.start = cloneLocation(argument.start);
    }

    if (hasOwn(argument, "end")) {
        declarator.end = cloneLocation(argument.end);
    }

    const variableDeclaration = {
        type: "VariableDeclaration",
        declarations: [declarator],
        kind: "var"
    };

    if (hasOwn(node, "start")) {
        variableDeclaration.start = cloneLocation(node.start);
    }

    if (hasOwn(node, "end")) {
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

    if (hasOwn(node, "start")) {
        rewrittenStatement.start = cloneLocation(node.start);
    }

    if (hasOwn(node, "end")) {
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
    } else if (isObjectLike(parent)) {
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

        if (isNonEmptyArray(node.body)) {
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

        if (!isBooleanLiteral(expression, true)) {
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
        typeof diagnostic.correction === "string" ? diagnostic.correction : "";
    const goodExample =
        typeof diagnostic.goodExample === "string"
            ? diagnostic.goodExample
            : "";

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

function hasDisabledColourChannel(args) {
    if (!Array.isArray(args)) {
        return false;
    }

    const channels = args.slice(0, 4);

    return channels.some((argument) => isLiteralFalse(argument));
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

function ensureVarDeclarationsAreTerminated({ ast, sourceText, diagnostic }) {
    if (
        !diagnostic ||
        !ast ||
        typeof ast !== "object" ||
        typeof sourceText !== "string"
    ) {
        return [];
    }

    if (sourceText.length === 0) {
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

        if (isVarVariableDeclaration(node)) {
            const fix = ensureVarDeclarationIsTerminated(
                node,
                ast,
                sourceText,
                diagnostic
            );

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

function ensureVarDeclarationIsTerminated(node, ast, sourceText, diagnostic) {
    if (!node || node.type !== "VariableDeclaration" || node.kind !== "var") {
        return null;
    }

    if (variableDeclarationHasTerminatingSemicolon(node, sourceText)) {
        return null;
    }

    const target = extractVariableDeclarationTarget(node);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    preserveTrailingCommentAlignmentForVarDeclaration({
        declaration: node,
        ast,
        sourceText
    });

    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function extractVariableDeclarationTarget(node) {
    if (!node || node.type !== "VariableDeclaration") {
        return null;
    }

    const declarations = Array.isArray(node.declarations)
        ? node.declarations
        : [];

    if (declarations.length === 0) {
        return null;
    }

    const [firstDeclarator] = declarations;
    const identifier = firstDeclarator?.id;

    if (!identifier || identifier.type !== "Identifier") {
        return null;
    }

    return identifier.name ?? null;
}

function variableDeclarationHasTerminatingSemicolon(node, sourceText) {
    if (
        !node ||
        node.type !== "VariableDeclaration" ||
        typeof sourceText !== "string"
    ) {
        return true;
    }

    const length = sourceText.length;
    if (length === 0) {
        return true;
    }

    const searchStart = getNodeEndIndex(node);

    if (typeof searchStart !== "number") {
        return true;
    }

    let index = searchStart;

    while (index < length) {
        const char = sourceText[index];

        if (char === ";") {
            return true;
        }

        if (char === " " || char === "\t" || char === "\v" || char === "\f") {
            index += 1;
            continue;
        }

        if (char === "\r") {
            return false;
        }

        if (char === "\n") {
            return false;
        }

        if (char === "/") {
            const nextChar = sourceText[index + 1];

            if (nextChar === "/") {
                return false;
            }

            if (nextChar === "*") {
                const closingIndex = sourceText.indexOf("*/", index + 2);

                if (closingIndex === -1) {
                    return false;
                }

                index = closingIndex + 2;
                continue;
            }

            return false;
        }

        if (char === "\u2028" || char === "\u2029") {
            return false;
        }

        if (char && char.trim() === "") {
            index += 1;
            continue;
        }

        return false;
    }

    return false;
}

function preserveTrailingCommentAlignmentForVarDeclaration({
    declaration,
    ast,
    sourceText
}) {
    if (
        !declaration ||
        declaration.type !== "VariableDeclaration" ||
        typeof sourceText !== "string" ||
        sourceText.length === 0 ||
        !ast ||
        typeof ast !== "object"
    ) {
        return;
    }

    const commentStartIndex = findLineCommentStartIndexAfterDeclaration(
        declaration,
        sourceText
    );

    if (commentStartIndex == null) {
        return;
    }

    const comment = findLineCommentStartingAt(ast, commentStartIndex);

    if (!comment) {
        return;
    }

    markCommentForTrailingPaddingPreservation(comment);
}

function findLineCommentStartIndexAfterDeclaration(declaration, sourceText) {
    const endIndex = getNodeEndIndex(declaration);

    if (typeof endIndex !== "number") {
        return null;
    }

    const length = sourceText.length;

    for (let index = endIndex; index < length; index += 1) {
        const char = sourceText[index];

        if (char === " " || char === "\t" || char === "\v" || char === "\f") {
            continue;
        }

        if (
            char === "\r" ||
            char === "\n" ||
            char === "\u2028" ||
            char === "\u2029"
        ) {
            return null;
        }

        if (char === "/" && sourceText[index + 1] === "/") {
            return index;
        }

        return null;
    }

    return null;
}

function findLineCommentStartingAt(ast, startIndex) {
    if (typeof startIndex !== "number" || startIndex < 0) {
        return null;
    }

    const comments = collectCommentNodes(ast);

    if (comments.length === 0) {
        return null;
    }

    for (const comment of comments) {
        if (comment?.type !== "CommentLine") {
            continue;
        }

        const commentStartIndex = getNodeStartIndex(comment);

        if (typeof commentStartIndex !== "number") {
            continue;
        }

        if (commentStartIndex === startIndex) {
            return comment;
        }
    }

    return null;
}

function markCommentForTrailingPaddingPreservation(comment) {
    if (!comment || typeof comment !== "object") {
        return;
    }

    const key = "_featherPreserveTrailingPadding";

    if (comment[key] === true) {
        return;
    }

    Object.defineProperty(comment, key, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: true
    });
}

function captureDeprecatedFunctionManualFixes({ ast, sourceText, diagnostic }) {
    if (
        !diagnostic ||
        !ast ||
        typeof ast !== "object" ||
        typeof sourceText !== "string"
    ) {
        return [];
    }

    const deprecatedFunctions = collectDeprecatedFunctionNames(ast, sourceText);

    if (!deprecatedFunctions || deprecatedFunctions.size === 0) {
        return [];
    }

    const fixes = [];
    const seenLocations = new Set();

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
            const fix = recordDeprecatedCallMetadata(
                node,
                deprecatedFunctions,
                diagnostic
            );

            if (fix) {
                const startIndex = fix.range?.start;
                const endIndex = fix.range?.end;
                const locationKey = `${startIndex}:${endIndex}`;

                if (!seenLocations.has(locationKey)) {
                    seenLocations.add(locationKey);
                    fixes.push(fix);
                    attachFeatherFixMetadata(node, [fix]);
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

function recordDeprecatedCallMetadata(node, deprecatedFunctions, diagnostic) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const callee = node.object;

    if (!callee || callee.type !== "Identifier") {
        return null;
    }

    const functionName = callee.name;

    if (!deprecatedFunctions.has(functionName)) {
        return null;
    }

    const startIndex = getNodeStartIndex(node);
    const endIndex = getNodeEndIndex(node);

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: functionName,
        range: {
            start: startIndex,
            end: endIndex
        },
        automatic: false
    });

    return fixDetail;
}

function collectDeprecatedFunctionNames(ast, sourceText) {
    const names = new Set();

    if (!ast || typeof ast !== "object") {
        return names;
    }

    const comments = getCommentArray(ast);
    const body = getBodyStatements(ast);

    if (comments.length === 0 || body.length === 0) {
        return names;
    }

    const sortedComments = comments
        .filter((comment) => typeof getCommentEndIndex(comment) === "number")
        .sort(
            (left, right) =>
                getCommentEndIndex(left) - getCommentEndIndex(right)
        );

    const nodes = body
        .filter((node) => node && typeof node === "object")
        .sort((left, right) => {
            const leftIndex = getNodeStartIndex(left);
            const rightIndex = getNodeStartIndex(right);

            if (
                typeof leftIndex !== "number" ||
                typeof rightIndex !== "number"
            ) {
                return 0;
            }

            return leftIndex - rightIndex;
        });

    let commentIndex = 0;

    for (const node of nodes) {
        if (!node || node.type !== "FunctionDeclaration") {
            continue;
        }

        const startIndex = getNodeStartIndex(node);

        if (typeof startIndex !== "number") {
            continue;
        }

        while (
            commentIndex < sortedComments.length &&
            getCommentEndIndex(sortedComments[commentIndex]) < startIndex
        ) {
            commentIndex += 1;
        }

        const comment = sortedComments[commentIndex - 1];

        if (!isDeprecatedComment(comment)) {
            continue;
        }

        const commentEnd = getCommentEndIndex(comment);

        if (typeof commentEnd !== "number") {
            continue;
        }

        const between = sourceText.slice(commentEnd + 1, startIndex);

        if (!isWhitespaceOnly(between)) {
            continue;
        }

        const identifier =
            typeof node.id === "string" ? node.id : node.id?.name;

        if (identifier) {
            names.add(identifier);
        }
    }

    return names;
}

function getCommentEndIndex(comment) {
    if (!comment) {
        return null;
    }

    const end = comment.end;

    if (typeof end === "number") {
        return end;
    }

    if (end && typeof end.index === "number") {
        return end.index;
    }

    return null;
}

function isDeprecatedComment(comment) {
    if (!comment || typeof comment.value !== "string") {
        return false;
    }

    return /@deprecated\b/i.test(comment.value);
}

function isWhitespaceOnly(text) {
    return !isNonEmptyTrimmedString(text);
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
            const args = getCallArgumentsOrEmpty(node);

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

    if (literal._skipNumericStringCoercion) {
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
            const functionName = isNonEmptyString(node.id) ? node.id : null;

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
                if (isNonEmptyString(name)) {
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
        if (!isNonEmptyString(name)) {
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

            const params = getArrayProperty(node, "params");
            for (const param of params) {
                visit(param, node, "params");
            }

            visit(node.body, node, "body");
            popScope();
            return;
        }

        if (isVarVariableDeclaration(node)) {
            const fixDetails = handleVariableDeclaration(
                node,
                parent,
                property
            );

            if (isNonEmptyArray(fixDetails)) {
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
            if (isNonEmptyArray(functionFixes)) {
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

function closeOpenVertexBatches({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            if (isStatementList(parent, property)) {
                const statementFixes = ensureVertexBatchesClosed(
                    node,
                    diagnostic
                );

                if (
                    Array.isArray(statementFixes) &&
                    statementFixes.length > 0
                ) {
                    fixes.push(...statementFixes);
                }
            }

            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
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

function ensureVertexBatchesClosed(statements, diagnostic) {
    if (!Array.isArray(statements) || statements.length === 0 || !diagnostic) {
        return [];
    }

    const fixes = [];
    let lastBeginCall = null;

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (isVertexBeginCallNode(statement)) {
            if (lastBeginCall) {
                const vertexEndCall =
                    createVertexEndCallFromBegin(lastBeginCall);
                const fixDetail = createFeatherFixDetail(diagnostic, {
                    target: getVertexBatchTarget(lastBeginCall),
                    range: {
                        start: getNodeStartIndex(lastBeginCall),
                        end: getNodeEndIndex(lastBeginCall)
                    }
                });

                if (vertexEndCall && fixDetail) {
                    statements.splice(index, 0, vertexEndCall);
                    attachFeatherFixMetadata(vertexEndCall, [fixDetail]);
                    fixes.push(fixDetail);
                    index += 1;
                }

                lastBeginCall = null;
            }

            lastBeginCall = statement;
            continue;
        }

        if (isVertexEndCallNode(statement)) {
            lastBeginCall = null;
        }
    }

    return fixes;
}

function isVertexBeginCallNode(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return isIdentifierWithName(node.object, "vertex_begin");
}

function isVertexEndCallNode(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return isIdentifierWithName(node.object, "vertex_end");
}

function getVertexBatchTarget(callExpression) {
    if (!callExpression || callExpression.type !== "CallExpression") {
        return null;
    }

    const args = getCallArgumentsOrEmpty(callExpression);

    if (args.length > 0) {
        const firstArgument = args[0];

        if (isIdentifier(firstArgument)) {
            return firstArgument.name ?? null;
        }
    }

    return callExpression.object?.name ?? null;
}

function createVertexEndCallFromBegin(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = createIdentifier("vertex_end", template.object);

    if (!identifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: []
    };

    if (isNonEmptyArray(template.arguments)) {
        const clonedArgument = cloneNode(template.arguments[0]);

        if (clonedArgument) {
            callExpression.arguments.push(clonedArgument);
        }
    }

    if (hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function localizeInstanceVariableAssignments({ ast, diagnostic, sourceText }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const eventMarkers = buildEventMarkerIndex(ast);
    const memberPropertyNames = collectMemberPropertyNames(ast);

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
            const fix = convertAssignmentToLocalVariable({
                node,
                parent,
                property,
                diagnostic,
                eventMarkers,
                memberPropertyNames,
                sourceText,
                programAst: ast
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

function convertAssignmentToLocalVariable({
    node,
    parent,
    property,
    diagnostic,
    eventMarkers,
    memberPropertyNames,
    sourceText,
    programAst
}) {
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

    const left = node.left;

    if (!isIdentifier(left)) {
        return null;
    }

    const identifierName = left?.name;
    const originalIdentifierName =
        typeof sourceText === "string"
            ? getOriginalIdentifierName(left, sourceText)
            : null;

    if (
        identifierName &&
        memberPropertyNames &&
        memberPropertyNames.has(identifierName)
    ) {
        return null;
    }

    if (
        originalIdentifierName &&
        memberPropertyNames &&
        memberPropertyNames.has(originalIdentifierName)
    ) {
        return null;
    }

    if (!Array.isArray(eventMarkers) || eventMarkers.length === 0) {
        return null;
    }

    const eventMarker = findEventMarkerForIndex(
        eventMarkers,
        getNodeStartIndex(node)
    );

    if (!eventMarker || isCreateEventMarker(eventMarker)) {
        return null;
    }

    const clonedIdentifier = cloneIdentifier(left);

    if (!clonedIdentifier) {
        return null;
    }

    const assignmentStartIndex = getNodeStartIndex(node);

    if (
        typeof assignmentStartIndex === "number" &&
        (referencesIdentifierBeforePosition(
            programAst,
            identifierName,
            assignmentStartIndex
        ) ||
            (originalIdentifierName &&
                originalIdentifierName !== identifierName &&
                referencesIdentifierBeforePosition(
                    programAst,
                    originalIdentifierName,
                    assignmentStartIndex
                )))
    ) {
        return null;
    }

    const declarator = {
        type: "VariableDeclarator",
        id: clonedIdentifier,
        init: node.right,
        start: cloneLocation(left?.start ?? node.start),
        end: cloneLocation(node.end)
    };

    const declaration = {
        type: "VariableDeclaration",
        declarations: [declarator],
        kind: "var",
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    copyCommentMetadata(node, declaration);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: left?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    parent[property] = declaration;
    attachFeatherFixMetadata(declaration, [fixDetail]);

    return fixDetail;
}

function buildEventMarkerIndex(ast) {
    if (!ast || typeof ast !== "object") {
        return [];
    }

    const markerComments = new Set();
    const directComments = Array.isArray(ast.comments) ? ast.comments : [];

    for (const comment of directComments) {
        if (comment) {
            markerComments.add(comment);
        }
    }

    for (const comment of collectCommentNodes(ast)) {
        if (comment) {
            markerComments.add(comment);
        }
    }

    const markers = [];

    for (const comment of markerComments) {
        const eventName = extractEventNameFromComment(comment?.value);

        if (!eventName) {
            continue;
        }

        const markerIndex = getCommentIndex(comment);

        if (typeof markerIndex !== "number") {
            continue;
        }

        markers.push({
            index: markerIndex,
            name: eventName
        });
    }

    markers.sort((left, right) => left.index - right.index);

    return markers;
}

function extractEventNameFromComment(value) {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();

    if (!trimmed.startsWith("/")) {
        return null;
    }

    const normalized = trimmed.replace(/^\/\s*/, "");

    if (!/\bEvent\b/i.test(normalized)) {
        return null;
    }

    return normalized;
}

function getCommentIndex(comment) {
    if (!comment || typeof comment !== "object") {
        return null;
    }

    if (typeof comment.start?.index === "number") {
        return comment.start.index;
    }

    if (typeof comment.end?.index === "number") {
        return comment.end.index;
    }

    return null;
}

function findEventMarkerForIndex(markers, index) {
    if (!Array.isArray(markers) || markers.length === 0) {
        return null;
    }

    if (typeof index !== "number") {
        return null;
    }

    let result = null;

    for (const marker of markers) {
        if (marker.index <= index) {
            result = marker;
            continue;
        }

        break;
    }

    return result;
}

function isCreateEventMarker(marker) {
    if (!marker || typeof marker.name !== "string") {
        return false;
    }

    return /\bCreate\s+Event\b/i.test(marker.name);
}

function collectMemberPropertyNames(ast) {
    if (!ast || typeof ast !== "object") {
        return new Set();
    }

    const names = new Set();

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

        if (node.type === "MemberDotExpression") {
            const property = node.property;

            if (property?.type === "Identifier" && property.name) {
                names.add(property.name);
            }
        }

        if (node.type === "MemberIndexExpression") {
            const property = node.property;

            if (property?.type === "Identifier" && property.name) {
                names.add(property.name);
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return names;
}

function getOriginalIdentifierName(identifier, sourceText) {
    if (!identifier || typeof sourceText !== "string") {
        return null;
    }

    const startIndex = getNodeStartIndex(identifier);
    const endIndex = getNodeEndIndex(identifier);

    if (typeof startIndex !== "number" || typeof endIndex !== "number") {
        return null;
    }

    const slice = sourceText.slice(startIndex, endIndex + 1);

    if (typeof slice !== "string") {
        return null;
    }

    const trimmed = slice.trim();

    if (!trimmed) {
        return null;
    }

    const match = /^[A-Za-z_][A-Za-z0-9_]*$/.exec(trimmed);

    if (!match) {
        return null;
    }

    return match[0];
}

function convertUnusedIndexForLoops({ ast, diagnostic }) {
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

        if (node.type === "ForStatement") {
            const fix = convertForLoopToRepeat(
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

function convertForLoopToRepeat(node, parent, property, diagnostic) {
    if (!node || node.type !== "ForStatement") {
        return null;
    }

    const transformation = analyzeForLoopForRepeat(node);

    if (!transformation) {
        return null;
    }

    if (Array.isArray(parent)) {
        if (
            typeof property !== "number" ||
            property < 0 ||
            property >= parent.length
        ) {
            return null;
        }
    } else if (
        !parent ||
        (typeof property !== "string" && typeof property !== "number")
    ) {
        return null;
    }

    const repeatStatement = {
        type: "RepeatStatement",
        test: transformation.testExpression,
        body: transformation.body,
        start: cloneLocation(node.start),
        end: cloneLocation(node.end)
    };

    copyCommentMetadata(node, repeatStatement);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: transformation.indexName ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    if (Array.isArray(parent)) {
        parent[property] = repeatStatement;
    } else {
        parent[property] = repeatStatement;
    }

    attachFeatherFixMetadata(repeatStatement, [fixDetail]);

    return fixDetail;
}

function analyzeForLoopForRepeat(node) {
    if (!node || node.type !== "ForStatement") {
        return null;
    }

    const indexInfo = getLoopIndexInfo(node.init);

    if (!indexInfo) {
        return null;
    }

    const testExpression = getRepeatTestExpression(node.test, indexInfo.name);

    if (!testExpression) {
        return null;
    }

    if (!isRepeatCompatibleUpdate(node.update, indexInfo.name)) {
        return null;
    }

    if (doesNodeUseIdentifier(node.body, indexInfo.name)) {
        return null;
    }

    return {
        indexName: indexInfo.name,
        testExpression,
        body: node.body
    };
}

function getLoopIndexInfo(init) {
    if (!init || typeof init !== "object") {
        return null;
    }

    if (init.type === "VariableDeclaration") {
        const declarations = Array.isArray(init.declarations)
            ? init.declarations
            : [];

        if (declarations.length !== 1) {
            return null;
        }

        const [declaration] = declarations;
        const identifier = declaration?.id;
        const initializer = declaration?.init;

        if (!isIdentifier(identifier) || !isLiteralZero(initializer)) {
            return null;
        }

        return { name: identifier.name };
    }

    if (init.type === "AssignmentExpression") {
        if (init.operator !== "=") {
            return null;
        }

        if (!isIdentifier(init.left) || !isLiteralZero(init.right)) {
            return null;
        }

        return { name: init.left.name };
    }

    return null;
}

function getRepeatTestExpression(test, indexName) {
    if (!test || typeof test !== "object") {
        return null;
    }

    if (test.type !== "BinaryExpression") {
        return null;
    }

    if (test.operator !== "<") {
        return null;
    }

    if (!isIdentifierWithName(test.left, indexName)) {
        return null;
    }

    const right = test.right;

    if (!right || typeof right !== "object") {
        return null;
    }

    return right;
}

function isRepeatCompatibleUpdate(update, indexName) {
    if (!update || typeof update !== "object") {
        return false;
    }

    if (update.type === "AssignmentExpression") {
        if (!isIdentifierWithName(update.left, indexName)) {
            return false;
        }

        if (update.operator === "+=") {
            return isLiteralOne(update.right);
        }

        if (update.operator === "=") {
            if (!update.right || update.right.type !== "BinaryExpression") {
                return false;
            }

            const { left, right, operator } = update.right;

            if (operator !== "+") {
                return false;
            }

            if (!isIdentifierWithName(left, indexName)) {
                return false;
            }

            return isLiteralOne(right);
        }

        return false;
    }

    if (update.type === "IncDecStatement") {
        if (update.operator !== "++") {
            return false;
        }

        return isIdentifierWithName(update.argument, indexName);
    }

    return false;
}

function doesNodeUseIdentifier(node, name) {
    if (!node || !name) {
        return false;
    }

    let found = false;

    const visit = (current) => {
        if (found || !current) {
            return;
        }

        if (Array.isArray(current)) {
            for (const entry of current) {
                visit(entry);
                if (found) {
                    break;
                }
            }
            return;
        }

        if (typeof current !== "object") {
            return;
        }

        if (current.type === "Identifier" && current.name === name) {
            found = true;
            return;
        }

        for (const value of Object.values(current)) {
            if (value && typeof value === "object") {
                visit(value);
                if (found) {
                    break;
                }
            }
        }
    };

    visit(node);

    return found;
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

    const args = getCallArgumentsOrEmpty(node);
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

function convertNullishCoalesceOpportunities({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return false;
        }

        if (Array.isArray(node)) {
            for (let index = 0; index < node.length; ) {
                const mutated = visit(node[index], node, index);
                if (mutated) {
                    continue;
                }
                index += 1;
            }
            return false;
        }

        if (typeof node !== "object") {
            return false;
        }

        if (node.type === "IfStatement") {
            const result = convertNullishIfStatement(
                node,
                parent,
                property,
                diagnostic
            );

            if (result && result.fix) {
                fixes.push(result.fix);
                return result.mutatedParent === true;
            }
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

function convertNullishIfStatement(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "IfStatement" || node.alternate) {
        return null;
    }

    const comparison = unwrapParenthesizedExpression(node.test);

    if (!comparison || comparison.type !== "BinaryExpression") {
        return null;
    }

    if (comparison.operator !== "==") {
        return null;
    }

    const identifierInfo = extractUndefinedComparisonIdentifier(comparison);

    if (!identifierInfo) {
        return null;
    }

    const consequentAssignment = extractConsequentAssignment(node.consequent);

    if (!consequentAssignment || consequentAssignment.operator !== "=") {
        return null;
    }

    const assignmentIdentifier = consequentAssignment.left;

    if (
        !isIdentifier(assignmentIdentifier) ||
        assignmentIdentifier.name !== identifierInfo.name
    ) {
        return null;
    }

    const fallbackExpression = consequentAssignment.right;

    if (!fallbackExpression) {
        return null;
    }

    const previousNode = parent[property - 1];

    if (
        previousNode &&
        previousNode.type === "AssignmentExpression" &&
        previousNode.operator === "=" &&
        isIdentifier(previousNode.left) &&
        previousNode.left.name === identifierInfo.name &&
        previousNode.right
    ) {
        const previousRight = previousNode.right;

        const binaryExpression = {
            type: "BinaryExpression",
            operator: "??",
            left: previousRight,
            right: fallbackExpression
        };

        if (hasOwn(previousRight, "start")) {
            binaryExpression.start = cloneLocation(previousRight.start);
        } else if (hasOwn(previousNode, "start")) {
            binaryExpression.start = cloneLocation(previousNode.start);
        }

        if (hasOwn(fallbackExpression, "end")) {
            binaryExpression.end = cloneLocation(fallbackExpression.end);
        } else if (hasOwn(consequentAssignment, "end")) {
            binaryExpression.end = cloneLocation(consequentAssignment.end);
        }

        previousNode.right = binaryExpression;

        if (hasOwn(node, "end")) {
            previousNode.end = cloneLocation(node.end);
        } else if (hasOwn(consequentAssignment, "end")) {
            previousNode.end = cloneLocation(consequentAssignment.end);
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: identifierInfo.name,
            range: {
                start: getNodeStartIndex(previousNode),
                end: getNodeEndIndex(previousNode)
            }
        });

        if (!fixDetail) {
            return null;
        }

        parent.splice(property, 1);
        attachFeatherFixMetadata(previousNode, [fixDetail]);

        return { fix: fixDetail, mutatedParent: true };
    }

    const nullishAssignment = {
        type: "AssignmentExpression",
        operator: "??=",
        left: assignmentIdentifier,
        right: fallbackExpression
    };

    if (hasOwn(consequentAssignment, "start")) {
        nullishAssignment.start = cloneLocation(consequentAssignment.start);
    } else if (hasOwn(node, "start")) {
        nullishAssignment.start = cloneLocation(node.start);
    }

    if (hasOwn(node, "end")) {
        nullishAssignment.end = cloneLocation(node.end);
    } else if (hasOwn(consequentAssignment, "end")) {
        nullishAssignment.end = cloneLocation(consequentAssignment.end);
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: identifierInfo.name,
        range: {
            start: getNodeStartIndex(nullishAssignment),
            end: getNodeEndIndex(nullishAssignment)
        }
    });

    if (!fixDetail) {
        return null;
    }

    parent[property] = nullishAssignment;
    attachFeatherFixMetadata(nullishAssignment, [fixDetail]);

    return { fix: fixDetail, mutatedParent: false };
}

function unwrapParenthesizedExpression(node) {
    let current = node;

    while (current && current.type === "ParenthesizedExpression") {
        current = current.expression;
    }

    return current;
}

function extractUndefinedComparisonIdentifier(expression) {
    if (!expression || expression.type !== "BinaryExpression") {
        return null;
    }

    const { left, right } = expression;

    if (isIdentifier(left) && isUndefinedLiteral(right)) {
        return { node: left, name: left.name };
    }

    if (isIdentifier(right) && isUndefinedLiteral(left)) {
        return { node: right, name: right.name };
    }

    return null;
}

function isUndefinedLiteral(node) {
    if (!node) {
        return false;
    }

    if (node.type === "Literal") {
        return node.value === "undefined" || node.value === undefined;
    }

    if (isIdentifier(node)) {
        return node.name === "undefined";
    }

    return false;
}

function extractConsequentAssignment(consequent) {
    if (!consequent || typeof consequent !== "object") {
        return null;
    }

    if (consequent.type === "AssignmentExpression") {
        return consequent;
    }

    if (consequent.type === "BlockStatement") {
        const statements = getBodyStatements(consequent).filter(Boolean);

        if (statements.length !== 1) {
            return null;
        }

        const [single] = statements;

        if (single && single.type === "AssignmentExpression") {
            return single;
        }
    }

    return null;
}

function ensureShaderResetIsCalled({ ast, diagnostic, sourceText }) {
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
            const fix = ensureShaderResetAfterSet(
                node,
                parent,
                property,
                diagnostic,
                sourceText
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

function ensureShaderResetAfterSet(
    node,
    parent,
    property,
    diagnostic,
    sourceText
) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "shader_set")) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;
    let lastSequentialCallIndex = property;
    let previousNode = node;

    while (insertionIndex < siblings.length) {
        const candidate = siblings[insertionIndex];

        if (isShaderResetCall(candidate)) {
            return null;
        }

        if (!isCallExpression(candidate)) {
            break;
        }

        if (isIdentifierWithName(candidate.object, "shader_set")) {
            break;
        }

        if (
            !hasOnlyWhitespaceBetweenNodes(previousNode, candidate, sourceText)
        ) {
            break;
        }

        lastSequentialCallIndex = insertionIndex;
        previousNode = candidate;
        insertionIndex += 1;
    }

    if (lastSequentialCallIndex > property) {
        insertionIndex = lastSequentialCallIndex + 1;
    }

    const resetCall = createShaderResetCall(node);

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

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureFogIsReset({ ast, diagnostic }) {
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
            const fix = ensureFogResetAfterCall(
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

function ensureFogResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_fog")) {
        return null;
    }

    if (isFogResetCall(node)) {
        return null;
    }

    const args = getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (isLiteralFalse(args[0])) {
        return null;
    }

    const siblings = parent;
    const nextNode = siblings[property + 1];

    if (isFogResetCall(nextNode)) {
        return null;
    }

    const resetCall = createFogResetCall(node);

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

    siblings.splice(property + 1, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureSurfaceTargetsAreReset({ ast, diagnostic }) {
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
            const fix = ensureSurfaceTargetResetAfterCall(
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

function ensureSurfaceTargetResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "surface_set_target")) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;
    let lastDrawCallIndex = property;

    while (insertionIndex < siblings.length) {
        const candidate = siblings[insertionIndex];

        if (isSurfaceResetTargetCall(candidate)) {
            return null;
        }

        if (!candidate || candidate.type !== "CallExpression") {
            break;
        }

        if (!isDrawFunctionCall(candidate)) {
            break;
        }

        lastDrawCallIndex = insertionIndex;
        insertionIndex += 1;
    }

    if (lastDrawCallIndex > property) {
        insertionIndex = lastDrawCallIndex + 1;
    } else if (insertionIndex >= siblings.length) {
        insertionIndex = siblings.length;
    } else {
        return null;
    }

    const resetCall = createSurfaceResetTargetCall(node);

    if (!resetCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: extractSurfaceTargetName(node),
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    siblings.splice(insertionIndex, 0, resetCall);
    removeRedundantSurfaceResetCalls(siblings, insertionIndex + 1);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

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

    const args = getCallExpressionArguments(node);

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

function ensureBlendModeIsReset({ ast, diagnostic }) {
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
            const fix = ensureBlendModeResetAfterCall(
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

function ensureBlendModeResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_blendmode")) {
        return null;
    }

    const args = getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (isBlendModeNormalArgument(args[0])) {
        return null;
    }

    const siblings = parent;
    const nextNode = siblings[property + 1];

    if (isBlendModeResetCall(nextNode)) {
        return null;
    }

    const resetCall = createBlendModeResetCall(node);

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

    siblings.splice(property + 1, 0, resetCall);
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

function ensureAlphaTestEnableIsReset({ ast, diagnostic }) {
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
            const fix = ensureAlphaTestEnableResetAfterCall(
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

function removeRedeclaredGlobalFunctions({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const body = getBodyStatements(ast);

    if (body.length === 0) {
        return [];
    }

    const seenDeclarations = new Map();
    const fixes = [];

    for (let index = 0; index < body.length; ) {
        const node = body[index];

        if (!node || node.type !== "FunctionDeclaration") {
            index += 1;
            continue;
        }

        const functionId = typeof node.id === "string" ? node.id : null;

        if (!functionId) {
            index += 1;
            continue;
        }

        const originalDeclaration = seenDeclarations.get(functionId);

        if (!originalDeclaration) {
            seenDeclarations.set(functionId, node);
            index += 1;
            continue;
        }

        const range = {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        };

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: functionId,
            range
        });

        if (fixDetail) {
            fixes.push(fixDetail);

            if (
                originalDeclaration &&
                typeof originalDeclaration === "object"
            ) {
                attachFeatherFixMetadata(originalDeclaration, [fixDetail]);
            }
        }

        body.splice(index, 1);
    }

    return fixes;
}

function ensureHalignIsReset({ ast, diagnostic }) {
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
            const fix = ensureHalignResetAfterCall(
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

                if (isNonEmptyString(parentName)) {
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

function ensurePrimitiveBeginPrecedesEnd({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const ancestors = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        const entry = { node, parent, property };
        ancestors.push(entry);

        if (Array.isArray(node)) {
            if (isStatementArray(entry)) {
                let index = 0;

                while (index < node.length) {
                    const statement = node[index];

                    if (isDrawPrimitiveEndCall(statement)) {
                        const fix = ensurePrimitiveBeginBeforeEnd({
                            statements: node,
                            index,
                            endCall: statement,
                            diagnostic,
                            ancestors
                        });

                        if (fix) {
                            fixes.push(fix);
                        }
                    }

                    visit(node[index], node, index);
                    index += 1;
                }

                ancestors.pop();
                return;
            }

            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }

            ancestors.pop();
            return;
        }

        if (typeof node !== "object") {
            ancestors.pop();
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (value && typeof value === "object") {
                visit(value, node, key);
            }
        }

        ancestors.pop();
    };

    visit(ast, null, null);

    return fixes;
}

function ensurePrimitiveBeginBeforeEnd({
    statements,
    index,
    endCall,
    diagnostic,
    ancestors
}) {
    if (!Array.isArray(statements) || typeof index !== "number") {
        return null;
    }

    if (!endCall || !isDrawPrimitiveEndCall(endCall)) {
        return null;
    }

    let unmatchedBegins = 0;

    for (let position = 0; position < index; position += 1) {
        const statement = statements[position];

        if (isDrawPrimitiveBeginCall(statement)) {
            unmatchedBegins += 1;
            continue;
        }

        if (isDrawPrimitiveEndCall(statement) && unmatchedBegins > 0) {
            unmatchedBegins -= 1;
        }
    }

    if (unmatchedBegins > 0) {
        return null;
    }

    if (
        hasAncestorDrawPrimitiveBegin({
            ancestors,
            currentStatements: statements
        })
    ) {
        return null;
    }

    const beginCall = createPrimitiveBeginCall(endCall);

    if (!beginCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: endCall?.object?.name ?? null,
        range: {
            start: getNodeStartIndex(endCall),
            end: getNodeEndIndex(endCall)
        }
    });

    if (!fixDetail) {
        return null;
    }

    statements.splice(index, 0, beginCall);
    attachFeatherFixMetadata(beginCall, [fixDetail]);

    return fixDetail;
}

function hasAncestorDrawPrimitiveBegin({ ancestors, currentStatements }) {
    if (!Array.isArray(ancestors) || ancestors.length === 0) {
        return false;
    }

    for (let i = ancestors.length - 2; i >= 0; i -= 1) {
        const entry = ancestors[i];

        if (
            !entry ||
            !Array.isArray(entry.parent) ||
            typeof entry.property !== "number"
        ) {
            continue;
        }

        if (entry.parent === currentStatements) {
            continue;
        }

        const parentArrayEntry = findAncestorArrayEntry(
            ancestors,
            entry.parent
        );

        if (!parentArrayEntry || !isStatementArray(parentArrayEntry)) {
            continue;
        }

        if (hasUnmatchedBeginBeforeIndex(entry.parent, entry.property)) {
            return true;
        }
    }

    return false;
}

function findAncestorArrayEntry(ancestors, target) {
    if (!target) {
        return null;
    }

    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        const entry = ancestors[index];

        if (entry?.node === target) {
            return entry;
        }
    }

    return null;
}

function hasUnmatchedBeginBeforeIndex(statements, stopIndex) {
    if (!Array.isArray(statements) || typeof stopIndex !== "number") {
        return false;
    }

    let unmatchedBegins = 0;

    for (let index = 0; index < stopIndex; index += 1) {
        const statement = statements[index];

        if (isDrawPrimitiveBeginCall(statement)) {
            unmatchedBegins += 1;
            continue;
        }

        if (isDrawPrimitiveEndCall(statement) && unmatchedBegins > 0) {
            unmatchedBegins -= 1;
        }
    }

    return unmatchedBegins > 0;
}

function ensureDrawPrimitiveEndCallsAreBalanced({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            ensurePrimitiveSequenceBalance(
                node,
                parent,
                property,
                fixes,
                diagnostic
            );

            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
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

function ensurePrimitiveSequenceBalance(
    statements,
    parent,
    property,
    fixes,
    diagnostic
) {
    if (!Array.isArray(statements) || statements.length === 0) {
        return;
    }

    for (let index = 0; index < statements.length; index += 1) {
        const current = statements[index];

        if (!isDrawPrimitiveBeginCall(current)) {
            continue;
        }

        const nextNode = statements[index + 1];

        if (!nextNode || nextNode.type !== "IfStatement") {
            continue;
        }

        const followingNode = statements[index + 2];

        if (isDrawPrimitiveEndCall(followingNode)) {
            continue;
        }

        const fix = liftDrawPrimitiveEndCallFromConditional(
            nextNode,
            statements,
            index + 1,
            diagnostic
        );

        if (fix) {
            fixes.push(fix);
        }
    }
}

function liftDrawPrimitiveEndCallFromConditional(
    conditional,
    siblings,
    conditionalIndex,
    diagnostic
) {
    if (!conditional || conditional.type !== "IfStatement") {
        return null;
    }

    const consequentInfo = getDrawPrimitiveEndCallInfo(conditional.consequent);
    const alternateInfo = getDrawPrimitiveEndCallInfo(conditional.alternate);

    if (!consequentInfo || !alternateInfo) {
        return null;
    }

    const totalMatches =
        consequentInfo.matches.length + alternateInfo.matches.length;

    if (totalMatches !== 1) {
        return null;
    }

    const branchWithCall =
        consequentInfo.matches.length === 1 ? consequentInfo : alternateInfo;
    const branchWithoutCall =
        branchWithCall === consequentInfo ? alternateInfo : consequentInfo;

    if (
        branchWithCall.matches.length !== 1 ||
        branchWithoutCall.matches.length !== 0
    ) {
        return null;
    }

    const [match] = branchWithCall.matches;

    if (!match || match.index !== branchWithCall.body.length - 1) {
        return null;
    }

    const callNode = match.node;

    if (!callNode || !isDrawPrimitiveEndCall(callNode)) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: callNode.object?.name ?? null,
        range: {
            start: getNodeStartIndex(callNode),
            end: getNodeEndIndex(callNode)
        }
    });

    if (!fixDetail) {
        return null;
    }

    branchWithCall.body.splice(match.index, 1);

    removeSyntheticDrawPrimitiveBeginInsertedByGM2028(branchWithCall.body);

    const insertionIndex = conditionalIndex + 1;

    siblings.splice(insertionIndex, 0, callNode);

    attachFeatherFixMetadata(callNode, [fixDetail]);

    return fixDetail;
}

function removeSyntheticDrawPrimitiveBeginInsertedByGM2028(statements) {
    if (!Array.isArray(statements) || statements.length === 0) {
        return false;
    }

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (!isDrawPrimitiveBeginCall(statement)) {
            continue;
        }

        const diagnosticMetadata = Array.isArray(
            statement?._appliedFeatherDiagnostics
        )
            ? statement._appliedFeatherDiagnostics
            : [];

        const insertedByGM2028 = diagnosticMetadata.some(
            (entry) => entry?.id === "GM2028"
        );

        if (!insertedByGM2028) {
            continue;
        }

        statements.splice(index, 1);
        return true;
    }

    return false;
}

function getDrawPrimitiveEndCallInfo(block) {
    if (!block || block.type !== "BlockStatement") {
        return null;
    }

    const body = getBodyStatements(block);
    const matches = [];

    for (let index = 0; index < body.length; index += 1) {
        const statement = body[index];

        if (isDrawPrimitiveEndCall(statement)) {
            matches.push({ index, node: statement });
        }
    }

    return { body, matches };
}

function ensureAlphaTestEnableResetAfterCall(
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

    if (!isIdentifierWithName(node.object, "gpu_set_alphatestenable")) {
        return null;
    }

    const args = getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (!isLiteralTrue(args[0])) {
        return null;
    }

    const siblings = parent;

    const insertionInfo = computeStateResetInsertionIndex({
        siblings,
        startIndex: property + 1,
        isResetCall: isAlphaTestEnableResetCall
    });

    if (!insertionInfo) {
        return null;
    }

    if (insertionInfo.alreadyReset) {
        return null;
    }

    const resetCall = createAlphaTestEnableResetCall(node);

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

    let insertionIndex = insertionInfo.index;

    const previousSibling =
        siblings[insertionIndex - 1] ?? siblings[property] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const shouldInsertSeparator =
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        (!nextSibling || !isTriviallyIgnorableStatement(nextSibling)) &&
        !isAlphaTestDisableCall(nextSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling);

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

function ensureHalignResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "draw_set_halign")) {
        return null;
    }

    const args = getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    if (isIdentifierWithName(args[0], "fa_left")) {
        return null;
    }

    const siblings = parent;

    const insertionInfo = computeStateResetInsertionIndex({
        siblings,
        startIndex: property + 1,
        isResetCall: isHalignResetCall
    });

    if (!insertionInfo) {
        return null;
    }

    if (insertionInfo.alreadyReset) {
        return null;
    }

    const resetCall = createHalignResetCall(node);

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

    let insertionIndex =
        typeof insertionInfo.index === "number"
            ? insertionInfo.index
            : siblings.length;

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
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

    const args = getCallExpressionArguments(node);

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

function ensureSurfaceTargetResetForGM2005({ ast, diagnostic }) {
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
            const fix = ensureSurfaceTargetResetAfterCallForGM2005(
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

function ensureSurfaceTargetResetAfterCallForGM2005(
    node,
    parent,
    property,
    diagnostic
) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!isSurfaceSetTargetCall(node)) {
        return null;
    }

    const siblings = parent;
    if (hasSurfaceResetBeforeNextTarget(siblings, property)) {
        return null;
    }
    let insertionIndex = siblings.length;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const candidate = siblings[index];

        if (isSurfaceResetTargetCall(candidate)) {
            return null;
        }

        if (isSurfaceSetTargetCall(candidate)) {
            insertionIndex = index;
            break;
        }

        if (isTerminatingStatement(candidate)) {
            insertionIndex = index;
            break;
        }

        if (isDrawSurfaceCall(candidate)) {
            insertionIndex = index;
            break;
        }

        if (!isCallExpression(candidate)) {
            insertionIndex = index;
            break;
        }
    }

    insertionIndex = Math.max(property + 1, insertionIndex);

    const resetCall = createSurfaceResetTargetCall(node);

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

    siblings.splice(insertionIndex, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function hasSurfaceResetBeforeNextTarget(statements, startIndex) {
    if (!Array.isArray(statements)) {
        return false;
    }

    for (let index = startIndex + 1; index < statements.length; index += 1) {
        const candidate = statements[index];

        if (isSurfaceResetTargetCall(candidate)) {
            return true;
        }

        if (isSurfaceSetTargetCall(candidate)) {
            return false;
        }
    }

    return false;
}

function removeRedundantSurfaceResetCalls(statements, startIndex) {
    if (!Array.isArray(statements)) {
        return;
    }

    for (let index = startIndex; index < statements.length; index += 1) {
        const candidate = statements[index];

        if (isSurfaceSetTargetCall(candidate)) {
            return;
        }

        if (!isSurfaceResetTargetCall(candidate)) {
            continue;
        }

        const metadata = Array.isArray(candidate?._appliedFeatherDiagnostics)
            ? candidate._appliedFeatherDiagnostics
            : [];

        const hasGM2005Metadata = metadata.some(
            (entry) => entry?.id === "GM2005"
        );

        if (!hasGM2005Metadata) {
            continue;
        }

        statements.splice(index, 1);
        index -= 1;
    }
}

function ensureDrawVertexCallsAreWrapped({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            const normalizedFixes = normalizeDrawVertexStatements(
                node,
                diagnostic
            );

            if (isNonEmptyArray(normalizedFixes)) {
                fixes.push(...normalizedFixes);
            }

            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }

            return;
        }

        if (typeof node !== "object") {
            return;
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

function normalizeDrawVertexStatements(statements, diagnostic) {
    if (!Array.isArray(statements) || statements.length === 0) {
        return [];
    }

    const fixes = [];

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (!isDrawVertexCall(statement)) {
            continue;
        }

        if (hasOpenPrimitiveBefore(statements, index)) {
            continue;
        }

        let blockEnd = index;

        while (
            blockEnd + 1 < statements.length &&
            isDrawVertexCall(statements[blockEnd + 1])
        ) {
            blockEnd += 1;
        }

        const candidateBegin = statements[blockEnd + 1];

        if (!isDrawPrimitiveBeginCall(candidateBegin)) {
            continue;
        }

        const beginIndex = blockEnd + 1;
        const endIndex = findMatchingDrawPrimitiveEnd(
            statements,
            beginIndex + 1
        );

        if (endIndex === -1) {
            continue;
        }

        const vertexStatements = statements.slice(index, blockEnd + 1);
        const fixDetails = [];

        for (const vertex of vertexStatements) {
            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: getDrawCallName(vertex),
                range: {
                    start: getNodeStartIndex(vertex),
                    end: getNodeEndIndex(vertex)
                }
            });

            if (!fixDetail) {
                continue;
            }

            attachFeatherFixMetadata(vertex, [fixDetail]);
            fixDetails.push(fixDetail);
        }

        if (fixDetails.length === 0) {
            continue;
        }

        const [primitiveBegin] = statements.splice(beginIndex, 1);

        if (!primitiveBegin) {
            continue;
        }

        statements.splice(index, 0, primitiveBegin);
        fixes.push(...fixDetails);

        index += vertexStatements.length;
    }

    return fixes;
}

function hasOpenPrimitiveBefore(statements, index) {
    let depth = 0;

    for (let cursor = 0; cursor < index; cursor += 1) {
        const statement = statements[cursor];

        if (isDrawPrimitiveBeginCall(statement)) {
            depth += 1;
            continue;
        }

        if (isDrawPrimitiveEndCall(statement) && depth > 0) {
            depth -= 1;
        }
    }

    return depth > 0;
}

function findMatchingDrawPrimitiveEnd(statements, startIndex) {
    if (!Array.isArray(statements)) {
        return -1;
    }

    let depth = 0;

    for (let index = startIndex; index < statements.length; index += 1) {
        const statement = statements[index];

        if (isDrawPrimitiveBeginCall(statement)) {
            depth += 1;
            continue;
        }

        if (isDrawPrimitiveEndCall(statement)) {
            if (depth === 0) {
                return index;
            }

            depth -= 1;
        }
    }

    return -1;
}

function isDrawVertexCall(node) {
    const name = getDrawCallName(node);

    if (!name) {
        return false;
    }

    return name.startsWith("draw_vertex");
}

function getDrawCallName(node) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const object = node.object;

    if (!object || object.type !== "Identifier") {
        return null;
    }

    return object.name ?? null;
}

function ensureCullModeIsReset({ ast, diagnostic }) {
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
            const fix = ensureCullModeResetAfterCall(
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

function ensureCullModeResetAfterCall(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_cullmode")) {
        return null;
    }

    const args = getCallExpressionArguments(node);

    if (args.length === 0) {
        return null;
    }

    const [modeArgument] = args;

    if (!isIdentifier(modeArgument)) {
        return null;
    }

    if (isIdentifierWithName(modeArgument, "cull_noculling")) {
        return null;
    }

    const siblings = parent;
    const nextNode = siblings[property + 1];

    if (isCullModeResetCall(nextNode)) {
        return null;
    }

    const resetCall = createCullModeResetCall(node);

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

    siblings.splice(property + 1, 0, resetCall);
    attachFeatherFixMetadata(resetCall, [fixDetail]);

    return fixDetail;
}

function ensureVertexBeginPrecedesEnd({ ast, diagnostic }) {
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

        const fix = ensureVertexBeginBeforeVertexEndCall(
            node,
            parent,
            property,
            diagnostic
        );

        if (fix) {
            fixes.push(fix);
            return;
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

function ensureVertexBeginBeforeVertexEndCall(
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

    if (!isIdentifierWithName(node.object, "vertex_end")) {
        return null;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length === 0) {
        return null;
    }

    const bufferArgument = args[0];

    if (!isIdentifier(bufferArgument)) {
        return null;
    }

    const bufferName = bufferArgument.name;

    for (let index = property - 1; index >= 0; index -= 1) {
        const sibling = parent[index];

        if (!sibling || typeof sibling !== "object") {
            continue;
        }

        if (isVertexBeginCallForBuffer(sibling, bufferName)) {
            return null;
        }
    }

    const vertexBeginCall = createVertexBeginCall(node, bufferArgument);

    if (!vertexBeginCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: typeof bufferName === "string" ? bufferName : null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    parent.splice(property, 0, vertexBeginCall);
    attachFeatherFixMetadata(vertexBeginCall, [fixDetail]);
    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function isVertexBeginCallForBuffer(node, bufferName) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "vertex_begin")) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length === 0) {
        return false;
    }

    const firstArgument = args[0];

    if (!isIdentifier(firstArgument)) {
        return false;
    }

    return firstArgument.name === bufferName;
}

function createVertexBeginCall(templateCall, bufferArgument) {
    if (!templateCall || templateCall.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifier(bufferArgument)) {
        return null;
    }

    const callIdentifier = createIdentifier(
        "vertex_begin",
        templateCall.object
    );

    if (!callIdentifier) {
        return null;
    }

    const clonedBuffer = createIdentifier(bufferArgument.name, bufferArgument);

    if (!clonedBuffer) {
        return null;
    }

    const formatIdentifier = createIdentifier("format", bufferArgument);

    const callExpression = {
        type: "CallExpression",
        object: callIdentifier,
        arguments: [clonedBuffer]
    };

    if (formatIdentifier) {
        callExpression.arguments.push(formatIdentifier);
    }

    if (hasOwn(templateCall, "start")) {
        callExpression.start = cloneLocation(templateCall.start);
    }

    if (hasOwn(templateCall, "end")) {
        callExpression.end = cloneLocation(templateCall.end);
    }

    return callExpression;
}

function ensureVertexBuffersAreClosed({ ast, diagnostic }) {
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
            const fix = ensureVertexEndInserted(
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

function ensureVertexEndInserted(node, parent, property, diagnostic) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, "vertex_begin")) {
        return null;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length === 0) {
        return null;
    }

    const bufferArgument = args[0];

    if (!isIdentifier(bufferArgument)) {
        return null;
    }

    const bufferName = bufferArgument.name;
    const siblings = parent;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (isVertexEndCallForBuffer(sibling, bufferName)) {
            return null;
        }
    }

    const vertexEndCall = createVertexEndCall(node, bufferArgument);

    if (!vertexEndCall) {
        return null;
    }

    const insertionIndex = findVertexEndInsertionIndex({
        siblings,
        startIndex: property + 1,
        bufferName
    });

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: bufferName ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    siblings.splice(insertionIndex, 0, vertexEndCall);
    attachFeatherFixMetadata(vertexEndCall, [fixDetail]);

    return fixDetail;
}

function findVertexEndInsertionIndex({ siblings, startIndex, bufferName }) {
    if (!Array.isArray(siblings)) {
        return 0;
    }

    let index = typeof startIndex === "number" ? startIndex : 0;

    while (index < siblings.length) {
        const node = siblings[index];

        if (!node || typeof node !== "object") {
            break;
        }

        if (isVertexEndCallForBuffer(node, bufferName)) {
            break;
        }

        if (!isCallExpression(node)) {
            break;
        }

        if (isVertexSubmitCallForBuffer(node, bufferName)) {
            break;
        }

        if (!hasFirstArgumentIdentifier(node, bufferName)) {
            break;
        }

        index += 1;
    }

    return index;
}

function isCallExpression(node) {
    return !!node && node.type === "CallExpression";
}

function hasOnlyWhitespaceBetweenNodes(previous, next, sourceText) {
    if (typeof sourceText !== "string") {
        return true;
    }

    const previousEnd = getNodeEndIndex(previous);
    const nextStart = getNodeStartIndex(next);

    if (
        typeof previousEnd !== "number" ||
        typeof nextStart !== "number" ||
        previousEnd >= nextStart
    ) {
        return true;
    }

    const between = sourceText.slice(previousEnd, nextStart);

    if (between.length === 0) {
        return true;
    }

    const sanitized = between.replaceAll(";", "");

    return !isNonEmptyTrimmedString(sanitized);
}

function hasFirstArgumentIdentifier(node, name) {
    if (!isCallExpression(node)) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length === 0) {
        return false;
    }

    const firstArg = args[0];

    if (!isIdentifier(firstArg)) {
        return false;
    }

    if (typeof name !== "string") {
        return true;
    }

    return firstArg.name === name;
}

function isVertexSubmitCallForBuffer(node, bufferName) {
    if (!isCallExpression(node)) {
        return false;
    }

    if (!isIdentifierWithName(node.object, "vertex_submit")) {
        return false;
    }

    return hasFirstArgumentIdentifier(node, bufferName);
}

function isVertexEndCallForBuffer(node, bufferName) {
    if (!isCallExpression(node)) {
        return false;
    }

    if (!isIdentifierWithName(node.object, "vertex_end")) {
        return false;
    }

    if (typeof bufferName !== "string") {
        return true;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length === 0) {
        return false;
    }

    const firstArg = args[0];

    return isIdentifier(firstArg) && firstArg.name === bufferName;
}

function createVertexEndCall(template, bufferIdentifier) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifier(bufferIdentifier)) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: createIdentifier("vertex_end"),
        arguments: [cloneIdentifier(bufferIdentifier)]
    };

    if (hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function ensureLocalVariablesAreDeclaredBeforeUse({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];
    const ancestors = [];
    const visitedNodes = new WeakSet();

    const visitNode = (node, parent, property, container, index) => {
        if (!node || typeof node !== "object") {
            return;
        }

        if (visitedNodes.has(node)) {
            return;
        }

        visitedNodes.add(node);

        const context = { node, parent, property, container, index };
        ancestors.push(context);

        const action = handleLocalVariableDeclarationPatterns({
            context,
            ancestors,
            diagnostic,
            fixes
        });

        if (action?.skipChildren) {
            ancestors.pop();
            return;
        }

        for (const [key, value] of Object.entries(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                for (
                    let childIndex = 0;
                    childIndex < value.length;
                    childIndex += 1
                ) {
                    visitNode(value[childIndex], node, key, value, childIndex);
                }
                continue;
            }

            visitNode(value, node, key, null, null);
        }

        ancestors.pop();
    };

    visitNode(ast, null, null, null, null);

    return fixes;
}

function handleLocalVariableDeclarationPatterns({
    context,
    ancestors,
    diagnostic,
    fixes
}) {
    const { node, container, index } = context;

    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type !== "VariableDeclaration" || node.kind !== "var") {
        return null;
    }

    const declarator = getSingleVariableDeclarator(node);

    if (!declarator) {
        return null;
    }

    const variableName = getDeclaratorName(declarator);

    if (!variableName) {
        return null;
    }

    if (container && Array.isArray(container) && typeof index === "number") {
        const precedingNode = container[index - 1];
        const fixDetail = convertPrecedingAssignmentToVariableDeclaration({
            assignmentNode: precedingNode,
            declarationNode: node,
            container,
            assignmentIndex: index - 1,
            declarationIndex: index,
            diagnostic,
            variableName
        });

        if (fixDetail) {
            fixes.push(fixDetail);
            return { skipChildren: true };
        }
    }

    if (context.parent?.type !== "BlockStatement") {
        return null;
    }

    const blockBody = Array.isArray(container) ? container : null;

    if (!blockBody) {
        return null;
    }

    const owningStatementContext = findNearestStatementContext(
        ancestors.slice(0, -1)
    );

    if (!owningStatementContext) {
        return null;
    }

    const { container: statementContainer, index: statementIndex } =
        owningStatementContext;

    if (
        !statementContainer ||
        !Array.isArray(statementContainer) ||
        typeof statementIndex !== "number"
    ) {
        return null;
    }

    if (
        hasVariableDeclarationInContainer(
            statementContainer,
            variableName,
            statementIndex
        )
    ) {
        return null;
    }

    if (
        !referencesIdentifierAfterIndex(
            statementContainer,
            variableName,
            statementIndex + 1
        )
    ) {
        return null;
    }

    const fixDetail = hoistVariableDeclarationOutOfBlock({
        declarationNode: node,
        blockBody,
        declarationIndex: index,
        statementContainer,
        statementIndex,
        diagnostic,
        variableName
    });

    if (fixDetail) {
        fixes.push(fixDetail);
        return { skipChildren: true };
    }

    return null;
}

function getSingleVariableDeclarator(node) {
    if (!node || node.type !== "VariableDeclaration") {
        return null;
    }

    const declarations = Array.isArray(node.declarations)
        ? node.declarations
        : [];

    if (declarations.length !== 1) {
        return null;
    }

    const [declarator] = declarations;

    if (!declarator || declarator.type !== "VariableDeclarator") {
        return null;
    }

    return declarator;
}

function getDeclaratorName(declarator) {
    const identifier = declarator?.id;

    if (!identifier || identifier.type !== "Identifier") {
        return null;
    }

    return identifier.name ?? null;
}

function convertPrecedingAssignmentToVariableDeclaration({
    assignmentNode,
    declarationNode,
    container,
    assignmentIndex,
    declarationIndex,
    diagnostic,
    variableName
}) {
    if (
        !assignmentNode ||
        assignmentNode.type !== "AssignmentExpression" ||
        assignmentNode.operator !== "="
    ) {
        return null;
    }

    if (!container || !Array.isArray(container)) {
        return null;
    }

    if (
        typeof assignmentIndex !== "number" ||
        typeof declarationIndex !== "number"
    ) {
        return null;
    }

    if (
        !assignmentNode.left ||
        assignmentNode.left.type !== "Identifier" ||
        assignmentNode.left.name !== variableName
    ) {
        return null;
    }

    const declarator = getSingleVariableDeclarator(declarationNode);

    if (!declarator || !declarator.init) {
        return null;
    }

    const variableDeclaration = createVariableDeclarationFromAssignment(
        assignmentNode,
        declarator
    );

    if (!variableDeclaration) {
        return null;
    }

    const assignmentExpression = createAssignmentFromDeclarator(
        declarator,
        declarationNode
    );

    if (!assignmentExpression) {
        return null;
    }

    const rangeStart = getNodeStartIndex(assignmentNode);
    const rangeEnd = getNodeEndIndex(declarationNode);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: variableName,
        range: {
            start: rangeStart,
            end: rangeEnd
        }
    });

    if (!fixDetail) {
        return null;
    }

    container[assignmentIndex] = variableDeclaration;
    container[declarationIndex] = assignmentExpression;

    copyCommentMetadata(assignmentNode, variableDeclaration);
    copyCommentMetadata(declarationNode, assignmentExpression);

    attachFeatherFixMetadata(variableDeclaration, [fixDetail]);
    attachFeatherFixMetadata(assignmentExpression, [fixDetail]);

    return fixDetail;
}

function createVariableDeclarationFromAssignment(
    assignmentNode,
    declaratorTemplate
) {
    if (!assignmentNode || assignmentNode.type !== "AssignmentExpression") {
        return null;
    }

    const identifier = cloneIdentifier(assignmentNode.left);

    if (!identifier) {
        return null;
    }

    const declarator = {
        type: "VariableDeclarator",
        id: identifier,
        init: assignmentNode.right
    };

    if (declaratorTemplate && typeof declaratorTemplate === "object") {
        if (hasOwn(declaratorTemplate, "start")) {
            declarator.start = cloneLocation(declaratorTemplate.start);
        }

        if (hasOwn(declaratorTemplate, "end")) {
            declarator.end = cloneLocation(declaratorTemplate.end);
        }
    }

    const declaration = {
        type: "VariableDeclaration",
        kind: "var",
        declarations: [declarator]
    };

    if (hasOwn(assignmentNode, "start")) {
        declaration.start = cloneLocation(assignmentNode.start);
    }

    if (hasOwn(assignmentNode, "end")) {
        declaration.end = cloneLocation(assignmentNode.end);
    }

    return declaration;
}

function findNearestStatementContext(ancestors) {
    if (!Array.isArray(ancestors)) {
        return null;
    }

    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
        const entry = ancestors[index];

        if (!entry || !Array.isArray(entry.container)) {
            continue;
        }

        if (typeof entry.index !== "number") {
            continue;
        }

        if (
            entry.node &&
            entry.node.type === "VariableDeclaration" &&
            entry.node.kind === "var"
        ) {
            continue;
        }

        return entry;
    }

    return null;
}

function hasVariableDeclarationInContainer(container, variableName, uptoIndex) {
    if (!Array.isArray(container) || !variableName) {
        return false;
    }

    const limit = typeof uptoIndex === "number" ? uptoIndex : container.length;

    for (let index = 0; index < limit; index += 1) {
        const node = container[index];

        if (
            !node ||
            node.type !== "VariableDeclaration" ||
            node.kind !== "var"
        ) {
            continue;
        }

        const declarations = Array.isArray(node.declarations)
            ? node.declarations
            : [];

        for (const declarator of declarations) {
            if (!declarator || declarator.type !== "VariableDeclarator") {
                continue;
            }

            if (
                declarator.id?.type === "Identifier" &&
                declarator.id.name === variableName
            ) {
                return true;
            }
        }
    }

    return false;
}

function referencesIdentifierAfterIndex(container, variableName, startIndex) {
    if (!Array.isArray(container) || !variableName) {
        return false;
    }

    const initialIndex = typeof startIndex === "number" ? startIndex : 0;

    for (let index = initialIndex; index < container.length; index += 1) {
        if (referencesIdentifier(container[index], variableName)) {
            return true;
        }
    }

    return false;
}

function referencesIdentifier(node, variableName) {
    if (!node || typeof node !== "object") {
        return false;
    }

    const stack = [{ value: node, parent: null, key: null }];

    while (stack.length > 0) {
        const { value, parent, key } = stack.pop();

        if (!value || typeof value !== "object") {
            continue;
        }

        if (isFunctionLikeNode(value)) {
            // Nested functions introduce new scopes. References to the same
            // identifier name inside them do not require hoisting the current
            // declaration, so skip descending into those subtrees.
            continue;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                stack.push({ value: item, parent, key });
            }
            continue;
        }

        if (value.type === "Identifier" && value.name === variableName) {
            const isDeclaratorId =
                parent?.type === "VariableDeclarator" && key === "id";

            if (!isDeclaratorId) {
                return true;
            }
        }

        for (const [childKey, childValue] of Object.entries(value)) {
            if (childValue && typeof childValue === "object") {
                stack.push({ value: childValue, parent: value, key: childKey });
            }
        }
    }

    return false;
}

function referencesIdentifierBeforePosition(node, variableName, beforeIndex) {
    if (
        !node ||
        typeof node !== "object" ||
        !variableName ||
        typeof beforeIndex !== "number"
    ) {
        return false;
    }

    const stack = [{ value: node, parent: null, key: null }];

    while (stack.length > 0) {
        const { value, parent, key } = stack.pop();

        if (!value || typeof value !== "object") {
            continue;
        }

        if (isFunctionLikeNode(value)) {
            continue;
        }

        if (Array.isArray(value)) {
            for (const item of value) {
                stack.push({ value: item, parent, key });
            }
            continue;
        }

        if (value.type === "Identifier" && value.name === variableName) {
            const isDeclaratorId =
                parent?.type === "VariableDeclarator" && key === "id";

            if (!isDeclaratorId) {
                const referenceIndex = getNodeStartIndex(value);

                if (
                    typeof referenceIndex === "number" &&
                    referenceIndex < beforeIndex
                ) {
                    return true;
                }
            }
        }

        for (const [childKey, childValue] of Object.entries(value)) {
            if (childValue && typeof childValue === "object") {
                stack.push({
                    value: childValue,
                    parent: value,
                    key: childKey
                });
            }
        }
    }

    return false;
}

function hoistVariableDeclarationOutOfBlock({
    declarationNode,
    blockBody,
    declarationIndex,
    statementContainer,
    statementIndex,
    diagnostic,
    variableName
}) {
    if (!declarationNode || declarationNode.type !== "VariableDeclaration") {
        return null;
    }

    if (!Array.isArray(blockBody) || typeof declarationIndex !== "number") {
        return null;
    }

    if (
        !Array.isArray(statementContainer) ||
        typeof statementIndex !== "number"
    ) {
        return null;
    }

    const declarator = getSingleVariableDeclarator(declarationNode);

    if (!declarator || !declarator.init) {
        return null;
    }

    const hoistedDeclaration = createHoistedVariableDeclaration(declarator);

    if (!hoistedDeclaration) {
        return null;
    }

    const assignment = createAssignmentFromDeclarator(
        declarator,
        declarationNode
    );

    if (!assignment) {
        return null;
    }

    const rangeStart = getNodeStartIndex(declarationNode);
    const owningStatement = statementContainer[statementIndex];
    const rangeEnd = getNodeEndIndex(owningStatement ?? declarationNode);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: variableName,
        range: {
            start: rangeStart,
            end: rangeEnd
        }
    });

    if (!fixDetail) {
        return null;
    }

    statementContainer.splice(statementIndex, 0, hoistedDeclaration);
    blockBody[declarationIndex] = assignment;

    copyCommentMetadata(declarationNode, assignment);

    attachFeatherFixMetadata(hoistedDeclaration, [fixDetail]);
    attachFeatherFixMetadata(assignment, [fixDetail]);

    return fixDetail;
}

function createHoistedVariableDeclaration(declaratorTemplate) {
    if (
        !declaratorTemplate ||
        declaratorTemplate.type !== "VariableDeclarator"
    ) {
        return null;
    }

    const identifier = cloneIdentifier(declaratorTemplate.id);

    if (!identifier) {
        return null;
    }

    const declarator = {
        type: "VariableDeclarator",
        id: identifier,
        init: null
    };

    if (hasOwn(declaratorTemplate, "start")) {
        declarator.start = cloneLocation(declaratorTemplate.start);
    }

    if (hasOwn(declaratorTemplate, "end")) {
        declarator.end = cloneLocation(declaratorTemplate.end);
    }

    const declaration = {
        type: "VariableDeclaration",
        kind: "var",
        declarations: [declarator]
    };

    if (hasOwn(declaratorTemplate, "start")) {
        declaration.start = cloneLocation(declaratorTemplate.start);
    }

    if (hasOwn(declaratorTemplate, "end")) {
        declaration.end = cloneLocation(declaratorTemplate.end);
    }

    return declaration;
}

function removeInvalidEventInheritedCalls({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visitArray = (array, owner, ownerKey) => {
        if (!Array.isArray(array)) {
            return;
        }

        for (let index = 0; index < array.length; ) {
            const removed = visit(array[index], array, index, owner, ownerKey);

            if (!removed) {
                index += 1;
            }
        }
    };

    const visit = (node, parent, property, owner, ownerKey) => {
        if (!node) {
            return false;
        }

        if (Array.isArray(node)) {
            visitArray(node, owner, ownerKey);
            return false;
        }

        if (typeof node !== "object") {
            return false;
        }

        if (node.type === "CallExpression") {
            const fix = removeEventInheritedCall(
                node,
                parent,
                property,
                owner,
                ownerKey,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
                return true;
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (!value || typeof value !== "object") {
                continue;
            }

            if (Array.isArray(value)) {
                visitArray(value, node, key);
            } else {
                visit(value, node, key, node, key);
            }
        }

        return false;
    };

    visit(ast, null, null, null, null);

    return fixes;
}

function removeEventInheritedCall(
    node,
    parent,
    property,
    owner,
    ownerKey,
    diagnostic
) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!isStatementContainer(owner, ownerKey)) {
        return null;
    }

    if (!isEventInheritedCall(node)) {
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

    parent.splice(property, 1);

    return fixDetail;
}

function ensureColourWriteEnableIsReset({ ast, diagnostic }) {
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
            const fix = ensureColourWriteEnableResetAfterCall(
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

function ensureColourWriteEnableResetAfterCall(
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

    if (!isIdentifierWithName(node.object, "gpu_set_colourwriteenable")) {
        return null;
    }

    const args = getCallExpressionArguments(node);

    if (!hasDisabledColourChannel(args)) {
        return null;
    }

    const siblings = parent;

    const insertionInfo = computeStateResetInsertionIndex({
        siblings,
        startIndex: property + 1,
        isResetCall: isColourWriteEnableResetCall
    });

    if (!insertionInfo) {
        return null;
    }

    if (insertionInfo.alreadyReset) {
        return null;
    }

    const resetCall = createColourWriteEnableResetCall(node);

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

    let insertionIndex = insertionInfo.index;

    const previousSibling = siblings[insertionIndex - 1] ?? node;
    const nextSibling = siblings[insertionIndex] ?? null;
    const shouldInsertSeparator =
        insertionIndex > property + 1 &&
        !isTriviallyIgnorableStatement(previousSibling) &&
        !hasOriginalBlankLineBetween(previousSibling, nextSibling);

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

function ensureRequiredArgumentProvided({ ast, diagnostic, callTemplate }) {
    if (
        !diagnostic ||
        !ast ||
        typeof ast !== "object" ||
        !callTemplate?.functionName ||
        !callTemplate.argumentTemplate
    ) {
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
            const fix = ensureCallHasRequiredArgument(
                node,
                diagnostic,
                callTemplate
            );

            if (fix) {
                fixes.push(fix);
                return;
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

function ensureCallHasRequiredArgument(node, diagnostic, callTemplate) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!isIdentifierWithName(node.object, callTemplate.functionName)) {
        return null;
    }

    if (isNonEmptyArray(node.arguments)) {
        return null;
    }

    const argumentNode = cloneNodeWithoutLocations(
        callTemplate.argumentTemplate
    );

    if (!argumentNode || typeof argumentNode !== "object") {
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

    if (!Array.isArray(node.arguments)) {
        node.arguments = [];
    }

    node.arguments.push(argumentNode);
    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function createFunctionCallTemplateFromDiagnostic(diagnostic) {
    const example =
        typeof diagnostic?.goodExample === "string"
            ? diagnostic.goodExample
            : null;

    if (!example) {
        return null;
    }

    try {
        const exampleAst = GMLParser.parse(example, {
            getLocations: true,
            simplifyLocations: false
        });
        const callExpression = findFirstCallExpression(exampleAst);

        if (!callExpression || !isIdentifier(callExpression.object)) {
            return null;
        }

        const args = getCallExpressionArguments(callExpression);

        if (args.length === 0) {
            return null;
        }

        return {
            functionName: callExpression.object.name,
            argumentTemplate: cloneNodeWithoutLocations(args[0])
        };
    } catch (error) {
        return null;
    }
}

function findFirstCallExpression(node) {
    if (!node) {
        return null;
    }

    if (Array.isArray(node)) {
        for (const item of node) {
            const result = findFirstCallExpression(item);

            if (result) {
                return result;
            }
        }

        return null;
    }

    if (typeof node !== "object") {
        return null;
    }

    if (node.type === "CallExpression") {
        return node;
    }

    for (const value of Object.values(node)) {
        const result = findFirstCallExpression(value);

        if (result) {
            return result;
        }
    }

    return null;
}

function cloneNodeWithoutLocations(node) {
    if (!node || typeof node !== "object") {
        return node;
    }

    if (Array.isArray(node)) {
        return node.map((item) => cloneNodeWithoutLocations(item));
    }

    const clone = {};

    for (const [key, value] of Object.entries(node)) {
        if (key === "start" || key === "end") {
            continue;
        }

        clone[key] = cloneNodeWithoutLocations(value);
    }

    return clone;
}

function ensureNumericOperationsUseRealLiteralCoercion({ ast, diagnostic }) {
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

        if (node.type === "BinaryExpression") {
            const fix = coerceStringLiteralsInBinaryExpression(
                node,
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

function coerceStringLiteralsInBinaryExpression(node, diagnostic) {
    if (!node || node.type !== "BinaryExpression") {
        return null;
    }

    if (node.operator !== "+") {
        return null;
    }

    const leftLiteral = isCoercibleStringLiteral(node.left) ? node.left : null;
    const rightLiteral = isCoercibleStringLiteral(node.right)
        ? node.right
        : null;

    if (!leftLiteral && !rightLiteral) {
        return null;
    }

    if (leftLiteral) {
        node.left = createRealCoercionCall(leftLiteral);
    }

    if (rightLiteral) {
        node.right = createRealCoercionCall(rightLiteral);
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: node.operator ?? null,
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

function isCoercibleStringLiteral(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    const rawValue = typeof node.value === "string" ? node.value : null;

    if (!rawValue) {
        return false;
    }

    let literalText = null;

    if (rawValue.startsWith('@"') && rawValue.endsWith('"')) {
        literalText = rawValue.slice(2, -1);
    } else if (rawValue.length >= 2) {
        const startingQuote = rawValue[0];
        const endingQuote = rawValue[rawValue.length - 1];

        if (
            (startingQuote === '"' || startingQuote === "'") &&
            startingQuote === endingQuote
        ) {
            literalText = rawValue.slice(1, -1);
        }
    }

    if (literalText == null) {
        return false;
    }

    const trimmed = literalText.trim();

    if (trimmed.length === 0) {
        return false;
    }

    return NUMERIC_STRING_LITERAL_PATTERN.test(trimmed);
}

function createRealCoercionCall(literal) {
    const argument = cloneLiteral(literal) ?? literal;

    if (argument && typeof argument === "object") {
        argument._skipNumericStringCoercion = true;
    }

    const identifier = createIdentifierFromTemplate("real", literal);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [argument],
        start: cloneLocation(literal.start),
        end: cloneLocation(literal.end)
    };

    return callExpression;
}

function addMissingEnumMembers({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const enumRegistry = collectEnumDeclarations(ast);

    if (enumRegistry.size === 0) {
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

        if (node.type === "MemberDotExpression") {
            const fix = addMissingEnumMember(node, enumRegistry, diagnostic);

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

function collectEnumDeclarations(ast) {
    const registry = new Map();

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

        if (node.type === "EnumDeclaration") {
            const enumName = node.name?.name;

            if (enumName && !registry.has(enumName)) {
                let members = Array.isArray(node.members) ? node.members : null;

                if (!members) {
                    members = [];
                    node.members = members;
                }

                const memberNames = new Set();

                for (const member of members) {
                    const memberName = member?.name?.name;
                    if (memberName) {
                        memberNames.add(memberName);
                    }
                }

                registry.set(enumName, {
                    declaration: node,
                    members,
                    memberNames
                });
            }
        }

        for (const value of Object.values(node)) {
            if (value && typeof value === "object") {
                visit(value);
            }
        }
    };

    visit(ast);

    return registry;
}

function addMissingEnumMember(memberExpression, enumRegistry, diagnostic) {
    if (!memberExpression || memberExpression.type !== "MemberDotExpression") {
        return null;
    }

    const enumIdentifier = memberExpression.object;
    const memberIdentifier = memberExpression.property;

    if (!enumIdentifier || enumIdentifier.type !== "Identifier") {
        return null;
    }

    if (!memberIdentifier || memberIdentifier.type !== "Identifier") {
        return null;
    }

    const enumName = enumIdentifier.name;
    const memberName = memberIdentifier.name;

    if (!enumName || !memberName) {
        return null;
    }

    const enumInfo = enumRegistry.get(enumName);

    if (!enumInfo) {
        return null;
    }

    if (enumInfo.memberNames.has(memberName)) {
        return null;
    }

    const newMember = createEnumMember(memberName);

    if (!newMember) {
        return null;
    }

    const insertIndex = getEnumInsertionIndex(enumInfo.members);
    enumInfo.members.splice(insertIndex, 0, newMember);
    enumInfo.memberNames.add(memberName);

    const start = getNodeStartIndex(memberIdentifier);
    const end = getNodeEndIndex(memberIdentifier);

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: `${enumName}.${memberName}`,
        range: start !== null && end !== null ? { start, end } : null
    });

    if (!fixDetail) {
        return null;
    }

    attachFeatherFixMetadata(newMember, [fixDetail]);

    const declaration = enumInfo.declaration;
    if (declaration && typeof declaration === "object") {
        attachFeatherFixMetadata(declaration, [fixDetail]);
    }

    return fixDetail;
}

function createEnumMember(name) {
    if (typeof name !== "string" || name.length === 0) {
        return null;
    }

    return {
        type: "EnumMember",
        name: {
            type: "Identifier",
            name
        },
        initializer: null
    };
}

function getEnumInsertionIndex(members) {
    if (!Array.isArray(members) || members.length === 0) {
        return Array.isArray(members) ? members.length : 0;
    }

    const lastIndex = members.length - 1;
    const lastMember = members[lastIndex];

    if (isSizeofEnumMember(lastMember)) {
        return lastIndex;
    }

    return members.length;
}

function isSizeofEnumMember(member) {
    if (!member || member.type !== "EnumMember") {
        return false;
    }

    const identifier = member.name;

    if (!identifier || identifier.type !== "Identifier") {
        return false;
    }

    return identifier.name === "SIZEOF";
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

    const args = getCallArgumentsOrEmpty(node);

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
        nextSibling &&
        !isTriviallyIgnorableStatement(nextSibling) &&
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

function computeStateResetInsertionIndex({
    siblings,
    startIndex,
    isResetCall
}) {
    if (!Array.isArray(siblings)) {
        return null;
    }

    let insertionIndex = siblings.length;

    for (let index = startIndex; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (typeof isResetCall === "function" && isResetCall(sibling)) {
            return { alreadyReset: true };
        }

        if (isExitLikeStatement(sibling)) {
            insertionIndex = index;
            break;
        }
    }

    while (
        insertionIndex > startIndex &&
        insertionIndex <= siblings.length &&
        isTriviallyIgnorableStatement(siblings[insertionIndex - 1])
    ) {
        insertionIndex -= 1;
    }

    return { index: insertionIndex };
}

function isExitLikeStatement(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    switch (node.type) {
        case "ReturnStatement":
        case "ThrowStatement":
        case "ExitStatement":
            return true;
        default:
            return false;
    }
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

function ensureGpuStateIsPopped({ ast, diagnostic }) {
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

        if (node.type === "IfStatement") {
            const fix = moveGpuPopStateCallOutOfConditional(
                node,
                parent,
                property,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
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

function moveGpuPopStateCallOutOfConditional(
    node,
    parent,
    property,
    diagnostic
) {
    if (!Array.isArray(parent) || typeof property !== "number") {
        return null;
    }

    if (!node || node.type !== "IfStatement") {
        return null;
    }

    const consequentBlock = node.consequent;

    if (!consequentBlock || consequentBlock.type !== "BlockStatement") {
        return null;
    }

    const consequentBody = getBodyStatements(consequentBlock);

    if (consequentBody.length === 0) {
        return null;
    }

    const trailingPopIndex = findTrailingGpuPopIndex(consequentBody);

    if (trailingPopIndex === -1) {
        return null;
    }

    if (hasTrailingGpuPopInAlternate(node.alternate)) {
        return null;
    }

    const siblings = parent;

    if (hasGpuPopStateAfterIndex(siblings, property)) {
        return null;
    }

    if (!hasGpuPushStateBeforeIndex(siblings, property)) {
        return null;
    }

    const [popStatement] = consequentBody.splice(trailingPopIndex, 1);
    const callExpression = getCallExpression(popStatement);

    if (
        !callExpression ||
        !isIdentifierWithName(callExpression.object, "gpu_pop_state")
    ) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: callExpression.object?.name ?? "gpu_pop_state",
        range: {
            start: getNodeStartIndex(callExpression),
            end: getNodeEndIndex(callExpression)
        }
    });

    if (!fixDetail) {
        return null;
    }

    siblings.splice(property + 1, 0, popStatement);
    attachFeatherFixMetadata(callExpression, [fixDetail]);

    return fixDetail;
}

function hasTrailingGpuPopInAlternate(alternate) {
    if (!alternate) {
        return false;
    }

    if (alternate.type === "BlockStatement") {
        const body = getBodyStatements(alternate);

        if (body.length === 0) {
            return false;
        }

        return isGpuPopStateCallStatement(body[body.length - 1]);
    }

    if (alternate.type === "IfStatement") {
        return true;
    }

    return isGpuPopStateCallStatement(alternate);
}

function findTrailingGpuPopIndex(statements) {
    if (!Array.isArray(statements) || statements.length === 0) {
        return -1;
    }

    for (let index = statements.length - 1; index >= 0; index -= 1) {
        const statement = statements[index];

        if (isGpuPopStateCallStatement(statement)) {
            return index;
        }

        if (!isEmptyStatement(statement)) {
            break;
        }
    }

    return -1;
}

function isEmptyStatement(node) {
    return !!node && node.type === "EmptyStatement";
}

function hasGpuPopStateAfterIndex(statements, index) {
    if (!Array.isArray(statements)) {
        return false;
    }

    for (let offset = index + 1; offset < statements.length; offset += 1) {
        const statement = statements[offset];
        if (isEmptyStatement(statement)) {
            continue;
        }

        if (isGpuPopStateCallStatement(statement)) {
            return true;
        }

        break;
    }

    return false;
}

function hasGpuPushStateBeforeIndex(statements, index) {
    if (!Array.isArray(statements)) {
        return false;
    }

    for (let offset = index - 1; offset >= 0; offset -= 1) {
        const statement = statements[offset];
        if (isEmptyStatement(statement)) {
            continue;
        }
        if (isGpuPushStateCallStatement(statement)) {
            return true;
        }
    }

    return false;
}

function isGpuPopStateCallStatement(node) {
    const expression = getCallExpression(node);

    if (!expression) {
        return false;
    }

    return isIdentifierWithName(expression.object, "gpu_pop_state");
}

function isGpuPushStateCallStatement(node) {
    const expression = getCallExpression(node);

    if (!expression) {
        return false;
    }

    return isIdentifierWithName(expression.object, "gpu_push_state");
}

function getCallExpression(node) {
    if (!node) {
        return null;
    }

    if (node.type === "CallExpression") {
        return node;
    }

    if (node.type === "ExpressionStatement") {
        const expression = node.expression;

        if (expression && expression.type === "CallExpression") {
            return expression;
        }
    }

    return null;
}

function removeDanglingFileFindCalls({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            if (isStatementList(parent, property)) {
                sanitizeFileFindCalls(node, parent, fixes, diagnostic, ast);
            }

            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }
            return;
        }

        if (typeof node !== "object") {
            return;
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

function sanitizeFileFindCalls(
    statements,
    parent,
    fixes,
    diagnostic,
    metadataRoot
) {
    if (!Array.isArray(statements) || statements.length === 0) {
        return;
    }

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (!isFileFindBlockFunctionCall(statement)) {
            continue;
        }

        if (!hasPrecedingFileFindClose(statements, index)) {
            continue;
        }

        const fixDetail = createFeatherFixDetail(diagnostic, {
            target: getCallExpressionCalleeName(statement),
            range: {
                start: getNodeStartIndex(statement),
                end: getNodeEndIndex(statement)
            }
        });

        if (!fixDetail) {
            continue;
        }

        const metadataTarget =
            parent && typeof parent === "object" ? parent : null;
        if (metadataTarget && metadataTarget !== metadataRoot) {
            attachFeatherFixMetadata(metadataTarget, [fixDetail]);
        }

        statements.splice(index, 1);
        index -= 1;

        fixes.push(fixDetail);
    }
}

function isStatementList(parent, property) {
    if (!parent || typeof property === "number") {
        return false;
    }

    if (property === "body") {
        return parent.type === "Program" || parent.type === "BlockStatement";
    }

    if (property === "consequent" && parent.type === "SwitchCase") {
        return true;
    }

    return false;
}

function isFileFindBlockFunctionCall(statement) {
    if (!statement || typeof statement !== "object") {
        return false;
    }

    const calleeName = getCallExpressionCalleeName(statement);

    if (!calleeName) {
        return false;
    }

    return FILE_FIND_BLOCK_CALL_TARGETS.has(calleeName);
}

function hasPrecedingFileFindClose(statements, index) {
    for (let offset = index - 1; offset >= 0; offset -= 1) {
        const candidate = statements[offset];

        if (
            isCallExpressionStatementWithName(
                candidate,
                FILE_FIND_CLOSE_FUNCTION_NAME
            )
        ) {
            return true;
        }
    }

    return false;
}

function isCallExpressionStatementWithName(statement, name) {
    if (!statement || typeof statement !== "object" || !name) {
        return false;
    }

    const calleeName = getCallExpressionCalleeName(statement);

    return calleeName === name;
}

function getCallExpressionCalleeName(node) {
    if (!node || typeof node !== "object") {
        return null;
    }

    if (node.type === "CallExpression") {
        return node.object?.name ?? null;
    }

    if (node.type === "ExpressionStatement") {
        return getCallExpressionCalleeName(node.expression);
    }

    return null;
}

function ensureVertexFormatDefinitionsAreClosed({ ast, diagnostic }) {
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
            const fix = ensureVertexFormatDefinitionIsClosed(
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

function ensureVertexFormatsClosedBeforeStartingNewOnes({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const fixes = [];

    const visit = (node, parent, property) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            if (shouldProcessStatementSequence(parent, property)) {
                ensureSequentialVertexFormatsAreClosed(node, diagnostic, fixes);
            }

            for (let index = 0; index < node.length; index += 1) {
                visit(node[index], node, index);
            }

            return;
        }

        if (typeof node !== "object") {
            return;
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

function ensureSequentialVertexFormatsAreClosed(statements, diagnostic, fixes) {
    if (!Array.isArray(statements) || statements.length === 0) {
        return;
    }

    const openBegins = [];

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (!statement || typeof statement !== "object") {
            continue;
        }

        if (isVertexFormatBeginCall(statement)) {
            if (openBegins.length > 0) {
                const previousBegin = openBegins[openBegins.length - 1];

                if (previousBegin && previousBegin !== statement) {
                    const fixDetail = insertVertexFormatEndBefore(
                        statements,
                        index,
                        previousBegin,
                        diagnostic
                    );

                    if (fixDetail) {
                        fixes.push(fixDetail);
                        openBegins.pop();
                    }
                }
            }

            if (openBegins[openBegins.length - 1] !== statement) {
                openBegins.push(statement);
            }
            continue;
        }

        const closingCount = countVertexFormatEndCalls(statement);

        for (
            let consumed = 0;
            consumed < closingCount && openBegins.length > 0;
            consumed += 1
        ) {
            openBegins.pop();
        }
    }
}

function shouldProcessStatementSequence(parent, property) {
    if (!parent) {
        return true;
    }

    if (property === "body") {
        return parent.type === "Program" || parent.type === "BlockStatement";
    }

    return parent.type === "CaseClause" && property === "consequent";
}

function insertVertexFormatEndBefore(
    statements,
    index,
    templateBegin,
    diagnostic
) {
    if (!Array.isArray(statements) || typeof index !== "number") {
        return null;
    }

    if (!templateBegin || typeof templateBegin !== "object") {
        return null;
    }

    const replacement = createVertexFormatEndCall(templateBegin);

    if (!replacement) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: templateBegin?.object?.name ?? null,
        range: {
            start: getNodeStartIndex(templateBegin),
            end: getNodeEndIndex(templateBegin)
        }
    });

    if (!fixDetail) {
        return null;
    }

    statements.splice(index, 0, replacement);
    attachFeatherFixMetadata(replacement, [fixDetail]);

    return fixDetail;
}

function countVertexFormatEndCalls(node) {
    const stack = [node];
    const seen = new Set();
    let count = 0;

    while (stack.length > 0) {
        const current = stack.pop();

        if (!current || typeof current !== "object") {
            continue;
        }

        if (seen.has(current)) {
            continue;
        }

        seen.add(current);

        if (isVertexFormatEndCall(current)) {
            count += 1;
        }

        if (Array.isArray(current)) {
            for (let index = 0; index < current.length; index += 1) {
                stack.push(current[index]);
            }
            continue;
        }

        for (const value of Object.values(current)) {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return count;
}

function ensureVertexFormatDefinitionIsClosed(
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

    if (!isIdentifierWithName(node.object, "vertex_format_begin")) {
        return null;
    }

    const siblings = parent;
    let insertionIndex = property + 1;

    for (let index = property + 1; index < siblings.length; index += 1) {
        const sibling = siblings[index];

        if (nodeContainsVertexFormatEndCall(sibling)) {
            return null;
        }

        if (isVertexFormatBeginCall(sibling)) {
            break;
        }

        if (isVertexFormatAddCall(sibling)) {
            insertionIndex = index + 1;
            continue;
        }

        break;
    }

    const vertexFormatEndCall = createVertexFormatEndCall(node);

    if (!vertexFormatEndCall) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: "vertex_format_end",
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });

    if (!fixDetail) {
        return null;
    }

    siblings.splice(insertionIndex, 0, vertexFormatEndCall);
    attachFeatherFixMetadata(vertexFormatEndCall, [fixDetail]);

    return fixDetail;
}

function nodeContainsVertexFormatEndCall(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (isVertexFormatEndCall(node)) {
        return true;
    }

    if (Array.isArray(node)) {
        return node.some(nodeContainsVertexFormatEndCall);
    }

    for (const value of Object.values(node)) {
        if (nodeContainsVertexFormatEndCall(value)) {
            return true;
        }
    }

    return false;
}

function isVertexFormatEndCall(node) {
    return (
        !!node &&
        node.type === "CallExpression" &&
        isIdentifierWithName(node.object, "vertex_format_end")
    );
}

function isVertexFormatBeginCall(node) {
    return (
        !!node &&
        node.type === "CallExpression" &&
        isIdentifierWithName(node.object, "vertex_format_begin")
    );
}

function isVertexFormatAddCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    const identifier = node.object;

    if (!identifier || identifier.type !== "Identifier") {
        return false;
    }

    return (
        typeof identifier.name === "string" &&
        identifier.name.startsWith("vertex_format_add_")
    );
}

function createVertexFormatEndCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = createIdentifier("vertex_format_end", template.object);

    if (!identifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: []
    };

    if (hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
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

            if (isNonEmptyArray(callFixes)) {
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

function annotateMissingUserEvents({ ast, diagnostic }) {
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
            const fix = annotateUserEventCall(node, diagnostic);

            if (fix) {
                fixes.push(fix);
                return;
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

function annotateUserEventCall(node, diagnostic) {
    const eventInfo = getUserEventReference(node);

    if (!eventInfo) {
        return null;
    }

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: eventInfo.name,
        automatic: false,
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

function getUserEventReference(node) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const callee = node.object;
    const args = getCallArgumentsOrEmpty(node);

    if (isIdentifierWithName(callee, "event_user")) {
        const eventIndex = resolveUserEventIndex(args[0]);

        if (eventIndex === null) {
            return null;
        }

        return { index: eventIndex, name: formatUserEventName(eventIndex) };
    }

    if (isIdentifierWithName(callee, "event_perform")) {
        if (args.length < 2 || !isIdentifierWithName(args[0], "ev_user")) {
            return null;
        }

        const eventIndex = resolveUserEventIndex(args[1]);

        if (eventIndex === null) {
            return null;
        }

        return { index: eventIndex, name: formatUserEventName(eventIndex) };
    }

    if (isIdentifierWithName(callee, "event_perform_object")) {
        if (args.length < 3) {
            return null;
        }

        const eventIndex = resolveUserEventIndex(args[2]);

        if (eventIndex === null) {
            return null;
        }

        return { index: eventIndex, name: formatUserEventName(eventIndex) };
    }

    return null;
}

function resolveUserEventIndex(node) {
    if (!node) {
        return null;
    }

    if (node.type === "Literal") {
        const numericValue =
            typeof node.value === "number" ? node.value : Number(node.value);

        if (
            !Number.isInteger(numericValue) ||
            numericValue < 0 ||
            numericValue > 15
        ) {
            return null;
        }

        return numericValue;
    }

    if (node.type === "Identifier") {
        const match = /^ev_user(\d+)$/.exec(node.name);

        if (!match) {
            return null;
        }

        const numericValue = Number.parseInt(match[1], 10);

        if (
            !Number.isInteger(numericValue) ||
            numericValue < 0 ||
            numericValue > 15
        ) {
            return null;
        }

        return numericValue;
    }

    return null;
}

function formatUserEventName(index) {
    if (!Number.isInteger(index)) {
        return null;
    }

    return `User Event ${index}`;
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
    const params = getArrayProperty(node, "params");
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

function cloneLiteral(node) {
    if (!node || node.type !== "Literal") {
        return null;
    }

    const cloned = {
        type: "Literal",
        value: node.value
    };

    if (Object.hasOwn(node, "start")) {
        cloned.start = cloneLocation(node.start);
    }

    if (Object.hasOwn(node, "end")) {
        cloned.end = cloneLocation(node.end);
    }

    return cloned;
}

function createIdentifierFromTemplate(name, template) {
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

function isDrawPrimitiveBeginCall(node) {
    return isCallExpressionWithName(node, "draw_primitive_begin");
}

function isDrawPrimitiveEndCall(node) {
    return isCallExpressionWithName(node, "draw_primitive_end");
}

function isCallExpressionWithName(node, name) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return isIdentifierWithName(node.object, name);
}

function createPrimitiveBeginCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = createIdentifier(
        "draw_primitive_begin",
        template.object
    );

    if (!identifier) {
        return null;
    }

    const primitiveType = createIdentifier("pr_linelist");

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [primitiveType].filter(Boolean)
    };

    if (Object.hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        const referenceLocation = template.start ?? template.end;

        if (referenceLocation) {
            callExpression.end = cloneLocation(referenceLocation);
        }
    }

    return callExpression;
}

function isLiteralZero(node) {
    if (!node || node.type !== "Literal") {
        return false;
    }

    return node.value === "0" || node.value === 0;
}

function isDrawSurfaceCall(node) {
    if (!isCallExpression(node)) {
        return false;
    }

    const name = node.object?.name;

    if (typeof name !== "string") {
        return false;
    }

    return name.startsWith("draw_surface");
}

function isTerminatingStatement(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    return (
        node.type === "ReturnStatement" ||
        node.type === "BreakStatement" ||
        node.type === "ContinueStatement" ||
        node.type === "ThrowStatement" ||
        node.type === "ExitStatement"
    );
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

function isShaderResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "shader_reset")) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    return args.length === 0;
}

function isFogResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_fog")) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length < 4) {
        return false;
    }

    return (
        isLiteralFalse(args[0]) &&
        isIdentifierWithName(args[1], "c_black") &&
        isLiteralZero(args[2]) &&
        isLiteralOne(args[3])
    );
}

function isAlphaTestEnableResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_alphatestenable")) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length === 0) {
        return false;
    }

    return isLiteralFalse(args[0]);
}

function isAlphaTestRefResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_alphatestref")) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length === 0) {
        return false;
    }

    return isLiteralZero(args[0]);
}

function isHalignResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "draw_set_halign")) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length === 0) {
        return false;
    }

    return isIdentifierWithName(args[0], "fa_left");
}

function isCullModeResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_cullmode")) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length === 0) {
        return false;
    }

    return isIdentifierWithName(args[0], "cull_noculling");
}

function isColourWriteEnableResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_colourwriteenable")) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length < 4) {
        return false;
    }

    return args
        .slice(0, 4)
        .every((argument) => isBooleanLiteral(argument, true));
}

function isAlphaTestDisableCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_alphatestenable")) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length === 0) {
        return false;
    }

    const [argument] = args;

    return isLiteralFalse(argument) || isLiteralZero(argument);
}

function createAlphaTestEnableResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_alphatestenable") {
        return null;
    }

    const literalFalse = createLiteral("false", template.arguments?.[0]);

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [literalFalse]
    };

    if (hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
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

function createBlendModeResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_blendmode") {
        return null;
    }

    const blendModeIdentifier = createIdentifier(
        "bm_normal",
        template.arguments?.[0]
    );

    if (!blendModeIdentifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [blendModeIdentifier]
    };

    if (Object.hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function isSurfaceSetTargetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return isIdentifierWithName(node.object, "surface_set_target");
}

function createHalignResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "draw_set_halign") {
        return null;
    }

    const faLeft = createIdentifier("fa_left", template.arguments?.[0]);

    if (!faLeft) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [faLeft]
    };

    if (Object.hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function createCullModeResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_cullmode") {
        return null;
    }

    const resetArgument = createIdentifier(
        "cull_noculling",
        template.arguments?.[0]
    );

    if (!resetArgument) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [resetArgument]
    };

    if (Object.hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function createColourWriteEnableResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_colourwriteenable") {
        return null;
    }

    const templateArgs = Array.isArray(template.arguments)
        ? template.arguments
        : [];
    const argumentsList = [];

    for (let index = 0; index < 4; index += 1) {
        const argumentTemplate =
            templateArgs[index] ??
            templateArgs[templateArgs.length - 1] ??
            template;
        const literalTrue = createLiteral("true", argumentTemplate);
        argumentsList.push(literalTrue);
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: argumentsList
    };

    if (Object.hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
}

function isBlendModeNormalArgument(node) {
    if (!node || typeof node !== "object") {
        return false;
    }

    if (isIdentifierWithName(node, "bm_normal")) {
        return true;
    }

    if (node.type === "Literal") {
        return node.value === "bm_normal";
    }

    return false;
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

    const args = getCallArgumentsOrEmpty(node);

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

function isBlendModeResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_blendmode")) {
        return false;
    }

    const args = getCallExpressionArguments(node);

    if (args.length === 0) {
        return false;
    }

    return isBlendModeNormalArgument(args[0]);
}

function isBlendEnableResetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "gpu_set_blendenable")) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length === 0) {
        return false;
    }

    const [argument] = args;

    return isLiteralTrue(argument) || isLiteralOne(argument);
}

function createShaderResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = createIdentifier("shader_reset", template.object);

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

function createFogResetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = cloneIdentifier(template.object);

    if (!identifier || identifier.name !== "gpu_set_fog") {
        return null;
    }

    const [argument0, argument1, argument2, argument3] = Array.isArray(
        template.arguments
    )
        ? template.arguments
        : [];

    const falseLiteral = createLiteral("false", argument0);
    const colorIdentifier = createIdentifier("c_black", argument1);
    const zeroLiteral = createLiteral("0", argument2);
    const oneLiteral = createLiteral("1", argument3);

    if (!falseLiteral || !colorIdentifier || !zeroLiteral || !oneLiteral) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: [falseLiteral, colorIdentifier, zeroLiteral, oneLiteral]
    };

    if (Object.hasOwn(template, "start")) {
        callExpression.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        callExpression.end = cloneLocation(template.end);
    }

    return callExpression;
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
    node._flattenSyntheticNumericParens = true;

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

    const trimmedType = toTrimmedString(typeText);

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
            if (isNonEmptyTrimmedString(current)) {
                segments.push(current.trim());
            }
            current = "";
            continue;
        }

        current += char;
    }

    if (isNonEmptyTrimmedString(current)) {
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

    return structuredClone(node);
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

function isSurfaceResetTargetCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return isIdentifierWithName(node.object, "surface_reset_target");
}

function createSurfaceResetTargetCall(template) {
    if (!template || template.type !== "CallExpression") {
        return null;
    }

    const identifier = createIdentifier(
        "surface_reset_target",
        template.object
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

function isDrawFunctionCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    const identifier = node.object;

    if (!isIdentifier(identifier)) {
        return false;
    }

    return (
        typeof identifier.name === "string" &&
        identifier.name.startsWith("draw_")
    );
}

function extractSurfaceTargetName(node) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    const args = getCallArgumentsOrEmpty(node);

    if (args.length > 0 && isIdentifier(args[0])) {
        return args[0].name;
    }

    return node.object?.name ?? null;
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

function isEventInheritedCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    if (!isIdentifierWithName(node.object, "event_inherited")) {
        return false;
    }

    const args = getCallArgumentsOrEmpty(node);

    return args.length === 0;
}

function isStatementContainer(owner, ownerKey) {
    if (!owner || typeof owner !== "object") {
        return false;
    }

    if (ownerKey === "body") {
        return owner.type === "Program" || owner.type === "BlockStatement";
    }

    if (owner.type === "SwitchCase" && ownerKey === "consequent") {
        return true;
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

            if (isNonEmptyArray(declarationFixes)) {
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

    if (!isNonEmptyString(baseText)) {
        return null;
    }

    if (isNonEmptyString(originalName)) {
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

    if (isNonEmptyString(macro._featherMacroText)) {
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

function balanceGpuStateStack({ ast, diagnostic }) {
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

        if (node.type === "Program" || node.type === "BlockStatement") {
            const statements = getBodyStatements(node);

            if (statements.length > 0) {
                const blockFixes = balanceGpuStateCallsInStatements(
                    statements,
                    diagnostic,
                    node
                );

                if (blockFixes.length > 0) {
                    fixes.push(...blockFixes);
                }
            }

            for (const statement of statements) {
                visit(statement);
            }

            for (const [key, value] of Object.entries(node)) {
                if (key === "body") {
                    continue;
                }

                if (value && typeof value === "object") {
                    visit(value);
                }
            }

            return;
        }

        if (node.type === "CaseClause") {
            const statements = getArrayProperty(node, "consequent");

            if (statements.length > 0) {
                const blockFixes = balanceGpuStateCallsInStatements(
                    statements,
                    diagnostic,
                    node
                );

                if (blockFixes.length > 0) {
                    fixes.push(...blockFixes);
                }
            }

            if (node.test) {
                visit(node.test);
            }

            for (const statement of statements) {
                visit(statement);
            }

            for (const [key, value] of Object.entries(node)) {
                if (key === "consequent" || key === "test") {
                    continue;
                }

                if (value && typeof value === "object") {
                    visit(value);
                }
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

function balanceGpuStateCallsInStatements(statements, diagnostic, container) {
    if (!Array.isArray(statements) || statements.length === 0) {
        return [];
    }

    const unmatchedPushes = [];
    const fixes = [];

    for (let index = 0; index < statements.length; index += 1) {
        const statement = statements[index];

        if (!statement || typeof statement !== "object") {
            continue;
        }

        if (isGpuPushStateCall(statement)) {
            unmatchedPushes.push({ index, node: statement });
            continue;
        }

        if (isGpuPopStateCall(statement)) {
            if (unmatchedPushes.length > 0) {
                unmatchedPushes.pop();
                continue;
            }

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: statement.object?.name ?? "gpu_pop_state",
                range: {
                    start: getNodeStartIndex(statement),
                    end: getNodeEndIndex(statement)
                }
            });

            statements.splice(index, 1);
            index -= 1;

            if (!fixDetail) {
                continue;
            }

            fixes.push(fixDetail);
        }
    }

    if (unmatchedPushes.length > 0) {
        for (const entry of unmatchedPushes) {
            const popCall = createGpuStateCall("gpu_pop_state", entry.node);

            if (!popCall) {
                continue;
            }

            const fixDetail = createFeatherFixDetail(diagnostic, {
                target: entry.node?.object?.name ?? "gpu_push_state",
                range: {
                    start: getNodeStartIndex(entry.node),
                    end: getNodeEndIndex(entry.node)
                }
            });

            if (!fixDetail) {
                continue;
            }

            statements.push(popCall);
            attachFeatherFixMetadata(popCall, [fixDetail]);
            fixes.push(fixDetail);
        }
    }

    if (fixes.length > 0 && container && typeof container === "object") {
        attachFeatherFixMetadata(container, fixes);
    }

    return fixes;
}

function createGpuStateCall(name, template) {
    if (!name) {
        return null;
    }

    const identifier = createIdentifier(name, template?.object);

    if (!identifier) {
        return null;
    }

    const callExpression = {
        type: "CallExpression",
        object: identifier,
        arguments: []
    };

    if (template && typeof template === "object") {
        if (hasOwn(template, "start")) {
            callExpression.start = cloneLocation(template.start);
        }

        if (hasOwn(template, "end")) {
            callExpression.end = cloneLocation(template.end);
        }
    }

    return callExpression;
}

function isGpuPushStateCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return isIdentifierWithName(node.object, "gpu_push_state");
}

function isGpuPopStateCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    return isIdentifierWithName(node.object, "gpu_pop_state");
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

function applyMissingFunctionCallCorrections({ ast, diagnostic }) {
    if (!diagnostic || !ast || typeof ast !== "object") {
        return [];
    }

    const replacements =
        extractFunctionCallReplacementsFromExamples(diagnostic);

    if (!(replacements instanceof Map) || replacements.size === 0) {
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
            const fix = correctMissingFunctionCall(
                node,
                replacements,
                diagnostic
            );

            if (fix) {
                fixes.push(fix);
                return;
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

function correctMissingFunctionCall(node, replacements, diagnostic) {
    if (!node || node.type !== "CallExpression") {
        return null;
    }

    if (!(replacements instanceof Map) || replacements.size === 0) {
        return null;
    }

    const callee = node.object;

    if (!callee || callee.type !== "Identifier") {
        return null;
    }

    const replacementName = replacements.get(callee.name);

    if (!replacementName || replacementName === callee.name) {
        return null;
    }

    const startIndex = getNodeStartIndex(callee);
    const endIndex = getNodeEndIndex(callee);
    const range =
        typeof startIndex === "number" && typeof endIndex === "number"
            ? { start: startIndex, end: endIndex }
            : null;

    const fixDetail = createFeatherFixDetail(diagnostic, {
        target: callee.name ?? null,
        range
    });

    if (!fixDetail) {
        return null;
    }

    fixDetail.replacement = replacementName;

    callee.name = replacementName;
    attachFeatherFixMetadata(node, [fixDetail]);

    return fixDetail;
}

function extractFunctionCallReplacementsFromExamples(diagnostic) {
    const replacements = new Map();

    if (!diagnostic) {
        return replacements;
    }

    const badExampleCalls = extractFunctionCallNamesFromExample(
        diagnostic.badExample
    );
    const goodExampleCalls = extractFunctionCallNamesFromExample(
        diagnostic.goodExample
    );

    const count = Math.min(badExampleCalls.length, goodExampleCalls.length);

    for (let index = 0; index < count; index += 1) {
        const typo = badExampleCalls[index];
        const correction = goodExampleCalls[index];

        if (!typo || !correction || typo === correction) {
            continue;
        }

        if (!replacements.has(typo)) {
            replacements.set(typo, correction);
        }
    }

    return replacements;
}

function extractFunctionCallNamesFromExample(exampleText) {
    if (typeof exampleText !== "string" || exampleText.length === 0) {
        return [];
    }

    const matches = [];
    const lines = exampleText.split(/\r?\n/);

    for (const line of lines) {
        if (!line || !line.includes("(")) {
            continue;
        }

        const [code] = line.split("//", 1);
        if (!isNonEmptyTrimmedString(code)) {
            continue;
        }

        const callPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?=\()/g;
        let match;
        while ((match = callPattern.exec(code))) {
            matches.push(match[1]);
        }
    }

    return matches;
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

    const programBody = getBodyStatements(ast);

    if (programBody.length === 0) {
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
