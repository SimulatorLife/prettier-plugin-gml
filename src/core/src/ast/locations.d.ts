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
declare function getNodeStartIndex(node: any): number;
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
declare function getNodeEndIndex(node: any): number;
declare function cloneLocation(location: any): any;
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
declare function assignClonedLocation(target: any, template: any): any;
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
declare function getNodeRangeIndices(node: any): {
    start: number;
    end: any;
};
/**
 * Select the preferred location object from a list of candidates.
 *
 * Many transforms supply multiple possible location sources (for example a
 * computed property start and the assignment's start) and expect a single
 * location-like value that can be cloned and assigned to a synthesized node.
 * This helper returns the first concrete candidate it finds. Numeric indices
 * are normalized to a `{ index: number }` shape for callers that expect an
 * object-like location.
 *
 * @param {...(object|number|null|undefined)} candidates Potential location
 *        values ordered by preference.
 * @returns {object | null} The chosen location object or `null` when none
 *                         were provided.
 */
declare function getPreferredLocation(...candidates: any[]): any;
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
declare function getNodeStartLine(node: any): any;
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
declare function getNodeEndLine(node: any): any;
export {
    getNodeStartIndex,
    getNodeEndIndex,
    getNodeRangeIndices,
    getNodeStartLine,
    getNodeEndLine,
    getPreferredLocation,
    cloneLocation,
    assignClonedLocation
};
