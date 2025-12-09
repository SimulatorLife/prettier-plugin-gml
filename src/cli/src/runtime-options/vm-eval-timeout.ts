import { Core } from "@gml-modules/core";
import { createIntegerOptionToolkit } from "../cli-core/integer-option-toolkit.js";

const {
    callWithFallback,
    coerceNonNegativeInteger,
    createNumericTypeErrorFormatter,
    describeValueForError
} = Core;

export const DEFAULT_VM_EVAL_TIMEOUT_MS = 5000;
export const VM_EVAL_TIMEOUT_ENV_VAR = "GML_VM_EVAL_TIMEOUT_MS";

const createTimeoutErrorMessage = (received: unknown) =>
    `VM evaluation timeout must be a non-negative integer (received ${describeValueForError(
        received
    )}). Provide 0 to disable the timeout.`;

const createTimeoutTypeErrorMessage = createNumericTypeErrorFormatter(
    "VM evaluation timeout"
);

const vmEvalTimeoutToolkit = createIntegerOptionToolkit({
    defaultValue: DEFAULT_VM_EVAL_TIMEOUT_MS,
    envVar: VM_EVAL_TIMEOUT_ENV_VAR,
    baseCoerce: coerceNonNegativeInteger,
    createErrorMessage: createTimeoutErrorMessage,
    typeErrorMessage: createTimeoutTypeErrorMessage,
    transform: (value) => (value === 0 ? null : value),
    optionAlias: "defaultTimeout"
});

const {
    getDefault: getDefaultVmEvalTimeoutMs,
    setDefault: setDefaultVmEvalTimeoutMs,
    resolve: resolveVmEvalTimeout,
    applyEnvOverride
} = vmEvalTimeoutToolkit;

function applyVmEvalTimeoutEnvOverride(
    env?: NodeJS.ProcessEnv
): number | undefined {
    return callWithFallback(() => applyEnvOverride(env), {
        fallback: () => getDefaultVmEvalTimeoutMs()
    });
}

applyVmEvalTimeoutEnvOverride();

export {
    getDefaultVmEvalTimeoutMs,
    setDefaultVmEvalTimeoutMs,
    resolveVmEvalTimeout,
    applyVmEvalTimeoutEnvOverride
};
