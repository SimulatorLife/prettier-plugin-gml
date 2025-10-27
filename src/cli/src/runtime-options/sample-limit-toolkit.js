import { coerceNonNegativeInteger } from "../shared/dependencies.js";
import { createIntegerOptionToolkit } from "../core/integer-option-toolkit.js";

/**
 * Create a CLI sample limit toolkit that mirrors the previous standalone
 * modules while centralizing the error messaging and coercion boilerplate.
 *
 * @param {object} parameters
 * @param {number} parameters.defaultValue Baseline limit before overrides.
 * @param {string} [parameters.envVar] Environment variable that overrides the
 *        default when defined.
 * @param {string} parameters.subjectLabel Descriptive label used in error
 *        messages (e.g. "Skipped directory").
 * @param {string} [parameters.defaultValueOption="defaultLimit"] Alias passed
 *        to the resolver so commands can customise option names.
 * @returns {{
 *   getDefault: () => number | undefined,
 *   setDefault: (value: unknown) => number | undefined,
 *   resolve: (value: unknown, options?: Record<string, unknown>) =>
 *       number | null | undefined,
 *   applyEnvOverride: (env?: NodeJS.ProcessEnv | null | undefined) =>
 *       number | undefined
 * }}
 */
export function createSampleLimitToolkit({
    defaultValue,
    envVar,
    subjectLabel,
    defaultValueOption = "defaultLimit"
} = {}) {
    const normalizedLabel = subjectLabel ?? "Sample";

    const createSampleLimitErrorMessage = (received) =>
        `${normalizedLabel} sample limit must be a non-negative integer (received ${received}). Provide 0 to suppress the sample list.`;

    const createSampleLimitTypeErrorMessage = (type) =>
        `${normalizedLabel} sample limit must be provided as a number (received type '${type}').`;

    return createIntegerOptionToolkit({
        defaultValue,
        envVar,
        baseCoerce: coerceNonNegativeInteger,
        createErrorMessage: createSampleLimitErrorMessage,
        typeErrorMessage: createSampleLimitTypeErrorMessage,
        defaultValueOption
    });
}

/**
 * Convenience wrapper that applies the environment override during
 * initialization so modules no longer need to duplicate the
 * "create, destructure, and immediately invoke" ceremony. The helper also
 * retains the `applyEnvOverride` method so callers can opt into custom
 * environment maps while defaulting to the initially provided `env`.
 *
 * @param {Parameters<typeof createSampleLimitToolkit>[0]} parameters
 * @param {{ env?: NodeJS.ProcessEnv | null | undefined }} [options]
 * @returns {ReturnType<typeof createSampleLimitToolkit>}
 */
export function createInitializedSampleLimitToolkit(parameters, { env } = {}) {
    const toolkit = createSampleLimitToolkit(parameters);
    const applyEnvOverride = (overrideEnv = env) =>
        toolkit.applyEnvOverride(overrideEnv);
    applyEnvOverride();
    const initializedToolkit = {
        ...toolkit,
        applyEnvOverride
    };

    return initializedToolkit;
}

/**
 * Bundle the common sample limit runtime option exports so the individual
 * modules do not have to repeat the "declare constants, create toolkit, export
 * members" ceremony. The helper keeps the subject-specific defaults close to
 * the call sites while ensuring each module exposes a consistent API surface.
 *
 * @param {Parameters<typeof createSampleLimitToolkit>[0]} parameters
 * @param {{ env?: NodeJS.ProcessEnv | null | undefined }} [options]
 * @returns {{
 *   defaultValue: number | undefined,
 *   envVar: string | undefined,
 *   getDefault: ReturnType<typeof createSampleLimitToolkit>["getDefault"],
 *   setDefault: ReturnType<typeof createSampleLimitToolkit>["setDefault"],
 *   resolve: ReturnType<typeof createSampleLimitToolkit>["resolve"],
 *   applyEnvOverride: ReturnType<typeof createSampleLimitToolkit>["applyEnvOverride"]
 * }}
 */
export function createSampleLimitRuntimeOption(parameters = {}, { env } = {}) {
    const { defaultValue, envVar } = parameters;
    const toolkit = createInitializedSampleLimitToolkit(parameters, { env });

    return Object.freeze({
        defaultValue,
        envVar,
        getDefault: toolkit.getDefault,
        setDefault: toolkit.setDefault,
        resolve: toolkit.resolve,
        applyEnvOverride: toolkit.applyEnvOverride
    });
}
