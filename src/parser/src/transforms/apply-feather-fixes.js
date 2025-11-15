// The parser package delegates the full implementation to the plugin-side
// version of this transform. The plugin contains the canonical, complete
// implementation (with many helper functions and metadata resources). To
// avoid duplication and keep the parser copy small and in sync, re-export
// everything from the plugin implementation.

import GMLParser from "@gml-modules/parser";

import {
    getNodeEndIndex,
    getNodeStartIndex,
    cloneLocation,
    assignClonedLocation,
    getCallExpressionArguments,
    isVarVariableDeclaration,
    isNode,
    forEachNodeChild,
    visitChildNodes,
    getNonEmptyString,
    isNonEmptyString,
    toTrimmedString,
    isFiniteNumber,
    asArray,
    isArrayIndex,
    isNonEmptyArray,
    isSetLike
} from "@gml-modules/core";


import {
    buildDeprecatedBuiltinVariableReplacements
} from "@gml-modules/core";
import {
    getFeatherDiagnostics
} from "@gml-modules/core";
import { buildFeatherTypeSystemInfo } from "../utils/feather-type-system.js";
import { loadReservedIdentifierNames } from "@gml-modules/semantic";

function walkAstNodes(root, visitor) {
    const visit = (node, parent, key) => {
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

        const shouldDescend = visitor(node, parent, key);

        if (shouldDescend === false) {
            return;
        }

        for (const [childKey, childValue] of Object.entries(node)) {
            if (childValue && typeof childValue === "object") {
                visit(childValue, node, childKey);
            }
        }
    };

    visit(root, null, null);
}

function hasArrayParentWithNumericIndex(parent, property) {
    if (!Array.isArray(parent)) {
        return false;
    }

    if (typeof property !== "number") {
        return false;
    }

    return true;
}

function resolveCallExpressionArrayContext(node, parent, property) {
    if (!hasArrayParentWithNumericIndex(parent, property)) {
        return null;
    }

    if (!isNode(node) || node.type !== "CallExpression") {
        return null;
    }

    return {
        callExpression: node,
        siblings: parent,
        index: property
    };
}

const TRAILING_MACRO_SEMICOLON_PATTERN = new RegExp(
    String.raw`;(?=[^\S\r\n]*(?:(?:\/\/[^\r\n]*|\/\*[\s\S]*?\*\/)[^\S\r\n]*)*(?:\r?\n|$))`
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
const FEATHER_COMMENT_OUT_SYMBOL = Symbol.for(
    "prettier.gml.feather.commentOut"
);
const FEATHER_COMMENT_TEXT_SYMBOL = Symbol.for(
    "prettier.gml.feather.commentText"
);
const VERTEX_BEGIN_TEMPLATE_CACHE = new WeakMap();
const FILE_FIND_BLOCK_CALL_TARGETS = new Set(["file_find_next"]);
const FILE_FIND_CLOSE_FUNCTION_NAME = "file_find_close";
const READ_ONLY_BUILT_IN_VARIABLES = new Set(["working_directory"]);
const FILE_ATTRIBUTE_IDENTIFIER_PATTERN = /^fa_[A-Za-z0-9_]+$/;
const STRING_LENGTH_CALL_BLOCKLIST = new Set([
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

export const ROOM_NAVIGATION_DIRECTION = Object.freeze({
    NEXT: "next",
    PREVIOUS: "previous"
});

/**
 * @typedef {typeof ROOM_NAVIGATION_DIRECTION[keyof typeof ROOM_NAVIGATION_DIRECTION]} RoomNavigationDirection
 */

const ROOM_NAVIGATION_DIRECTION_VALUES = new Set(
    Object.values(ROOM_NAVIGATION_DIRECTION)
);
const ROOM_NAVIGATION_DIRECTION_LABELS = Array.from(
    ROOM_NAVIGATION_DIRECTION_VALUES
).join(", ");

const ROOM_NAVIGATION_HELPERS = Object.freeze({
    [ROOM_NAVIGATION_DIRECTION.NEXT]: Object.freeze({
        binary: "room_next",
        goto: "room_goto_next"
    }),
    [ROOM_NAVIGATION_DIRECTION.PREVIOUS]: Object.freeze({
        binary: "room_previous",
        goto: "room_goto_previous"
    })
});

function normalizeRoomNavigationDirection(direction) {
    if (typeof direction !== "string") {
        throw new TypeError(
            "Room navigation direction must be provided as a string."
        );
    }

    if (!ROOM_NAVIGATION_DIRECTION_VALUES.has(direction)) {
        throw new RangeError(
            `Unsupported room navigation direction: ${direction}. Expected one of: ${ROOM_NAVIGATION_DIRECTION_LABELS}.`
        );
    }

    return direction;
}

function getManualFeatherFixRegistry(ast) {
    let registry = ast[MANUAL_FIX_TRACKING_KEY];

    if (isSetLike(registry)) {
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

function createCallExpressionTargetFixDetail(diagnostic, node) {
    if (!node) {
        return null;
    }

    return createFeatherFixDetail(diagnostic, {
        target: node.object?.name ?? null,
        range: {
            start: getNodeStartIndex(node),
            end: getNodeEndIndex(node)
        }
    });
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

export function getRoomNavigationHelpers(direction) {
    const normalizedDirection = normalizeRoomNavigationDirection(direction);
    return ROOM_NAVIGATION_HELPERS[normalizedDirection];
}
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
    if (!isNonEmptyString(sourceText)) {
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
        const trimmed = toTrimmedString(line);

        if (trimmed.length === 0) {
            return { line, context: pendingGM1100Context };
        }

        const booleanLiteralMatch = line.match(
            /^(\s*)(true|false)\s*(?:;\s*)?$/
        );

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
    const enumSanitizedResult =
        sanitizeEnumInitializerStrings(sanitizedSourceText);
    const enumSanitizedSourceText = enumSanitizedResult.sourceText;
    const enumIndexAdjustments = enumSanitizedResult.adjustments;
    const metadata = {};

    if (gm1100Metadata.length > 0) {
        metadata.GM1100 = gm1100Metadata;
    }

    if (gm1016Metadata.length > 0) {
        metadata.GM1016 = gm1016Metadata;
    }

    const hasMetadata = Object.keys(metadata).length > 0;
    const sourceChanged = enumSanitizedSourceText !== sourceText;
    const hasIndexAdjustments = isNonEmptyArray(enumIndexAdjustments);

    if (!hasMetadata && !sourceChanged) {
        return {
            sourceText,
            metadata: null,
            indexAdjustments: null
        };
    }

    return {
        sourceText: sourceChanged ? enumSanitizedSourceText : sourceText,
        metadata: hasMetadata ? metadata : null,
        indexAdjustments: hasIndexAdjustments ? enumIndexAdjustments : null
    };
}

function sanitizeEnumInitializerStrings(sourceText) {
    if (!isNonEmptyString(sourceText)) {
        return { sourceText, adjustments: null };
    }

    const enumPattern = /\benum\b/g;
    let lastIndex = 0;
    let match;
    let result = "";
    const adjustments = [];
    let totalRemoved = 0;

    while ((match = enumPattern.exec(sourceText)) !== null) {
        const openBraceIndex = findNextOpenBrace(
            sourceText,
            enumPattern.lastIndex
        );
        if (openBraceIndex === -1) {
            break;
        }

        const closeBraceIndex = findMatchingClosingBrace(
            sourceText,
            openBraceIndex
        );

        if (closeBraceIndex === -1) {
            break;
        }

        result += sourceText.slice(lastIndex, openBraceIndex + 1);

        const bodyStartIndex = openBraceIndex + 1;
        const body = sourceText.slice(bodyStartIndex, closeBraceIndex);
        const {
            sanitizedBody,
            adjustments: bodyAdjustments,
            removedCount: bodyRemoved
        } = sanitizeEnumBodyInitializerStrings(
            body,
            bodyStartIndex,
            totalRemoved
        );

        if (bodyAdjustments.length > 0) {
            adjustments.push(...bodyAdjustments);
            totalRemoved += bodyRemoved;
        }

        result += sanitizedBody;
        lastIndex = closeBraceIndex;
        enumPattern.lastIndex = closeBraceIndex;
    }

    if (lastIndex === 0) {
        return { sourceText, adjustments: null };
    }

    result += sourceText.slice(lastIndex);
    return {
        sourceText: result,
        adjustments: adjustments.length > 0 ? adjustments : null
    };
}

function sanitizeEnumBodyInitializerStrings(
    body,
    bodyStartIndex,
    totalRemoved
) {
    if (!isNonEmptyString(body)) {
        return { sanitizedBody: body, adjustments: [], removedCount: 0 };
    }

    let bodyRemoved = 0;
    const adjustments = [];

    const sanitizedBody = body.replaceAll(
        /(\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*)(["'])([^"']*)(\2)/g,
        (fullMatch, prefix, _quote, rawValue, _closingQuote, offset) => {
            const normalizedValue = rawValue.trim();
            if (!isIntegerLiteralString(normalizedValue)) {
                return fullMatch;
            }

            const replacement = `${prefix}${normalizedValue}`;
            const removedCount = fullMatch.length - replacement.length;

            if (removedCount > 0) {
                const sanitizedIndex =
                    bodyStartIndex +
                    offset +
                    replacement.length -
                    (totalRemoved + bodyRemoved);

                adjustments.push({
                    index: sanitizedIndex,
                    delta: removedCount
                });
                bodyRemoved += removedCount;
            }

            return replacement;
        }
    );

    return { sanitizedBody, adjustments, removedCount: bodyRemoved };
}

export function applyRemovedIndexAdjustments(target, adjustments) {
    const normalized = normalizeRemovalAdjustments(adjustments);
    if (normalized.length === 0) {
        return;
    }

    const stack = [target];
    const seen = new WeakSet();

    while (stack.length > 0) {
        const current = stack.pop();

        if (!current || typeof current !== "object" || seen.has(current)) {
            continue;
        }

        seen.add(current);

        if (Array.isArray(current)) {
            for (const value of current) {
                stack.push(value);
            }
            continue;
        }

        adjustLocationForRemoval(current, "start", normalized);
        adjustLocationForRemoval(current, "end", normalized);

        for (const value of Object.values(current)) {
            stack.push(value);
        }
    }
}

function normalizeRemovalAdjustments(adjustments) {
    if (!Array.isArray(adjustments)) {
        return [];
    }

    return adjustments
        .filter((entry) => {
            if (!entry || typeof entry !== "object") {
                return false;
            }

            const { index, delta } = entry;
            return (
                Number.isFinite(index) && Number.isFinite(delta) && delta > 0
            );
        })
        .sort((a, b) => a.index - b.index);
}

function adjustLocationForRemoval(node, property, adjustments) {
    if (!Object.hasOwn(node, property)) {
        return;
    }

    const location = node[property];

    if (typeof location === "number") {
        node[property] = mapIndexForRemoval(location, adjustments);
        return;
    }

    if (
        location &&
        typeof location === "object" &&
        typeof location.index === "number"
    ) {
        location.index = mapIndexForRemoval(location.index, adjustments);
    }
}

function mapIndexForRemoval(index, adjustments) {
    if (!Number.isFinite(index)) {
        return index;
    }

    let adjusted = index;

    for (const { index: cutoff, delta } of adjustments) {
        if (index >= cutoff) {
            adjusted += delta;
        } else {
            break;
        }
    }

    return adjusted;
}

function findNextOpenBrace(sourceText, startIndex) {
    const length = sourceText.length;

    for (let index = startIndex; index < length; index += 1) {
        const char = sourceText[index];

        if (char === '"' || char === "'") {
            index = skipStringLiteral(sourceText, index);
            continue;
        }

        if (
            char === "@" &&
            index + 1 < length &&
            (sourceText[index + 1] === '"' || sourceText[index + 1] === "'")
        ) {
            index = skipStringLiteral(sourceText, index + 1);
            continue;
        }

        if (char === "/" && index + 1 < length) {
            const nextChar = sourceText[index + 1];
            if (nextChar === "/") {
                index = skipLineComment(sourceText, index + 2);
                continue;
            }
            if (nextChar === "*") {
                index = skipBlockComment(sourceText, index + 2);
                continue;
            }
        }

        if (char === "{") {
            return index;
        }
    }

    return -1;
}

function findMatchingClosingBrace(sourceText, openBraceIndex) {
    const length = sourceText.length;
    let depth = 0;

    for (let index = openBraceIndex; index < length; index += 1) {
        const char = sourceText[index];

        if (char === '"' || char === "'") {
            index = skipStringLiteral(sourceText, index);
            continue;
        }

        if (
            char === "@" &&
            index + 1 < length &&
            (sourceText[index + 1] === '"' || sourceText[index + 1] === "'")
        ) {
            index = skipStringLiteral(sourceText, index + 1);
            continue;
        }

        if (char === "/" && index + 1 < length) {
            const nextChar = sourceText[index + 1];
            if (nextChar === "/") {
                index = skipLineComment(sourceText, index + 2);
                continue;
            }
            if (nextChar === "*") {
                index = skipBlockComment(sourceText, index + 2);
                continue;
            }
        }

        if (char === "{") {
            depth += 1;
            continue;
        }

        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }

    return -1;
}

function skipLineComment(sourceText, startIndex) {
    const length = sourceText.length;

    for (let index = startIndex; index < length; index += 1) {
        const char = sourceText[index];
        if (char === "\n" || char === "\r") {
            return index - 1;
        }
    }

    return length - 1;
}

function skipBlockComment(sourceText, startIndex) {
    const length = sourceText.length;

    for (let index = startIndex; index < length - 1; index += 1) {
        if (sourceText[index] === "*" && sourceText[index + 1] === "/") {
            return index + 1;
        }
    }

    return length - 1;
}

function skipStringLiteral(sourceText, startIndex) {
    const length = sourceText.length;
    const quote = sourceText[startIndex];
    let index = startIndex + 1;

    while (index < length) {
        const char = sourceText[index];
        if (char === "\\") {
            index += 2;
            continue;
        }

        if (char === quote) {
            return index;
        }

        index += 1;
    }

    return length - 1;
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
    // Feather diagnostics are harvested independently of the formatter bundle,
    // so the plugin frequently encounters rule IDs before their fixer
    // implementations land. Returning an empty fixer keeps the pipeline
    // tolerant of that skew: downstream call sites treat "no edits" as "leave
    // the AST untouched" while still surfacing diagnostic metadata. That
    // contract matters because the orchestrator in applyFeatherFixes blindly
    // concatenates the arrays returned by every fixer; providing [] keeps the
    // type signature intact and avoids signalling "fixer missing" as a fatal
    // error. When we experimented with throwing here the formatter would stop
    // mid-run or, worse, fall back to speculative edits that reorder nodes
    // without the guard rails laid out in docs/feather-data-plan.md. Until the
    // corresponding fixer implementation ships we deliberately fall back to this
    // inert function so diagnostics reach the caller while the AST remains
    // untouched.
    return () => [];
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

function hasFeatherDiagnosticContext(ast, diagnostic) {
    if (!diagnostic) {
        return false;
    }

    if (!ast) {
        return false;
    }

    if (typeof ast !== "object") {
        return false;
    }

    return true;
}

function hasFeatherSourceTextContext(
    ast,
    diagnostic,
    sourceText,
    { allowEmpty = false } = {}
) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return false;
    }

    if (typeof sourceText !== "string") {
        return false;
    }

    if (!allowEmpty && sourceText.length === 0) {
        return false;
    }

    return true;
}

// Lightweight placeholder for splitGlobalVarInlineInitializers.
// The full implementation lives in the plugin; the parser-side transform
// will call a parser-local implementation when available. For now return
// an empty array when the diagnostic context is invalid or when no parser
// implementation exists to avoid runtime ReferenceErrors during tests.
function splitGlobalVarInlineInitializers({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    // No-op placeholder: the real fixer lives in the plugin and will be
    // ported into the parser in follow-up work. Returning [] indicates no
    // automatic edits were applied for this diagnostic.
    return [];
}

function removeDuplicateEnumMembers({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            visitChildNodes(node, visit);
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

        forEachNodeChild(node, (value) => {
            visit(value);
        });
    };

    visit(ast);

    return fixes;
}

function sanitizeEnumAssignments({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
        return [];
    }

    const fixes = [];

    const visit = (node) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            visitChildNodes(node, visit);
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

        visitChildNodes(node, visit);
    };

    visit(ast);

    return fixes;
}

function sanitizeEnumMember(node, diagnostic) {
    if (!node || typeof node !== "object" || !diagnostic) {
        return null;
    }

    const initializer = node.initializer;
    if (!initializer || typeof initializer !== "object") {
        return null;
    }

    const value = initializer.value;
    const numeric = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numeric)) {
        return null;
    }

    // Create a simple fix record that the caller will interpret and apply.
    return {
        type: "enum-assignment",
        member: node,
        diagnostic
    };
}

const NODE_REMOVED = Symbol("flaggedInvalidAssignmentRemovedNode");

function flagInvalidAssignmentTargets({ ast, diagnostic, sourceText }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
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

function removeBreakStatementsWithoutEnclosingLoops({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
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
            if (!isArrayIndex(parent, property)) {
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

        forEachNodeChild(node, (value, key) => {
            if (Array.isArray(value)) {
                visitArray(value, node, key, nextBreakableDepth);
                return;
            }

            visit(value, node, key, nextBreakableDepth, node);
        });

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
        case "WithStatement": {
            return true;
        }
        default: {
            return false;
        }
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

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1002") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = splitGlobalVarInlineInitializers({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1003") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = sanitizeEnumAssignments({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
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

                    return resolveAutomaticFixes(fixes, { ast, diagnostic });
                };
            });
            continue;
        }

        if (diagnosticId === "GM1004") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = removeDuplicateEnumMembers({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
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

                        return resolveAutomaticFixes(fixes, {
                            ast,
                            diagnostic
                        });
                    }
            );
            continue;
        }

        if (diagnosticId === "GM2000") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureBlendModeIsReset({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
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

                        return resolveAutomaticFixes(fixes, {
                            ast,
                            diagnostic
                        });
                    }
            );
            continue;
        }

        if (diagnosticId === "GM2004") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = convertUnusedIndexForLoops({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
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

                        return resolveAutomaticFixes(fixes, {
                            ast,
                            diagnostic
                        });
                    }
            );
            continue;
        }

        if (diagnosticId === "GM2008") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = closeOpenVertexBatches({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1008") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = convertReadOnlyBuiltInAssignments({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1010") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureNumericOperationsUseRealLiteralCoercion({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1013") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = resolveWithOtherVariableReferences({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2012") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureVertexFormatsClosedBeforeStartingNewOnes({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2040") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = removeInvalidEventInheritedCalls({
                    // TODO: Once the identifier-case project index can expose event
                    // ancestry we should query it here instead of trusting the
                    // diagnostic payload alone. GM2040 only fires when
                    // `event_inherited()` is orphaned, but without project-scope
                    // metadata the fixer cannot distinguish a legitimate override
                    // from a missing parent event. Integrating with the scoping
                    // pipeline outlined in `docs/legacy-identifier-case-plan.md#archived-project-index-roadmap`
                    // will let us re-evaluate inherited events during formatting and
                    // avoid deleting valid calls when Feather diagnostics are
                    // unavailable.
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2030") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureDrawPrimitiveEndCallsAreBalanced({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2015") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureVertexFormatDefinitionsAreClosed({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2028") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensurePrimitiveBeginPrecedesEnd({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2025") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = annotateMissingUserEvents({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1063") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = harmonizeTexturePointerTernaries({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2005") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureSurfaceTargetResetForGM2005({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM1064") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = removeRedeclaredGlobalFunctions({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2011") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureVertexBuffersAreClosed({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2009") {
            registerFeatherFixer(
                registry,
                diagnosticId,
                () =>
                    ({ ast, options }) => {
                        const fixes = ensureVertexBeginPrecedesEnd({
                            ast,
                            diagnostic,
                            options
                        });

                        return resolveAutomaticFixes(fixes, {
                            ast,
                            diagnostic
                        });
                    }
            );
            continue;
        }

        if (diagnosticId === "GM2043") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureLocalVariablesAreDeclaredBeforeUse({
                    ast,
                    diagnostic
                });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2033") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = removeDanglingFileFindCalls({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2050") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureFogIsReset({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
            });
            continue;
        }

        if (diagnosticId === "GM2035") {
            registerFeatherFixer(registry, diagnosticId, () => ({ ast }) => {
                const fixes = ensureGpuStateIsPopped({ ast, diagnostic });

                return resolveAutomaticFixes(fixes, { ast, diagnostic });
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

                        return resolveAutomaticFixes(fixes, {
                            ast,
                            diagnostic
                        });
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

        return resolveAutomaticFixes(fixes, { ast: context.ast, diagnostic });
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

function resolveAutomaticFixes(fixes, context) {
    if (isNonEmptyArray(fixes)) {
        return fixes;
    }

    return registerManualFeatherFix(context);
}

function resolveWithOtherVariableReferences({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
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

    if (!isArrayIndex(parent, property)) {
        return;
    }

    const declarations = asArray(declaration?.declarations);

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
    const hasCandidates = isNonEmptyArray(candidates);

    const withBodies = asArray(context?.withBodies);
    const identifierStart = getNodeStartIndex(identifier);
    const identifierEnd = getNodeEndIndex(identifier);

    let matchedContext = null;
    let sawUnpromotableCandidate = false;

    if (hasCandidates) {
        for (let index = candidates.length - 1; index >= 0; index -= 1) {
            const candidate = candidates[index];

            if (!candidate || candidate.invalid) {
                continue;
            }

            if (!isPromotableWithOtherCandidate(candidate)) {
                sawUnpromotableCandidate = true;
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
    }

    if (!matchedContext) {
        if (hasCandidates || sawUnpromotableCandidate) {
            return;
        }

        replaceIdentifierWithOtherMember({
            identifier,
            parent,
            property,
            arrayOwner,
            arrayProperty,
            diagnostic,
            fixes,
            identifierStart,
            identifierEnd
        });
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

    replaceIdentifierWithOtherMember({
        identifier,
        parent,
        property,
        arrayOwner,
        arrayProperty,
        diagnostic,
        fixes,
        identifierStart,
        identifierEnd
    });
}

function replaceIdentifierWithOtherMember({
    identifier,
    parent,
    property,
    arrayOwner,
    arrayProperty,
    diagnostic,
    fixes,
    identifierStart,
    identifierEnd
}) {
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
        target: identifier?.name ?? null,
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

function isPromotableWithOtherCandidate(candidate) {
    if (!candidate) {
        return false;
    }

    const owner = candidate.owner;

    if (!owner || typeof owner !== "object") {
        return true;
    }

    return owner.type === "Program";
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
        (parent.type === "FunctionDeclaration" ||
            parent.type === "FunctionExpression") &&
        (property === "name" || property === "id")
    ) {
        return false;
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

    assignClonedLocation(memberExpression, identifier);

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

// NOTE: The file is large and contains many helper functions and fixers. We
// copied the canonical implementation from the plugin into the parser
// transform so the parser no longer imports from the plugin package. The
// helpers this file references are expected to exist under the parser's
// `src/parser/src/shared` and `src/parser/src/comments` paths (they mirror the
// plugin layout). If additional missing helpers are reported when running the
// tests, we'll copy those into `src/parser/src/shared` next.

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
    } catch {
        return null;
    }
}

function convertReadOnlyBuiltInAssignments({ ast, diagnostic }) {
    if (!hasFeatherDiagnosticContext(ast, diagnostic)) {
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

        forEachNodeChild(node, (value, key) => {
            visit(value, node, key);
        });
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
    if (!hasArrayParentWithNumericIndex(parent, property)) {
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

        forEachNodeChild(node, (value, key) => {
            stack.push({
                node: value,
                parent: node,
                property: key,
                ancestors: nextAncestors
            });
        });
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
    const baseName = getNonEmptyString(originalName) ?? "value";
    const sanitized = baseName.replaceAll(/[^a-zA-Z0-9_]/g, "_");
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

    walkAstNodes(root, (node) => {
        const identifierDetails = getIdentifierDetails(node);
        if (identifierDetails) {
            names.add(identifierDetails.name);
        }
    });

    return names;
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

    const clone = structuredClone(node);
    removeLocationMetadata(clone);
    return clone;
}

function removeLocationMetadata(value) {
    if (!value || typeof value !== "object") {
        return;
    }

    if (Array.isArray(value)) {
        for (const entry of value) {
            removeLocationMetadata(entry);
        }
        return;
    }

    delete value.start;
    delete value.end;

    for (const nestedValue of Object.values(value)) {
        removeLocationMetadata(nestedValue);
    }
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

    const fixDetail = createCallExpressionTargetFixDetail(diagnostic, node);

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
