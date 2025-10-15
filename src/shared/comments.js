/**
 * @typedef {object} CommentLineNode
 * @property {"CommentLine"} type
 * @property {string} value
 * @property {number} [start]
 * @property {number} [end]
 */

/**
 * @typedef {object} CommentBlockNode
 * @property {"CommentBlock"} type
 * @property {string} value
 * @property {number} [start]
 * @property {number} [end]
 */

import { asArray } from "./array-utils.js";
import { hasOwn, isObjectLike } from "./object-utils.js";

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

/**
 * Determines whether the provided AST node carries at least one comment.
 *
 * Nodes in parser output sometimes attach bookkeeping values or plain strings
 * to their `comments` array. The scan therefore double-checks every entry with
 * {@link isCommentNode} instead of assuming the array contents are valid. This
 * defensive guard prevents downstream formatters from tripping over stray
 * metadata while still treating an existing, but empty, `comments` array as
 * "no comments".
 *
 * @param {unknown} node Candidate AST node to inspect. Non-object inputs are
 *                       treated as comment-free.
 * @returns {boolean} `true` when the node owns at least one well-formed
 *                     comment node.
 */
export function hasComment(node) {
    return getCommentArray(node).some(isCommentNode);
}

/**
 * Returns the raw `comments` collection for a node while gracefully handling
 * parser variations where the property might be missing or hold a non-array
 * value. The returned array is the original reference so that callers can
 * observe mutations performed by upstream tooling.
 *
 * @param {unknown} owner Candidate AST node whose comments should be fetched.
 * @returns {Array<CommentBlockNode | CommentLineNode | unknown>} Either the
 *          node's comment array or a fresh empty array when no valid
 *          collection exists.
 */
export function getCommentArray(owner) {
    if (!isObjectLike(owner)) {
        return [];
    }

    const { comments } = owner;
    return asArray(comments);
}

/**
 * Performs a depth-first traversal to find every distinct comment node in the
 * provided AST fragment. Objects are tracked in a WeakSet so that the
 * traversal can safely follow parent/child references without re-visiting
 * nodes; this prevents infinite loops on cyclic structures that sometimes
 * appear in parser output while still returning each comment exactly once.
 *
 * @param {unknown} root Root node (or array of nodes) to inspect. Non-object
 *                       values are ignored.
 * @returns {Array<CommentBlockNode | CommentLineNode>}
 *          Flat list of comment nodes discovered anywhere within the supplied root.
 */
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
            // Iterate arrays via indices to avoid creating iterator wrappers
            // while still respecting sparse arrays produced by upstream tools.
            for (let index = 0; index < current.length; index += 1) {
                const child = current[index];
                if (isObjectLike(child)) {
                    stack.push(child);
                }
            }
            continue;
        }

        for (const key in current) {
            if (!hasOwn(current, key)) {
                continue;
            }

            // A guarded for-in loop mirrors Object.values without allocating a
            // throwaway array on every object visit, which keeps the traversal
            // hot path allocation-free.
            const child = current[key];
            if (isObjectLike(child)) {
                stack.push(child);
            }
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

    return /^\/\s*@/.test(comment.value);
}
