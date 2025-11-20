import { enqueueObjectChildValues } from "./node-helpers.js";
import { isObjectLike } from "../utils/object.js";
/**
 * Frozen reusable empty array so repeated `getCommentArray` calls do not
 * allocate. Mirrors the shared array utilities while letting the hot comment
 * path avoid extra helper indirection.
 * @type {ReadonlyArray<never>}
 */
const EMPTY_COMMENT_ARRAY = Object.freeze([]);
/**
 * Determines whether a value is a well-formed comment node.
 *
 * @param {unknown} node
 * @returns {node is CommentBlockNode | CommentLineNode}
 */
export function isCommentNode(node) {
    return (
        isObjectLike(node) &&
        (node.type === "CommentBlock" || node.type === "CommentLine")
    );
}
function commentTypeMatches(comment, expectedType) {
    return isCommentNode(comment) && comment.type === expectedType;
}
export function isLineComment(node) {
    return commentTypeMatches(node, "CommentLine");
}
export function isBlockComment(node) {
    return commentTypeMatches(node, "CommentBlock");
}
export function hasComment(node) {
    return getCommentArray(node).some(isCommentNode);
}
export function getCommentArray(owner) {
    if (!isObjectLike(owner)) {
        return EMPTY_COMMENT_ARRAY;
    }
    const comments = owner.comments;
    return Array.isArray(comments) ? comments : EMPTY_COMMENT_ARRAY;
}
export function getCommentValue(comment, { trim = false } = {}) {
    if (typeof comment === "string") {
        return trim ? comment.trim() : comment;
    }
    if (!isObjectLike(comment) || typeof comment?.value !== "string") {
        return "";
    }
    const value = comment.value;
    return trim ? value.trim() : value;
}
export function collectCommentNodes(root) {
    if (!isObjectLike(root)) {
        return [];
    }
    const results = [];
    const stack = [root];
    const visited = new WeakSet();
    while (stack.length > 0) {
        const current = stack.pop();
        if (!isObjectLike(current) || visited.has(current)) {
            continue;
        }
        visited.add(current);
        if (isCommentNode(current)) {
            results.push(current);
        }
        if (Array.isArray(current)) {
            enqueueObjectChildValues(stack, current);
            continue;
        }
        const values = Object.values(current);
        for (const value of values) {
            enqueueObjectChildValues(stack, value);
        }
    }
    return results;
}
export function isDocCommentLine(comment) {
    if (
        !commentTypeMatches(comment, "CommentLine") ||
        typeof comment?.value !== "string"
    ) {
        return false;
    }
    return /^\s*(?:\/\s*)?@/.test(comment.value);
}
//# sourceMappingURL=comments.js.map
