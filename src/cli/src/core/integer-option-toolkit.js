import {
    assertFunction,
    createEnvConfiguredValue,
    resolveIntegerOption,
    resolveEnvironmentMap,
    hasOwn,
    identity,
    isNonEmptyString
} from "../shared/dependencies.js";

/**
 * Create a CLI integer option with environment override support.
 * Provides stateful management of an integer option value with validation,
 * environment variable overrides, and flexible resolution.
 *
 * @param {object} parameters
 * @param {number} parameters.defaultValue Baseline value before overrides.
 * @param {string} [parameters.envVar] Environment variable that influences the
 *        default when defined.
 * @param {(value: number, context: object) => number} parameters.baseCoerce
 *        Underlying coercion function such as {@link coerceNonNegativeInteger}.
 * @param {string | ((value: unknown) => string)} [parameters.createErrorMessage]
 *        Error message or factory forwarded to the coercer when callers do not
 *        supply one.
 * @param {string | ((type: string) => string)} [parameters.typeErrorMessage]
 *        Error message for type validation failures.
 * @param {boolean} [parameters.blankStringReturnsDefault=true]
 *        Whether blank strings should fall back to the default value.
 * @param {(value: number | undefined) => number | undefined} [parameters.finalizeSet]
 *        Mutator applied when storing configured defaults.
 * @param {(value: number | undefined) => number | null | undefined} [parameters.finalizeResolved]
 *        Mutator applied to resolved values before they are returned.
 * @param {string} [parameters.defaultValueOption]
 *        Alias that maps to the `defaultValue` option in resolve calls.
 * @returns {{
 *   coerce: (value: number, context?: object) => number,
 *   getDefault: () => number | undefined,
 *   setDefault: (value: unknown) => number | undefined,
 *   applyEnvOverride: (env?: NodeJS.ProcessEnv | null | undefined) => number | undefined,
 *   resolve: (value: unknown, options?: Record<string, unknown>) => number | null | undefined
 * }}
 */
export function createIntegerOptionToolkit({
    defaultValue,
    envVar,
    baseCoerce,
    createErrorMessage,
    typeErrorMessage,
    blankStringReturnsDefault = true,
    finalizeSet = identity,
    finalizeResolved = identity,
    defaultValueOption
} = {}) {
    assertFunction(baseCoerce, "baseCoerce");

    // Coerce function with default error message injection
    const coerce = (value, context) => {
        const shouldInjectMessage =
            createErrorMessage &&
            (context == null || context.createErrorMessage === undefined);

        const options = shouldInjectMessage
            ? { ...context, createErrorMessage }
            : (context ?? {});

        return baseCoerce(value, options);
    };

    // Stateful configuration using environment-aware wrapper
    const config = createEnvConfiguredValue({
        defaultValue,
        envVar,
        normalize: (value, { defaultValue: baseline, previousValue }) => {
            const fallback = baseline ?? previousValue;
            const normalized = resolveIntegerOption(value, {
                defaultValue: fallback,
                coerce,
                typeErrorMessage,
                blankStringReturnsDefault
            });
            return finalizeSet(normalized);
        }
    });

    const getDefault = () => config.get();
    const setDefault = (value) => config.set(value);
    const applyEnvOverride = (env) => config.applyEnvOverride(env);

    // Resolver with optional alias support
    const alias = isNonEmptyString(defaultValueOption)
        ? defaultValueOption
        : null;

    const resolve = (rawValue, options = {}) => {
        const normalizedOptions =
            options && typeof options === "object" ? { ...options } : {};

        if (alias && hasOwn(normalizedOptions, alias)) {
            const aliasDefault = normalizedOptions[alias];
            delete normalizedOptions[alias];
            normalizedOptions.defaultValue = aliasDefault;
        }

        const fallback =
            normalizedOptions.defaultValue === undefined
                ? getDefault()
                : normalizedOptions.defaultValue;
        const normalized = resolveIntegerOption(rawValue, {
            defaultValue: fallback,
            coerce,
            typeErrorMessage,
            blankStringReturnsDefault
        });
        return finalizeResolved(normalized);
    };

    return {
        coerce,
        getDefault,
        setDefault,
        applyEnvOverride,
        resolve
    };
}

/**
 * Apply the environment override for an integer option toolkit with error handling.
 *
 * @param {{
 *   applyEnvOverride: (env?: NodeJS.ProcessEnv | null | undefined) => any,
 *   getDefault?: () => any
 * }} toolkit Toolkit returned from {@link createIntegerOptionToolkit}.
 * @param {{
 *   env?: NodeJS.ProcessEnv | null | undefined,
 *   onError?: (error: unknown, context: { fallback: any }) => any
 * }} [options]
 * @returns {any} Result of invoking `applyEnvOverride` or the fallback supplied
 *          by {@link options.onError}.
 */
export function applyIntegerOptionToolkitEnvOverride(
    toolkit,
    { env, onError } = {}
) {
    if (!toolkit || typeof toolkit.applyEnvOverride !== "function") {
        throw new TypeError(
            "toolkit must expose an applyEnvOverride function."
        );
    }

    const sourceEnv = resolveEnvironmentMap(env);

    if (typeof onError !== "function") {
        return toolkit.applyEnvOverride(sourceEnv);
    }

    const fallback =
        typeof toolkit.getDefault === "function"
            ? toolkit.getDefault()
            : undefined;

    try {
        return toolkit.applyEnvOverride(sourceEnv);
    } catch (error) {
        return onError(error, { fallback });
    }
}
