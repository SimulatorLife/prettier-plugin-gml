const ESCAPE_REGEXP_PATTERN = /[.*+?^${}()|[\]\\]/g;

export function escapeRegExp(text) {
    if (typeof text !== "string") {
        return "";
    }

    return text.replace(ESCAPE_REGEXP_PATTERN, "\\$&");
}
