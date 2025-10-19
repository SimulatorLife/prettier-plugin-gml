import {
    getCommentArray,
    isDocCommentLine
} from "./comment-boundary.js";
import { getNodeStartIndex } from "../../../shared/ast-locations.js";
import { isNode } from "../../../shared/ast-node-helpers.js";
import {
    isNonEmptyTrimmedString,
    toNormalizedLowerCaseString
} from "../../../shared/string-utils.js";

const DOC_COMMENT_TARGET_TYPES = new Set([
    "FunctionDeclaration",
    "FunctionExpression",
    "LambdaExpression",
    "ConstructorDeclaration",
    "MethodDeclaration",
    "StructFunctionDeclaration",
    "StructDeclaration"
]);

const DOC_COMMENT_MANAGERS = new WeakMap();
const DOC_COMMENT_SOURCE_TEXT_SETTER = Symbol("docCommentSourceTextSetter");

const NOOP_DOC_COMMENT_MANAGER = Object.freeze({
    applyUpdates() {},
    forEach() {},
    getComments() {
        return [];
    },
    extractDescription() {
        return null;
    },
    hasDocComment() {
        return false;
    },
    getDocumentedParamNames() {
        return new Set();
    }
});

export function prepareDocCommentEnvironment(ast, options = {}) {
    if (!isNode(ast)) {
        return NOOP_DOC_COMMENT_MANAGER;
    }

    let manager = DOC_COMMENT_MANAGERS.get(ast);

    if (manager) {
        const sourceText = options?.sourceText;
        if (typeof sourceText === "string") {
            const setter = manager[DOC_COMMENT_SOURCE_TEXT_SETTER];
            if (typeof setter === "function") {
                setter(sourceText);
            }
        }

        return manager;
    }

    manager = createDocCommentManager(ast, options);
    DOC_COMMENT_MANAGERS.set(ast, manager);
    return manager;
}

export function getDocCommentManager(ast) {
    return prepareDocCommentEnvironment(ast);
}

function createDocCommentManager(ast, options = {}) {
    normalizeDocCommentWhitespace(ast);

    const commentGroups = mapDocCommentsToFunctions(ast);
    let storedSourceText =
        typeof options?.sourceText === "string" ? options.sourceText : null;

    return {
        applyUpdates(docUpdates) {
            applyDocCommentUpdates(commentGroups, docUpdates);
        },
        forEach(callback) {
            if (typeof callback !== "function") {
                return;
            }

            for (const [fn, comments] of commentGroups.entries()) {
                callback(fn, comments ?? []);
            }
        },
        getComments(functionNode) {
            const comments = commentGroups.get(functionNode);
            return Array.isArray(comments) ? comments : [];
        },
        extractDescription(functionNode) {
            return extractFunctionDescription(commentGroups, functionNode);
        },
        hasDocComment(functionNode) {
            const comments = commentGroups.get(functionNode);
            return Array.isArray(comments) && comments.length > 0;
        },
        getDocumentedParamNames(functionNode, overrideSourceText) {
            const comments = commentGroups.get(functionNode);
            const sourceText =
                typeof overrideSourceText === "string"
                    ? overrideSourceText
                    : storedSourceText;
            return extractDocumentedParamNames(functionNode, comments, sourceText);
        },
        [DOC_COMMENT_SOURCE_TEXT_SETTER](value) {
            if (typeof value === "string") {
                storedSourceText = value;
            }
        }
    };
}

function normalizeDocCommentWhitespace(ast) {
    const comments = getCommentArray(ast);

    if (comments.length === 0) {
        return;
    }

    for (const comment of comments) {
        if (
            comment?.type === "CommentLine" &&
            typeof comment.leadingWS === "string" &&
            /(?:\r\n|\r|\n|\u2028|\u2029)\s*(?:\r\n|\r|\n|\u2028|\u2029)/.test(
                comment.leadingWS
            )
        ) {
            comment.leadingWS = "\n";
        }
    }
}

function mapDocCommentsToFunctions(ast) {
    const functions = collectFunctionNodes(ast).sort((a, b) => {
        const aStart = getNodeStartIndex(a) ?? 0;
        const bStart = getNodeStartIndex(b) ?? 0;
        return aStart - bStart;
    });

    const groups = new Map();
    for (const fn of functions) {
        groups.set(fn, []);
    }

    const astComments = getCommentArray(ast);

    if (astComments.length === 0 || functions.length === 0) {
        return groups;
    }

    let functionIndex = 0;
    for (const comment of astComments) {
        if (!isDocCommentLine(comment)) {
            continue;
        }

        const commentIndex = comment?.start?.index;
        if (typeof commentIndex !== "number") {
            continue;
        }

        while (functionIndex < functions.length) {
            const targetStart = getNodeStartIndex(functions[functionIndex]);
            if (typeof targetStart !== "number" || targetStart > commentIndex) {
                break;
            }
            functionIndex += 1;
        }

        if (functionIndex >= functions.length) {
            break;
        }

        const targetFunction = functions[functionIndex];
        const bucket = groups.get(targetFunction);
        if (bucket) {
            bucket.push(comment);
        }
    }

    return groups;
}

function collectFunctionNodes(ast) {
    const functions = [];

    function traverse(node) {
        if (!isNode(node)) {
            return;
        }

        if (DOC_COMMENT_TARGET_TYPES.has(node.type)) {
            functions.push(node);
        }

        for (const [key, value] of Object.entries(node)) {
            if (key === "start" || key === "end" || key === "comments") {
                continue;
            }

            if (Array.isArray(value)) {
                for (const child of value) {
                    traverse(child);
                }
            } else if (isNode(value)) {
                traverse(value);
            }
        }
    }

    traverse(ast);
    return functions;
}

function applyDocCommentUpdates(commentGroups, docUpdates) {
    if (!docUpdates || docUpdates.size === 0) {
        return;
    }

    for (const [fn, update] of docUpdates.entries()) {
        if (!update || !isNonEmptyTrimmedString(update.expression)) {
            continue;
        }

        if (update.hasDocComment) {
            continue;
        }

        const comments = commentGroups.get(fn);
        if (!comments || comments.length === 0) {
            continue;
        }

        const descriptionComment = comments.find(
            (comment) =>
                typeof comment?.value === "string" &&
                /@description\b/i.test(comment.value)
        );

        if (!descriptionComment) {
            continue;
        }

        let updatedDescription = buildUpdatedDescription(
            update.description,
            update.expression
        );

        if (!isNonEmptyTrimmedString(updatedDescription)) {
            continue;
        }

        const originalDescription =
            typeof update.description === "string"
                ? update.description.trim()
                : "";

        if (
            originalDescription.endsWith(".") &&
            !/[.!?]$/.test(updatedDescription)
        ) {
            updatedDescription = `${updatedDescription}.`;
        }

        const existingDescription = extractDescriptionContent(
            descriptionComment.value
        );

        if (existingDescription === updatedDescription) {
            continue;
        }

        const prefixMatch = descriptionComment.value.match(
            /^(\s*\/\s*@description\s*)/i
        );
        const prefix = prefixMatch ? prefixMatch[1] : "/ @description ";

        descriptionComment.value = `${prefix}${updatedDescription}`;
    }
}

function extractFunctionDescription(commentGroups, functionNode) {
    const comments = commentGroups.get(functionNode);
    if (!comments) {
        return null;
    }

    for (const comment of comments) {
        if (
            typeof comment.value === "string" &&
            comment.value.includes("@description")
        ) {
            return extractDescriptionContent(comment.value);
        }
    }

    return null;
}

function extractDescriptionContent(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.replace(/^\s*\/\s*@description\s*/i, "").trim();
}

function buildUpdatedDescription(existing, expression) {
    if (!expression) {
        return existing ?? "";
    }

    const normalizedExpression = expression.trim();

    if (!isNonEmptyTrimmedString(existing)) {
        return `Simplified: ${normalizedExpression}`;
    }

    const trimmed = existing.trim();
    const lowered = trimmed.toLowerCase();

    if (lowered.includes("original multi-branch")) {
        return existing ?? "";
    }

    if (lowered.includes("original") || lowered.includes("multi-clause")) {
        return `Simplified: ${normalizedExpression}`;
    }

    if (lowered.includes("simplified")) {
        const colonIndex = trimmed.indexOf(":");
        if (colonIndex !== -1) {
            const prefix = trimmed.slice(0, colonIndex + 1);
            return `${prefix} ${normalizedExpression}`;
        }
        return `Simplified: ${normalizedExpression}`;
    }

    if (lowered.includes("guard extraction")) {
        return existing ?? "";
    }

    if (trimmed.includes("==")) {
        const equalityIndex = trimmed.indexOf("==");
        const prefix = trimmed.slice(0, equalityIndex + 2).trimEnd();
        return `${prefix} ${normalizedExpression}`;
    }

    const mentionsReturn = /\breturn\b/.test(lowered);
    const mentionsBranching =
        /\bif\b/.test(lowered) || /\belse\b/.test(lowered);

    if (mentionsReturn && mentionsBranching) {
        return existing ?? "";
    }

    const withoutPeriod = trimmed.replace(/\.?\s*$/, "");
    const needsSemicolon = mentionsReturn;
    const separator = needsSemicolon ? "; ==" : " ==";
    return `${withoutPeriod}${separator} ${normalizedExpression}`;
}

export function extractDocumentedParamNames(functionNode, docComments, sourceText) {
    const documentedNames = new Set();
    if (!functionNode || typeof functionNode !== "object") {
        return documentedNames;
    }

    if (!Array.isArray(docComments) || docComments.length === 0) {
        return documentedNames;
    }

    const functionStart = getNodeStartIndex(functionNode);

    if (typeof functionStart !== "number") {
        return documentedNames;
    }

    const paramComments = docComments
        .filter(
            (comment) =>
                comment &&
                comment.type === "CommentLine" &&
                typeof comment.value === "string" &&
                /@param\b/i.test(comment.value)
        )
        .sort((left, right) => {
            const leftStart = getCommentStartIndex(left);
            const rightStart = getCommentStartIndex(right);

            if (leftStart == null && rightStart == null) {
                return 0;
            }

            if (leftStart == null) {
                return -1;
            }

            if (rightStart == null) {
                return 1;
            }

            return leftStart - rightStart;
        });

    if (paramComments.length === 0) {
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

export function getCommentEndIndex(comment) {
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

export function isWhitespaceBetween(startIndex, endIndex, sourceText) {
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

export function normalizeDocParamNameForComparison(name) {
    if (typeof name !== "string") {
        return "";
    }

    return toNormalizedLowerCaseString(name);
}
