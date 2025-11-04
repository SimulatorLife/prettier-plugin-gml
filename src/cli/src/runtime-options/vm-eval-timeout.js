import { coerceNonNegativeInteger } from "../shared/dependencies.js";
import {
    createIntegerOptionToolkit,
    applyIntegerOptionToolkitEnvOverride,
    createStandardIntegerOptionMessages
} from "../core/integer-option-toolkit.js";

export const DEFAULT_VM_EVAL_TIMEOUT_MS = 5000;
export const VM_EVAL_TIMEOUT_ENV_VAR = "GML_VM_EVAL_TIMEOUT_MS";

const { createErrorMessage, typeErrorMessage } =
    createStandardIntegerOptionMessages("VM evaluation timeout", {
        validationType: "non-negative",
        additionalHelp: "Provide 0 to disable the timeout."
    });

const vmEvalTimeoutToolkit = createIntegerOptionToolkit({
    defaultValue: DEFAULT_VM_EVAL_TIMEOUT_MS,
    envVar: VM_EVAL_TIMEOUT_ENV_VAR,
    baseCoerce: coerceNonNegativeInteger,
    createErrorMessage,
    typeErrorMessage,
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
