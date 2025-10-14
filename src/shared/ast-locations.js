// Shared helpers for working with AST node location metadata.
// These utilities centralize the logic for reading start/end positions
// so both the parser and printer can remain consistent without duplicating
// defensive checks around optional location shapes.

function getLocationIndex(node, key) {
    if (!node) {
        return undefined;
    }

    const location = node[key];
    if (typeof location === "number") {
        return location;
    }

    if (location && typeof location.index === "number") {
        return location.index;
    }

    return undefined;
}

function getStartIndex(node) {
    if (!node) {
        return undefined;
    }

    const isMemberAccess =
        (node.type === "MemberDotExpression" ||
            node.type === "MemberIndexExpression") &&
        node.object;

    if (isMemberAccess) {
        const objectStart = getStartIndex(node.object);
        if (typeof objectStart === "number") {
            return objectStart;
        }
    }

    return getLocationIndex(node, "start");
}

/**
 * Retrieves the starting offset for a node while converting missing locations
 * to `null` for easier downstream checks. Several parser nodes omit their
 * `start` marker entirely; callers can therefore treat a `null` response as a
 * definitive "position unknown" signal instead of re-validating the shape of
 * the location payload every time.
 *
 * @param {unknown} node AST node whose start position should be resolved.
 * @returns {number | null} Zero-based character index or `null` when no
 *                          concrete start position is available.
 */
function getNodeStartIndex(node) {
    const startIndex = getStartIndex(node);
    return typeof startIndex === "number" ? startIndex : null;
}

/**
 * Reports the character offset immediately following the node's last token.
 * When the `end` marker is missing, the helper falls back to the `start`
 * marker so that printers can still anchor single-token constructs (e.g.,
 * keywords without explicit ranges). The `null` return mirrors
 * {@link getNodeStartIndex} and indicates that no reliable boundary exists.
 *
 * @param {unknown} node AST node whose end boundary should be resolved.
 * @returns {number | null} One-past-the-end index or `null` when the location
 *                          data is unavailable.
 */
function getNodeEndIndex(node) {
    const endIndex = getLocationIndex(node, "end");
    if (typeof endIndex === "number") {
        return endIndex + 1;
    }

    const fallbackStart = getStartIndex(node);
    return typeof fallbackStart === "number" ? fallbackStart : null;
}

function isPlainObjectOrArray(value) {
    if (!value || typeof value !== "object") {
        return false;
    }

    if (Array.isArray(value)) {
        return true;
    }

    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function clonePlainContainer(container) {
    if (Array.isArray(container)) {
        return container.map((value) =>
            isPlainObjectOrArray(value) ? clonePlainContainer(value) : value
        );
    }

    return Object.fromEntries(
        Object.entries(container).map(([key, value]) => [
            key,
            isPlainObjectOrArray(value) ? clonePlainContainer(value) : value
        ])
    );
}

function cloneLocation(location) {
    if (location == null) {
        return undefined;
    }

    if (typeof location !== "object") {
        return location;
    }

    if (!isPlainObjectOrArray(location)) {
        return structuredClone(location);
    }

    return clonePlainContainer(location);
}

export { getNodeStartIndex, getNodeEndIndex, cloneLocation };
