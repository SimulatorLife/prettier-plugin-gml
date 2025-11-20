/**
 * Consolidate location metadata coming from multiple parser variants into a
 * deterministic cache key. The function tolerates partially-defined objects
 * and quietly bails out when none of the known line/column/index properties
 * are available, which allows callers to skip key-based lookups for anonymous
 * nodes.
 *
 * @param {unknown} location Parser-provided location descriptor.
 * @returns {string | null} Colon-delimited key containing line, column, and
 *                          index information when any value exists; otherwise
 *                          `null`.
 */
export declare function buildLocationKey(location: any): string;
/**
 * Compose a file-scoped location key by prefixing {@link buildLocationKey}
 * output with a best-effort file name. Unknown paths fall back to
 * "<unknown>" so logs retain a consistent structure even when the parser does
 * not attach path information.
 *
 * @param {string | null | undefined} filePath Absolute or relative file path.
 * @param {unknown} location Parser-provided location descriptor passed to
 *                           {@link buildLocationKey}.
 * @returns {string | null} File-qualified location key, or `null` when no
 *                          usable location data is available.
 */
export declare function buildFileLocationKey(
    filePath: any,
    location: any
): string;
