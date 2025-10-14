export const DEFAULT_PROGRESS_BAR_WIDTH = 24;

export function resolveProgressBarWidth(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return DEFAULT_PROGRESS_BAR_WIDTH;
    }

    const valueType = typeof rawValue;
    if (valueType === "number" && Number.isFinite(rawValue)) {
        const normalized = Math.trunc(rawValue);
        if (normalized >= 1) {
            return normalized;
        }
        throw new TypeError(
            `Progress bar width must be a positive integer (received ${rawValue}).`
        );
    }

    if (valueType === "string") {
        const trimmed = rawValue.trim();
        if (trimmed === "") {
            return DEFAULT_PROGRESS_BAR_WIDTH;
        }
        const parsed = Number.parseInt(trimmed, 10);
        if (Number.isFinite(parsed) && parsed >= 1) {
            return parsed;
        }
        throw new TypeError(
            `Progress bar width must be a positive integer (received '${rawValue}').`
        );
    }

    throw new TypeError(
        `Progress bar width must be provided as a number (received type '${valueType}').`
    );
}
