export const DEFAULT_VM_EVAL_TIMEOUT_MS = 5000;

function coerceNonNegativeInteger(value, { received } = {}) {
    if (Number.isFinite(value)) {
        const normalized = Math.trunc(value);
        if (normalized >= 0) {
            return normalized;
        }
    }

    const display = received ?? value;
    throw new TypeError(
        `VM evaluation timeout must be a non-negative integer (received ${display}). Provide 0 to disable the timeout.`
    );
}

export function resolveVmEvalTimeout(rawValue) {
    if (rawValue === undefined || rawValue === null) {
        return DEFAULT_VM_EVAL_TIMEOUT_MS;
    }

    if (typeof rawValue === "number") {
        const normalized = coerceNonNegativeInteger(rawValue, {
            received: rawValue
        });
        return normalized === 0 ? null : normalized;
    }

    if (typeof rawValue === "string") {
        const trimmed = rawValue.trim();
        if (trimmed === "") {
            return DEFAULT_VM_EVAL_TIMEOUT_MS;
        }

        const normalized = coerceNonNegativeInteger(
            Number.parseInt(trimmed, 10),
            {
                received: `'${rawValue}'`
            }
        );
        return normalized === 0 ? null : normalized;
    }

    throw new TypeError(
        `VM evaluation timeout must be provided as a number (received type '${typeof rawValue}'). Provide 0 to disable the timeout.`
    );
}
