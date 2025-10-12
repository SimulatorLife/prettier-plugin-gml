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

export function isCommentNode(node) {
    return (
        !!node &&
        typeof node === "object" &&
        (node.type === "CommentBlock" || node.type === "CommentLine")
    );
}

export function isLineComment(node) {
    return isCommentNode(node) && node.type === "CommentLine";
}

export function isBlockComment(node) {
    return isCommentNode(node) && node.type === "CommentBlock";
}

export function hasComment(node) {
    if (!node) {
        return false;
    }

    const comments = node.comments ?? null;
    if (!Array.isArray(comments) || comments.length === 0) {
        return false;
    }

    return comments.some(isCommentNode);
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
    if (!root || typeof root !== "object") {
        return [];
    }

    const results = [];
    const stack = [root];
    const visited = new WeakSet();

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || typeof current !== "object") {
            continue;
        }

        if (visited.has(current)) {
            continue;
        }

        visited.add(current);

        if (Array.isArray(current)) {
            for (const item of current) {
                stack.push(item);
            }
            continue;
        }

        if (isCommentNode(current)) {
            results.push(current);
        }

        for (const value of Object.values(current)) {
            if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }

    return results;
}

export function isDocCommentLine(comment) {
    return (
        isLineComment(comment) &&
        typeof comment.value === "string" &&
        comment.value.startsWith("/ @")
    );
}
