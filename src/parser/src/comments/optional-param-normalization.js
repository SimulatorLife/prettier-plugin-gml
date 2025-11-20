/**
 * Normalize an optional parameter token by ensuring it is wrapped in brackets.
 * @param {*} token - The token to normalize.
 * @returns {*} - The normalized token.
 */
export function normalizeOptionalParamToken(token) {
    if (typeof token !== "string") {
        return token;
    }
    const trimmed = token.trim();
    if (/^\[[^\]]+\]$/.test(trimmed)) {
        return trimmed;
    }
    const stripped = trimmed.replaceAll(/^\*+|\*+$/g, "");
    if (stripped === trimmed) {
        return trimmed;
    }
    const normalized = stripped.trim();
    if (normalized.length === 0) {
        return stripped.replaceAll("*", "");
    }
    return `[${normalized}]`;
}
//# sourceMappingURL=optional-param-normalization.js.map
