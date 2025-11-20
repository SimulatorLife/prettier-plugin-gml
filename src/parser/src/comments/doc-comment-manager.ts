import { Core } from "@gml-modules/core";
import { getCommentArray, isDocCommentLine } from "./comment-boundary.js";

const {
    Utils: {
        toMutableArray,
        isNonEmptyArray,
        isNonEmptyTrimmedString
    },
    AST: { getNodeStartIndex, isFunctionLikeNode, isNode }
} = Core;

/**
 * The legacy doc comment "manager" facade bundled traversal helpers with
 * mutation operations. That wide surface forced transforms that only needed
 * read-only inspection to depend on update capabilities as well. Introducing
 * narrow inspection and update views lets collaborators wire only the
 * behaviours they actually require. The legacy lookup surface also conflated
 * retrieving full comment collections with simple presence checks, so this
 * module exposes discrete collection and presence services.
 */

const DOC_COMMENT_MANAGERS = new WeakMap();
const DOC_COMMENT_TRAVERSAL_SERVICES = new WeakMap();
const DOC_COMMENT_COLLECTION_SERVICES = new WeakMap();
const DOC_COMMENT_PRESENCE_SERVICES = new WeakMap();
const DOC_COMMENT_DESCRIPTION_SERVICES = new WeakMap();
const DOC_COMMENT_UPDATE_SERVICES = new WeakMap();

function resolveDocCommentService(ast, cache, createService) {
    const manager = prepareDocCommentEnvironment(ast);
    let service = cache.get(manager);

    if (!service) {
        service = Object.freeze(createService(manager));
        cache.set(manager, service);
    }

    return service;
}

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
    }
});

export function prepareDocCommentEnvironment(ast) {
    if (!isNode(ast)) {
        return NOOP_DOC_COMMENT_MANAGER;
    }

    let manager = DOC_COMMENT_MANAGERS.get(ast);

    if (manager) {
        return manager;
    }

    manager = createDocCommentManager(ast);
    DOC_COMMENT_MANAGERS.set(ast, manager);
    return manager;
}

function createBoundDocCommentServiceResolver(cache, methodName) {
    return function resolveBoundDocCommentService(ast) {
        return resolveDocCommentService(ast, cache, (manager) => {
            const method = manager?.[methodName];

            if (typeof method !== "function") {
                const fallback = NOOP_DOC_COMMENT_MANAGER[methodName];

                return typeof fallback === "function"
                    ? { [methodName]: fallback }
                    : {};
            }

            return { [methodName]: method.bind(manager) };
        });
    };
}

export const resolveDocCommentTraversalService =
    createBoundDocCommentServiceResolver(
        DOC_COMMENT_TRAVERSAL_SERVICES,
        "forEach"
    );

export const resolveDocCommentCollectionService =
    createBoundDocCommentServiceResolver(
        DOC_COMMENT_COLLECTION_SERVICES,
        "getComments"
    );

export const resolveDocCommentPresenceService =
    createBoundDocCommentServiceResolver(
        DOC_COMMENT_PRESENCE_SERVICES,
        "hasDocComment"
    );

export const resolveDocCommentDescriptionService =
    createBoundDocCommentServiceResolver(
        DOC_COMMENT_DESCRIPTION_SERVICES,
        "extractDescription"
    );

export const resolveDocCommentUpdateService =
    createBoundDocCommentServiceResolver(
        DOC_COMMENT_UPDATE_SERVICES,
        "applyUpdates"
    );

function createDocCommentManager(ast) {
    normalizeDocCommentWhitespace(ast);

    const commentGroups = mapDocCommentsToFunctions(ast);

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
            return toMutableArray(comments);
        },
        extractDescription(functionNode) {
            return extractFunctionDescription(commentGroups, functionNode);
        },
        hasDocComment(functionNode) {
            const comments = commentGroups.get(functionNode);
            return isNonEmptyArray(comments);
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

        if (isFunctionLikeNode(node)) {
            functions.push(node);
        }

        const keys = Object.keys(node);

        for (const key of keys) {
            if (key === "start" || key === "end" || key === "comments") {
                continue;
            }

            const value = node[key];

            if (Array.isArray(value)) {
                // Collect children from a shallow snapshot so visitors that
                // splice the original array (for example transforms pruning
                // siblings during traversal) do not cause us to skip entries.
                const snapshot = value.slice();

                for (const child of snapshot) {
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
        if (!isDocCommentUpdateEligible(update)) {
            continue;
        }

        const comments = resolveDocCommentCollection(commentGroups, fn);
        if (!comments) {
            continue;
        }

        const descriptionComment = findDescriptionComment(comments);
        if (!descriptionComment) {
            continue;
        }

        applyDescriptionCommentUpdate(descriptionComment, update);
    }
}

function isDocCommentUpdateEligible(update) {
    return (
        !!update &&
        !update.hasDocComment &&
        isNonEmptyTrimmedString(update.expression)
    );
}

function resolveDocCommentCollection(commentGroups, fn) {
    const comments = commentGroups.get(fn);
    if (!comments || comments.length === 0) {
        return null;
    }

    return comments;
}

function findDescriptionComment(comments) {
    return (
        comments.find(
            (comment) =>
                typeof comment?.value === "string" &&
                /@description\b/i.test(comment.value)
        ) ?? null
    );
}

function applyDescriptionCommentUpdate(descriptionComment, update) {
    let updatedDescription = buildUpdatedDescription(
        update.description,
        update.expression
    );

    if (!isNonEmptyTrimmedString(updatedDescription)) {
        return;
    }

    const originalDescription =
        typeof update.description === "string" ? update.description.trim() : "";

    if (
        originalDescription.endsWith(".") &&
        !/[.!?]$/.test(updatedDescription)
    ) {
        updatedDescription = `${updatedDescription}.`;
    }

    const existingDescription =
        typeof update.description === "string" ? update.description : null;
    const prefixMatch = descriptionComment.value.match(
        /^(\s*\/\s*@description\s*)/i
    );
    const prefix = prefixMatch ? prefixMatch[1] : "/ @description ";

    descriptionComment.value = `${prefix}${updatedDescription}`;
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
    const originalDescription = existing ?? "";

    if (!isNonEmptyTrimmedString(expression)) {
        return originalDescription;
    }

    const normalizedExpression = expression.trim();

    if (!isNonEmptyTrimmedString(existing)) {
        return `Simplified: ${normalizedExpression}`;
    }

    const trimmed = existing.trim();
    const lowered = trimmed.toLowerCase();
    const includes = (needle) => lowered.includes(needle);

    if (includes("original multi-branch") || includes("guard extraction")) {
        return originalDescription;
    }

    if (includes("original") || includes("multi-clause")) {
        return `Simplified: ${normalizedExpression}`;
    }

    if (includes("simplified")) {
        const colonIndex = trimmed.indexOf(":");
        return colonIndex === -1
            ? `Simplified: ${normalizedExpression}`
            : `${trimmed.slice(0, colonIndex + 1)} ${normalizedExpression}`;
    }

    const equalityIndex = trimmed.indexOf("==");
    if (equalityIndex !== -1) {
        const prefix = trimmed.slice(0, equalityIndex + 2).trimEnd();
        return `${prefix} ${normalizedExpression}`;
    }

    const mentionsReturn = /\breturn\b/.test(lowered);
    const mentionsBranching = /\b(?:if|else)\b/.test(lowered);

    if (mentionsReturn && mentionsBranching) {
        return originalDescription;
    }

    const withoutPeriod = trimmed.replace(/\.?\s*$/, "");
    const separator = mentionsReturn ? "; ==" : " ==";
    return `${withoutPeriod}${separator} ${normalizedExpression}`;
}
