import { hasOwn, isObjectLike, withObjectLike } from "../utils/object.js";

// Shared helpers for working with AST node location metadata.
// These utilities centralize the logic for reading start/end positions
// so both the parser and printer can remain consistent without duplicating
// defensive checks around optional location shapes.

function getLocationIndex(node, key) {
    return withObjectLike(
        node,
        (nodeObject) => {
            const location = nodeObject[key];

            if (typeof location === "number") {
                return location;
            }

            return withObjectLike(
                location,
                (locationObject) => {
                    const { index } = locationObject;
                    return typeof index === "number" ? index : null;
                },
                () => null
            );
        },
        () => null
    );
}

function getStartIndex(node) {
    if (!isObjectLike(node)) {
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
    if (isObjectLike(location)) {
        return structuredClone(location);
    }

    if (location == null) {
        return location ?? undefined;
    }

    return location;
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
    return withObjectLike(
        target,
        (mutableTarget) =>
            withObjectLike(
                template,
                (templateNode) => {
                    let shouldAssign = false;
                    const clonedLocations = {};

                    if (hasOwn(templateNode, "start")) {
                        clonedLocations.start = cloneLocation(
                            templateNode.start
                        );
                        shouldAssign = true;
                    }

                    if (hasOwn(templateNode, "end")) {
                        clonedLocations.end = cloneLocation(templateNode.end);
                        shouldAssign = true;
                    }

                    if (shouldAssign) {
                        Object.assign(mutableTarget, clonedLocations);
                    }

                    return mutableTarget;
                },
                () => mutableTarget
            ),
        () => target
    );
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
    const endLocation = getLocationIndex(node, "end");

    // `getNodeEndIndex` falls back to the node's start location when the end
    // marker is missing. Callers frequently request both bounds together, so
    // cache the normalized start index locally and reuse it for the fallback to
    // avoid repeating the nested location walk inside `getNodeEndIndex`.
    let end = null;
    if (typeof endLocation === "number") {
        end = endLocation + 1;
    } else if (typeof start === "number") {
        end = start;
    }

    return {
        start,
        end
    };
}

function getNodeLocationLine(node, key) {
    return withObjectLike(
        node,
        (nodeObject) =>
            withObjectLike(
                nodeObject[key],
                (location) => {
                    const { line } = location;
                    return typeof line === "number" ? line : null;
                },
                () => null
            ),
        () => null
    );
}

/**
 * Retrieve the zero-based line number where {@link node} begins.
 *
 * Mirrors {@link getNodeStartIndex} by collapsing missing or malformed
 * location metadata to `null` so callers can branch on a single sentinel
 * value instead of re-validating nested location shapes.
 *
 * @param {unknown} node AST node whose starting line should be resolved.
 * @returns {number | null} Line index or `null` when unavailable.
 */
function getNodeStartLine(node) {
    return getNodeLocationLine(node, "start");
}

/**
 * Retrieve the zero-based line number where {@link node} ends.
 *
 * Follows {@link getNodeEndIndex} by falling back to the node's start line
 * whenever the parser omits an explicit end marker so downstream consumers can
 * share the same guard logic across index- and line-based helpers.
 *
 * @param {unknown} node AST node whose ending line should be resolved.
 * @returns {number | null} Line index or `null` when unavailable.
 */
function getNodeEndLine(node) {
    return (
        getNodeLocationLine(node, "end") ?? getNodeLocationLine(node, "start")
    );
}

export {
    getNodeStartIndex,
    getNodeEndIndex,
    getNodeRangeIndices,
    getNodeStartLine,
    getNodeEndLine,
    cloneLocation,
    assignClonedLocation
};
