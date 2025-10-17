import { toNormalizedInteger } from "../../../shared/number-utils.js";

function coercePositiveIntegerOption(
    value,
    defaultValue,
    { zeroReplacement } = {}
) {
    const normalized = toNormalizedInteger(value);

    if (normalized === null) {
        return defaultValue;
    }

    if (normalized > 0) {
        return normalized;
    }

    if (zeroReplacement !== undefined) {
        return zeroReplacement;
    }

    return defaultValue;
}

export { coercePositiveIntegerOption };
export { normalizeStringList } from "../../../shared/string-utils.js";
