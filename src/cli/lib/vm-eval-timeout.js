import {
    coerceNonNegativeInteger,
    resolveIntegerOption
} from "./command-parsing.js";

export const DEFAULT_VM_EVAL_TIMEOUT_MS = 5000;

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

export function resolveVmEvalTimeout(rawValue) {
    const normalized = resolveIntegerOption(rawValue, {
        defaultValue: DEFAULT_VM_EVAL_TIMEOUT_MS,
        coerce: coerceVmTimeout,
        typeErrorMessage: createTimeoutTypeErrorMessage
    });

    return normalized === 0 ? null : normalized;
}
