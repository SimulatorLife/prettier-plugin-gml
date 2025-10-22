// Shared helpers for working with AST node location metadata.
// These utilities centralize the logic for reading start/end positions
// so both the parser and printer can remain consistent without duplicating
// defensive checks around optional location shapes.

function getLocationIndex(node, key) {
    if (!node) {
        return null;
    }

    const location = node[key];
    if (typeof location === "number") {
        return location;
    }

    if (location && typeof location.index === "number") {
        return location.index;
    }

    return null;
}

function getStartIndex(node) {
    if (!node) {
        return null;
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

function cloneLocation(location) {
    let cloned = location;

    if (location && typeof location === "object") {
        cloned = structuredClone(location);
    } else if (location === undefined || location === null) {
        cloned = undefined;
    }

    return cloned;
}

/**
 * Copy the `start`/`end` location metadata from {@link template} onto
 * {@link target} while cloning each boundary to avoid leaking shared
 * references between nodes. Callers frequently perform this defensive copy
 * when synthesizing AST nodes from existing ones, so centralizing the guard
 * clauses here keeps those transforms focused on their core logic.
 *
 * @template TTarget extends object
 * @param {TTarget | null | undefined} target Node whose location properties
 *   should be updated in-place.
 * @param {unknown} template Source node providing the optional `start` and
 *   `end` locations to clone.
 * @returns {TTarget | null | undefined} The original target reference for
 *   chaining.
 */
function assignClonedLocation(target, template) {
    if (!target || typeof target !== "object") {
        return target;
    }

    if (!template || typeof template !== "object") {
        return target;
    }

    const updates = {};

    if (Object.hasOwn(template, "start")) {
        updates.start = cloneLocation(template.start);
    }

    if (Object.hasOwn(template, "end")) {
        updates.end = cloneLocation(template.end);
    }

    if (Object.keys(updates).length > 0) {
        Object.assign(target, updates);
    }

    return target;
}

/**
 * Resolves both the starting and ending offsets for a node in a single call.
 *
 * The helper mirrors {@link getNodeStartIndex} / {@link getNodeEndIndex}
 * by returning `null` when either boundary is unavailable so callers can
 * branch without repeatedly validating nested location objects.
 *
 * @param {unknown} node AST node whose bounds should be retrieved.
 * @returns {{ start: number | null, end: number | null }} Character indices
 *          where `end` is exclusive when defined.
 */
function getNodeRangeIndices(node) {
    const start = getNodeStartIndex(node);
    const end = getNodeEndIndex(node);

    return {
        start: typeof start === "number" ? start : null,
        end: typeof end === "number" ? end : null
    };
}

export {
    getNodeStartIndex,
    getNodeEndIndex,
    getNodeRangeIndices,
    cloneLocation,
    assignClonedLocation
};
