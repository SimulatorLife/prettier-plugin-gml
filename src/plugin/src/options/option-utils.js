import { normalizeStringList } from "../../../shared/string-utils.js";
import { isFiniteNumber } from "../../../shared/number-utils.js";

function coercePositiveIntegerOption(
    value,
    defaultValue,
    { zeroReplacement } = {}
) {
    if (!isFiniteNumber(value)) {
        return defaultValue;
    }

    const normalized = Math.floor(value);

    if (normalized > 0) {
        return normalized;
    }

    if (zeroReplacement !== undefined) {
        return zeroReplacement;
    }

    return defaultValue;
}

export { coercePositiveIntegerOption, normalizeStringList };
