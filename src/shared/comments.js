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
