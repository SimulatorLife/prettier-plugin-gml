const LINE_FIELDS = ["line", "row", "start", "first_line"];

const COLUMN_FIELDS = ["column", "col", "columnStart", "first_column"];

const INDEX_FIELDS = ["index", "offset"];

function isNullOrUndefined(value) {
    return value === undefined || value === null;
}

function getFirstDefined(location, fields) {
    for (const field of fields) {
        const value = location[field];
        if (!isNullOrUndefined(value)) {
            return value;
        }
    }

    return null;
}

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
export function buildLocationKey(location) {
    if (!location || typeof location !== "object") {
        return null;
    }

    const line = getFirstDefined(location, LINE_FIELDS);
    const column = getFirstDefined(location, COLUMN_FIELDS);
    const index = getFirstDefined(location, INDEX_FIELDS);

    if (
        isNullOrUndefined(line) &&
        isNullOrUndefined(column) &&
        isNullOrUndefined(index)
    ) {
        return null;
    }

    return [line ?? "", column ?? "", index ?? ""].join(":");
}

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
export function buildFileLocationKey(filePath, location) {
    const locationKey = buildLocationKey(location);
    if (!locationKey) {
        return null;
    }

    return `${filePath ?? "<unknown>"}::${locationKey}`;
}
