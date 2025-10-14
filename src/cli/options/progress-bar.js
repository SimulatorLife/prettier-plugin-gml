export const DEFAULT_PROGRESS_BAR_WIDTH = 24;

function coercePositiveInteger(value, received) {
    if (Number.isFinite(value)) {
        const normalized = Math.trunc(value);
        if (normalized >= 1) {
            return normalized;
        }
    }

    throw new TypeError(
        `Progress bar width must be a positive integer (received ${received}).`
    );
}

export function resolveProgressBarWidth(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return DEFAULT_PROGRESS_BAR_WIDTH;
    }

    if (typeof rawValue === "number") {
        return coercePositiveInteger(rawValue, rawValue);
    }

    if (typeof rawValue === "string") {
        const trimmed = rawValue.trim();
        if (trimmed === "") {
            return DEFAULT_PROGRESS_BAR_WIDTH;
        }

        return coercePositiveInteger(
            Number.parseInt(trimmed, 10),
            `'${rawValue}'`
        );
    }

    throw new TypeError(
        `Progress bar width must be provided as a number (received type '${typeof rawValue}').`
    );
}
