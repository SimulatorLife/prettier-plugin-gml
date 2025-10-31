import { coerceNonNegativeInteger } from "../shared/dependencies.js";
import {
    createIntegerOptionToolkit,
    applyIntegerOptionToolkitEnvOverride
} from "../core/integer-option-toolkit.js";

export const DEFAULT_VM_EVAL_TIMEOUT_MS = 5000;
export const VM_EVAL_TIMEOUT_ENV_VAR = "GML_VM_EVAL_TIMEOUT_MS";

const createTimeoutErrorMessage = (received) =>
    `VM evaluation timeout must be a non-negative integer (received ${received}). Provide 0 to disable the timeout.`;

const createTimeoutTypeErrorMessage = (type) =>
    `VM evaluation timeout must be provided as a number (received type '${type}'). Provide 0 to disable the timeout.`;

const vmEvalTimeoutToolkit = createIntegerOptionToolkit({
    defaultValue: DEFAULT_VM_EVAL_TIMEOUT_MS,
    envVar: VM_EVAL_TIMEOUT_ENV_VAR,
    baseCoerce: coerceNonNegativeInteger,
    createErrorMessage: createTimeoutErrorMessage,
    typeErrorMessage: createTimeoutTypeErrorMessage,
    finalizeResolved: (value) => (value === 0 ? null : value),
    defaultValueOption: "defaultTimeout"
});

const {
    getDefault: getDefaultVmEvalTimeoutMs,
    setDefault: setDefaultVmEvalTimeoutMs,
    resolve: resolveVmEvalTimeout,
    applyEnvOverride: applyVmEvalTimeoutEnvOverrideInternal
} = vmEvalTimeoutToolkit;

function applyVmEvalTimeoutEnvOverride(env) {
    return applyIntegerOptionToolkitEnvOverride(vmEvalTimeoutToolkit, {
        env,
        onError: () => getDefaultVmEvalTimeoutMs()
    });
}

applyVmEvalTimeoutEnvOverride();

export {
    getDefaultVmEvalTimeoutMs,
    setDefaultVmEvalTimeoutMs,
    resolveVmEvalTimeout,
    applyVmEvalTimeoutEnvOverride
};
