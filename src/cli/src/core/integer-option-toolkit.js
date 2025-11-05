import {
    assertFunction,
    resolveIntegerOption,
    createEnvConfiguredValue,
    isNonEmptyString,
    hasOwn,
    identity
} from "../shared/dependencies.js";
import { resolveEnvironmentMap } from "../shared/dependencies.js";

/**
 * Create a CLI integer option with validation, environment overrides, and
 * flexible option aliasing. Simplified from the previous multi-layered
 * abstraction while preserving all functionality.
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
 * @param {boolean} [parameters.blankStringReturnsDefault]
 *        Whether blank strings should fall back to the default value.
 * @param {(value: number | undefined) => number | undefined} [parameters.finalizeSet]
 *        Mutator applied when storing configured defaults.
 * @param {(value: number | undefined) => number | null | undefined} [parameters.finalizeResolved]
 *        Mutator applied to resolved values before they are returned.
 * @param {string} [parameters.defaultValueOption]
 *        Alias for the defaultValue option (e.g., "defaultWidth" → "defaultValue").
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
    blankStringReturnsDefault,
    finalizeSet = identity,
    finalizeResolved = identity,
    defaultValueOption
} = {}) {
    assertFunction(baseCoerce, "baseCoerce");

    // Create a coercer that injects the default error message if not provided
    const coerce = (value, context) => {
        const shouldInjectMessage =
            createErrorMessage &&
            (context == null || context.createErrorMessage === undefined);

        const options = shouldInjectMessage
            ? { ...context, createErrorMessage }
            : (context ?? {});

        return baseCoerce(value, options);
    };

    // Create stateful value with environment override support
    const state = createEnvConfiguredValue({
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

    // Create resolver with optional aliasing
    const alias = isNonEmptyString(defaultValueOption)
        ? defaultValueOption
        : null;

    function resolve(rawValue, options = {}) {
        const normalizedOptions =
            options && typeof options === "object" ? { ...options } : {};

        // Support option aliasing (e.g., defaultWidth → defaultValue)
        if (alias && hasOwn(normalizedOptions, alias)) {
            const aliasDefault = normalizedOptions[alias];
            delete normalizedOptions[alias];
            normalizedOptions.defaultValue = aliasDefault;
        }

        const fallback =
            normalizedOptions.defaultValue === undefined
                ? state.get()
                : normalizedOptions.defaultValue;

        const normalized = resolveIntegerOption(rawValue, {
            defaultValue: fallback,
            coerce,
            typeErrorMessage,
            blankStringReturnsDefault
        });

        return finalizeResolved(normalized);
    }

    return {
        coerce,
        getDefault: state.get,
        setDefault: state.set,
        applyEnvOverride: state.applyEnvOverride,
        resolve
    };
}

/**
 * Apply the environment override for an integer option toolkit while handling
 * optional environment maps and error hooks consistently.
 *
 * Several CLI modules previously repeated the same "normalize the environment,
 * call `applyEnvOverride`, catch failures, and fall back to the prior default"
 * ceremony. Centralizing that behaviour keeps the guards aligned whenever we
 * introduce new numeric options and ensures callers can opt into fallback
 * logging without cloning boilerplate.
 *
 * @param {{
 *   applyEnvOverride: (env?: NodeJS.ProcessEnv | null | undefined) => any,
 *   getDefault?: () => any
 * }} toolkit Toolkit returned from {@link createIntegerOptionToolkit} or a
 *        compatible wrapper exposing the same surface area.
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
            "toolkit must expose an applyEnvOverride function to apply environment overrides."
        );
    }

    const sourceEnv = resolveEnvironmentMap(env);
    const invokeOverride = () => {
        if (sourceEnv == null) {
            return toolkit.applyEnvOverride();
        }

        return toolkit.applyEnvOverride(sourceEnv);
    };

    if (typeof onError !== "function") {
        return invokeOverride();
    }

    const fallback =
        typeof toolkit.getDefault === "function"
            ? toolkit.getDefault()
            : undefined;

    try {
        return invokeOverride();
    } catch (error) {
        return onError(error, { fallback });
    }
}
