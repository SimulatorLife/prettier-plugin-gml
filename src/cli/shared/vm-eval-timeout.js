import { coerceNonNegativeInteger } from "./dependencies.js";
import {
    createIntegerOptionCoercer,
    createIntegerOptionState
} from "../core/numeric-option-state.js";

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

const {
    getDefault: getDefaultVmEvalTimeoutMs,
    setDefault: setDefaultVmEvalTimeoutMs,
    resolve: resolveVmEvalTimeoutState
} = vmEvalTimeoutState;

export { getDefaultVmEvalTimeoutMs, setDefaultVmEvalTimeoutMs };

export function resolveVmEvalTimeout(rawValue, { defaultTimeout } = {}) {
    return resolveVmEvalTimeoutState(rawValue, {
        defaultValue: defaultTimeout
    });
}
