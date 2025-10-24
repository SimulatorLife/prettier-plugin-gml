import { coerceNonNegativeInteger } from "./shared-deps.js";
import { createIntegerOptionToolkit } from "./integer-option-toolkit.js";

export const DEFAULT_VM_EVAL_TIMEOUT_MS = 5000;

const createTimeoutErrorMessage = (received) =>
    `VM evaluation timeout must be a non-negative integer (received ${received}). Provide 0 to disable the timeout.`;

const createTimeoutTypeErrorMessage = (type) =>
    `VM evaluation timeout must be provided as a number (received type '${type}'). Provide 0 to disable the timeout.`;

const {
    getDefault: getDefaultVmEvalTimeoutMs,
    setDefault: setDefaultVmEvalTimeoutMs,
    resolve: resolveVmEvalTimeout
} = createIntegerOptionToolkit({
    defaultValue: DEFAULT_VM_EVAL_TIMEOUT_MS,
    baseCoerce: coerceNonNegativeInteger,
    createErrorMessage: createTimeoutErrorMessage,
    typeErrorMessage: createTimeoutTypeErrorMessage,
    finalizeResolved: (value) => (value === 0 ? null : value),
    defaultValueOption: "defaultTimeout"
});

export {
    getDefaultVmEvalTimeoutMs,
    setDefaultVmEvalTimeoutMs,
    resolveVmEvalTimeout
};
