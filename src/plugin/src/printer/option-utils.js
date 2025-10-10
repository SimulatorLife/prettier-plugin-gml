function coercePositiveIntegerOption(value, defaultValue, { zeroReplacement } = {}) {
    if (typeof value === "number" && Number.isFinite(value)) {
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
