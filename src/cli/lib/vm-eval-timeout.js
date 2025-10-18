import {
    coerceNonNegativeInteger,
    resolveIntegerOption
} from "../../shared/utils.js";

export const DEFAULT_VM_EVAL_TIMEOUT_MS = 5000;

let configuredDefaultVmEvalTimeoutMs = DEFAULT_VM_EVAL_TIMEOUT_MS;

const createTimeoutErrorMessage = (received) =>
    `VM evaluation timeout must be a non-negative integer (received ${received}). Provide 0 to disable the timeout.`;

const createTimeoutTypeErrorMessage = (type) =>
    `VM evaluation timeout must be provided as a number (received type '${type}'). Provide 0 to disable the timeout.`;

function coerceVmTimeout(value, { received }) {
    return coerceNonNegativeInteger(value, {
        received,
        createErrorMessage: createTimeoutErrorMessage
    });
}

export function getDefaultVmEvalTimeoutMs() {
    return configuredDefaultVmEvalTimeoutMs;
}

export function setDefaultVmEvalTimeoutMs(timeout) {
    configuredDefaultVmEvalTimeoutMs = coerceVmTimeout(timeout, {
        received: timeout
    });
}

export function resolveVmEvalTimeout(rawValue, { defaultTimeout } = {}) {
    const fallback =
        defaultTimeout === undefined
            ? getDefaultVmEvalTimeoutMs()
            : defaultTimeout;

    const normalized = resolveIntegerOption(rawValue, {
        defaultValue: fallback,
        coerce: coerceVmTimeout,
        typeErrorMessage: createTimeoutTypeErrorMessage
    });

    return normalized === 0 ? null : normalized;
}
