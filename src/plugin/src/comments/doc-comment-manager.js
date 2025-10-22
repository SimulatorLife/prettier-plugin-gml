import { getCommentArray, isDocCommentLine } from "./comment-boundary.js";
import { getNodeStartIndex } from "../../../shared/ast-locations.js";
import { isNode } from "../../../shared/ast-node-helpers.js";
import { isNonEmptyTrimmedString } from "../../../shared/string-utils.js";
import {
    toMutableArray,
    isNonEmptyArray
} from "../../../shared/array-utils.js";

/**
 * The legacy doc comment "manager" facade bundled traversal helpers with
 * mutation operations. That wide surface forced transforms that only needed
 * read-only inspection to depend on update capabilities as well. Introducing
 * narrow inspection and update views lets collaborators wire only the
 * behaviours they actually require.
 */

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
const DOC_COMMENT_INSPECTION_SERVICES = new WeakMap();
const DOC_COMMENT_UPDATE_SERVICES = new WeakMap();

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

export function getDocCommentManager(ast) {
    return prepareDocCommentEnvironment(ast);
}

/**
 * @typedef {object} DocCommentInspectionService
 * @property {(callback: (node: object, comments: Array<object>) => void) => void} forEach
 * @property {(functionNode: object) => Array<object>} getComments
 * @property {(functionNode: object) => string | null} extractDescription
 * @property {(functionNode: object) => boolean} hasDocComment
 */

/**
 * @typedef {object} DocCommentUpdateService
 * @property {(updates: Map<object, {
 *   description?: string,
 *   expression?: string,
 *   hasDocComment?: boolean
 * }>) => void} applyUpdates
 */

export function resolveDocCommentInspectionService(ast) {
    const manager = prepareDocCommentEnvironment(ast);
    let inspection = DOC_COMMENT_INSPECTION_SERVICES.get(manager);

    if (!inspection) {
        inspection = Object.freeze({
            forEach: manager.forEach.bind(manager),
            getComments: manager.getComments.bind(manager),
            extractDescription: manager.extractDescription.bind(manager),
            hasDocComment: manager.hasDocComment.bind(manager)
        });
        DOC_COMMENT_INSPECTION_SERVICES.set(manager, inspection);
    }

    return inspection;
}

export function resolveDocCommentUpdateService(ast) {
    const manager = prepareDocCommentEnvironment(ast);
    let updateService = DOC_COMMENT_UPDATE_SERVICES.get(manager);

    if (!updateService) {
        updateService = Object.freeze({
            applyUpdates: manager.applyUpdates.bind(manager)
        });
        DOC_COMMENT_UPDATE_SERVICES.set(manager, updateService);
    }

    return updateService;
}

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
            typeof comment.value === "string" &&
            comment.value.startsWith("/")
        ) {
            comment.value = comment.value.slice(1);
            comment._gmlDocComment = true;
        }

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

        const keys = Object.keys(node);

        for (const key of keys) {
            if (key === "start" || key === "end" || key === "comments") {
                continue;
            }

            const value = node[key];

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

/**
 * Applies doc comment edits emitted by call-site transforms.
 *
 * Each entry in {@link docUpdates} maps a function node to the raw doc comment
 * metadata discovered before the transform ran. The update payload retains the
 * pre-existing `description` text alongside a simplified `expression` so the
 * formatter can rewrite legacy annotations without trampling bespoke wording.
 *
 * The routine intentionally ignores:
 * - functions without doc comments (callers set {@link hasDocComment} to
 *   `true` when they injected one themselves), and
 * - updates whose computed description is blank after trimming.
 *
 * Those guardrails ensure we only touch original comments that still need to
 * be reconciled while leaving user-authored phrasing alone.
 *
 * @param {Map<object, Array<object>>} commentGroups Indexed doc comment lists
 *        produced by {@link mapDocCommentsToFunctions}.
 * @param {Map<object, {
 *   description?: string,
 *   expression?: string,
 *   hasDocComment?: boolean
 * }>} docUpdates Normalized updates keyed by function node.
 */
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
