import { isFiniteNumber } from "../../../shared/number-utils.js";

function coercePositiveIntegerOption(
    value,
    defaultValue,
    { zeroReplacement } = {}
) {
    if (isFiniteNumber(value)) {
        const normalized = Math.floor(value);

        if (normalized > 0) {
            return normalized;
        }

        if (zeroReplacement !== undefined && normalized <= 0) {
            return zeroReplacement;
        }
    }

    return defaultValue;
}

export { coercePositiveIntegerOption };
export { normalizeStringList } from "../../../shared/string-utils.js";
