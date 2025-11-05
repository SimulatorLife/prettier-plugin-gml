import {
    coerceNonNegativeInteger,
    resolveIntegerOption,
    createEnvConfiguredValue
} from "../shared/dependencies.js";

/**
 * Create a sample limit configuration with environment variable support.
 *
 * Simplified from the over-abstracted toolkit/state/coercer/resolver hierarchy.
 * Does exactly what's needed: parse integers from strings or env vars, validate
 * they're non-negative, and provide getter/setter access.
 *
 * @param {object} params
 * @param {number} params.defaultValue Initial value
 * @param {string} params.envVar Environment variable name
 * @param {string} params.subjectLabel Label for error messages
 * @returns {{
 *   getDefault: () => number | undefined,
 *   setDefault: (value: unknown) => number | undefined,
 *   resolve: (value: unknown, options?: { defaultLimit?: number }) => number | null | undefined,
 *   applyEnvOverride: (env?: NodeJS.ProcessEnv) => number | undefined
 * }}
 */
function createSampleLimitOption({ defaultValue, envVar, subjectLabel }) {
    const label = subjectLabel ?? "Sample";

    const createErrorMessage = (received) =>
        `${label} sample limit must be a non-negative integer (received ${received}). Provide 0 to suppress the sample list.`;

    const createTypeError = (type) =>
        `${label} sample limit must be provided as a number (received type '${type}').`;

    const coerce = (value, context) =>
        coerceNonNegativeInteger(value, { ...context, createErrorMessage });

    const state = createEnvConfiguredValue({
        defaultValue,
        envVar,
        normalize: (value, fallback) =>
            resolveIntegerOption(value, {
                defaultValue: fallback,
                coerce,
                typeErrorMessage: createTypeError
            })
    });

    function resolve(rawValue, options = {}) {
        const defaultLimit = options.defaultLimit ?? options.defaultValue;
        const fallback =
            defaultLimit === undefined ? state.get() : defaultLimit;
        return resolveIntegerOption(rawValue, {
            defaultValue: fallback,
            coerce,
            typeErrorMessage: createTypeError
        });
    }

    return {
        getDefault: state.get,
        setDefault: state.set,
        resolve,
        applyEnvOverride: state.applyEnvOverride
    };
}

/**
 * Create and initialize a sample limit option with environment override applied.
 *
 * @param {Parameters<typeof createSampleLimitOption>[0]} params
 * @param {{ env?: NodeJS.ProcessEnv }} [options]
 * @returns {{
 *   defaultValue: number | undefined,
 *   envVar: string | undefined,
 *   getDefault: () => number | undefined,
 *   setDefault: (value: unknown) => number | undefined,
 *   resolve: (value: unknown, options?: Record<string, unknown>) => number | null | undefined,
 *   applyEnvOverride: (env?: NodeJS.ProcessEnv) => number | undefined
 * }}
 */
export function createSampleLimitRuntimeOption(params, { env } = {}) {
    const { defaultValue, envVar } = params;
    const option = createSampleLimitOption(params);

    const applyEnvOverride = (overrideEnv) =>
        option.applyEnvOverride(overrideEnv ?? env);

    applyEnvOverride();

    return Object.freeze({
        defaultValue,
        envVar,
        getDefault: option.getDefault,
        setDefault: option.setDefault,
        resolve: option.resolve,
        applyEnvOverride
    });
}
