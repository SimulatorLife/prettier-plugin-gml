import {
    coerceNonNegativeInteger,
    createEnvConfiguredValue,
    resolveIntegerOption
} from "./shared-deps.js";

export const DEFAULT_VM_EVAL_TIMEOUT_MS = 5000;
export const VM_EVAL_TIMEOUT_ENV_VAR = "GML_VM_EVAL_TIMEOUT_MS";

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

const vmEvalTimeoutConfig = createEnvConfiguredValue({
    defaultValue: DEFAULT_VM_EVAL_TIMEOUT_MS,
    envVar: VM_EVAL_TIMEOUT_ENV_VAR,
    normalize: (value, { defaultValue }) =>
        resolveIntegerOption(value, {
            defaultValue,
            coerce: coerceVmTimeout,
            typeErrorMessage: createTimeoutTypeErrorMessage
        })
});

export function applyVmEvalTimeoutEnvOverride(env = process?.env) {
    vmEvalTimeoutConfig.applyEnvOverride(env);
}

applyVmEvalTimeoutEnvOverride();

export function getDefaultVmEvalTimeoutMs() {
    return vmEvalTimeoutConfig.get();
}

export function setDefaultVmEvalTimeoutMs(timeout) {
    return vmEvalTimeoutConfig.set(timeout);
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
