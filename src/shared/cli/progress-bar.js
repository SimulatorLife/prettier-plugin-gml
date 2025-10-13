import { CliUsageError } from "./cli-errors.js";

export const DEFAULT_PROGRESS_BAR_WIDTH = 24;

function toUsageError(message, usage) {
    return new CliUsageError(message, { usage });
}

export function resolveProgressBarWidth(rawValue, { usage } = {}) {
    if (rawValue === undefined || rawValue === null) {
        return DEFAULT_PROGRESS_BAR_WIDTH;
    }

    const valueType = typeof rawValue;
    if (valueType === "number" && Number.isFinite(rawValue)) {
        const normalized = Math.trunc(rawValue);
        if (normalized >= 1) {
            return normalized;
        }
        throw toUsageError(
            `Progress bar width must be a positive integer (received ${rawValue}).`,
            usage
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
        throw toUsageError(
            `Progress bar width must be a positive integer (received '${rawValue}').`,
            usage
        );
    }

    throw toUsageError(
        `Progress bar width must be provided as a number (received type '${valueType}').`,
        usage
    );
}
