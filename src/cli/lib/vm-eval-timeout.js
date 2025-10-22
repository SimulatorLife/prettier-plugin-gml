import { coerceNonNegativeInteger } from "./shared-deps.js";
import {
    createIntegerOptionCoercer,
    createIntegerOptionState
} from "./numeric-option-state.js";

export const DEFAULT_VM_EVAL_TIMEOUT_MS = 5000;

const createTimeoutErrorMessage = (received) =>
    `VM evaluation timeout must be a non-negative integer (received ${received}). Provide 0 to disable the timeout.`;

const createTimeoutTypeErrorMessage = (type) =>
    `VM evaluation timeout must be provided as a number (received type '${type}'). Provide 0 to disable the timeout.`;

const coerceVmTimeout = createIntegerOptionCoercer({
    baseCoerce: coerceNonNegativeInteger,
    createErrorMessage: createTimeoutErrorMessage
});

const vmEvalTimeoutState = createIntegerOptionState({
    defaultValue: DEFAULT_VM_EVAL_TIMEOUT_MS,
    coerce: coerceVmTimeout,
    typeErrorMessage: createTimeoutTypeErrorMessage,
    finalizeResolved: (value) => (value === 0 ? null : value)
});

export function getDefaultVmEvalTimeoutMs() {
    return vmEvalTimeoutState.getDefault();
}

export function setDefaultVmEvalTimeoutMs(timeout) {
    return vmEvalTimeoutState.setDefault(timeout);
}

export function resolveVmEvalTimeout(rawValue, { defaultTimeout } = {}) {
    return vmEvalTimeoutState.resolve(rawValue, {
        defaultValue: defaultTimeout
    });
}
