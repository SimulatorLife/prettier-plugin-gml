const LINE_FIELDS = ["line", "row", "start", "first_line"];

const COLUMN_FIELDS = ["column", "col", "columnStart", "first_column"];

const INDEX_FIELDS = ["index", "offset"];

function getFirstDefined(location, fields) {
    for (const field of fields) {
        const value = location[field];
        if (value != null) {
            return value;
        }
    }

    return null;
}

export function buildLocationKey(location) {
    if (!location || typeof location !== "object") {
        return null;
    }

    const line = getFirstDefined(location, LINE_FIELDS);
    const column = getFirstDefined(location, COLUMN_FIELDS);
    const index = getFirstDefined(location, INDEX_FIELDS);

    if (line == null && column == null && index == null) {
        return null;
    }

    return [line ?? "", column ?? "", index ?? ""].join(":");
}

export function buildFileLocationKey(filePath, location) {
    const locationKey = buildLocationKey(location);
    if (!locationKey) {
        return null;
    }

    return `${filePath ?? "<unknown>"}::${locationKey}`;
}
