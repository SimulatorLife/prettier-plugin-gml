import {
    assertFunction,
    createEnvConfiguredValue,
    resolveIntegerOption,
    hasOwn
} from "../shared/dependencies.js";

const identity = (value) => value;

/**
 * Wrap a numeric option coercer so callers can reuse consistent error handling
 * and validation across CLI modules. The returned function forwards context to
 * the base coercer while ensuring the provided error message is applied when
 * the caller does not override it.
 *
 * @param {object} parameters
 * @param {(value: number, context: object) => number} parameters.baseCoerce
 *        Underlying coercion function such as {@link coercePositiveInteger}.
 * @param {string | ((value: unknown) => string)} [parameters.createErrorMessage]
 *        Error message or factory forwarded to the coercer when one is not
 *        supplied by the caller.
 * @returns {(value: number, context?: object) => number}
 */
export function createIntegerOptionCoercer({
    baseCoerce,
    createErrorMessage
} = {}) {
    assertFunction(baseCoerce, "baseCoerce");

    return (value, context = {}) => {
        const options = { ...context };

        if (options.createErrorMessage === undefined && createErrorMessage) {
            options.createErrorMessage = createErrorMessage;
        }

        return baseCoerce(value, options);
    };
}

/**
 * Create a stateful integer option backed by {@link createEnvConfiguredValue}.
 * The helper centralizes the logic shared by CLI utilities that expose numeric
 * configuration flags with environment overrides.
 *
 * @param {object} parameters
 * @param {number} parameters.defaultValue Baseline value returned before any
 *        overrides are applied.
 * @param {string} [parameters.envVar] Environment variable that drives the
 *        default when defined.
 * @param {(value: number, context: object) => number} parameters.coerce Function
 *        that validates and normalizes numeric input.
 * @param {string | ((type: string) => string)} [parameters.typeErrorMessage]
 *        Error message used when {@link resolveIntegerOption} receives an
 *        unsupported type.
 * @param {boolean} [parameters.blankStringReturnsDefault=true] Whether blank
 *        strings should map to the default value.
 * @param {(value: number | undefined) => number | undefined} [parameters.finalizeSet]
 *        Mutator applied when storing the configured default.
 * @param {(value: number | undefined) => number | null | undefined} [parameters.finalizeResolved]
 *        Mutator applied to the resolved value returned by {@link resolve}.
 * @returns {{
 *   getDefault(): number | undefined,
 *   setDefault(value: unknown): number | undefined,
 *   resolve(value: unknown, options?: { defaultValue?: number | undefined }): number | null | undefined,
 *   applyEnvOverride(env?: NodeJS.ProcessEnv | null | undefined): number | undefined
 * }}
 */
export function createIntegerOptionState({
    defaultValue,
    envVar,
    coerce,
    typeErrorMessage,
    blankStringReturnsDefault = true,
    finalizeSet = identity,
    finalizeResolved = identity
} = {}) {
    assertFunction(coerce, "coerce");

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

    function getDefault() {
        return config.get();
    }

    function setDefault(value) {
        return config.set(value);
    }

    function resolve(rawValue, { defaultValue: overrideDefault } = {}) {
        const fallback =
            overrideDefault === undefined ? getDefault() : overrideDefault;
        const normalized = resolveIntegerOption(rawValue, {
            defaultValue: fallback,
            coerce,
            typeErrorMessage,
            blankStringReturnsDefault
        });
        return finalizeResolved(normalized);
    }

    function applyEnvOverride(env) {
        return config.applyEnvOverride(env);
    }

    return { getDefault, setDefault, resolve, applyEnvOverride };
}

/**
 * Create a resolver that maps a descriptive alias (for example `defaultWidth`)
 * to the `defaultValue` option consumed by {@link createIntegerOptionState}.
 * Centralizes the boilerplate used across CLI modules that expose numeric
 * configuration so each module can keep its public API expressive without
 * re-implementing the aliasing logic.
 *
 * @param {(value: unknown, options?: { defaultValue?: number }) => unknown} resolve
 *        Resolver returned from {@link createIntegerOptionState}.
 * @param {{ defaultValueOption?: string }} [options]
 * @param {string} [options.defaultValueOption] Alias forwarded to
 *        `defaultValue` when present.
 * @returns {(value: unknown, options?: Record<string, unknown>) => unknown}
 */
export function createIntegerOptionResolver(
    resolve,
    { defaultValueOption } = {}
) {
    assertFunction(resolve, "resolve");

    const alias =
        typeof defaultValueOption === "string" && defaultValueOption.length > 0
            ? defaultValueOption
            : null;

    return (rawValue, options = {}) => {
        const normalizedOptions =
            options && typeof options === "object" ? { ...options } : {};

        if (!alias) {
            return resolve(rawValue, normalizedOptions);
        }

        if (!hasOwn(normalizedOptions, alias)) {
            return resolve(rawValue, normalizedOptions);
        }

        const { [alias]: aliasDefault, ...rest } = normalizedOptions;

        return resolve(rawValue, {
            ...rest,
            defaultValue: aliasDefault
        });
    };
}
