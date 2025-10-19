import { getCommentArray, isDocCommentLine } from "./comment-boundary.js";
import { getNodeStartIndex } from "../../../shared/ast-locations.js";
import { isNode } from "../../../shared/ast-node-helpers.js";
import { isNonEmptyTrimmedString } from "../../../shared/string-utils.js";

export function createDocCommentManager(ast) {
    normalizeDocCommentWhitespace(ast);

    const commentGroups = mapDocCommentsToFunctions(ast);

    return {
        applyUpdates(docUpdates) {
            applyDocCommentUpdates(commentGroups, docUpdates);
        },
        extractDescription(functionNode) {
            return extractFunctionDescription(commentGroups, functionNode);
        },
        hasDocComment(functionNode) {
            const comments = commentGroups.get(functionNode);
            return Array.isArray(comments) && comments.length > 0;
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

        if (node.type === "FunctionDeclaration") {
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
