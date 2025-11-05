import {
    assertFunction,
    resolveIntegerOption,
    createEnvConfiguredValue
} from "../shared/dependencies.js";

/**
 * Create a CLI integer option with validation and environment overrides.
 *
 * @param {object} parameters
 * @param {number} parameters.defaultValue Baseline value before overrides.
 * @param {string} [parameters.envVar] Environment variable that overrides the default.
 * @param {(value: number, context: object) => number} parameters.baseCoerce
 *        Coercion function like coerceNonNegativeInteger.
 * @param {string | ((value: unknown) => string)} [parameters.createErrorMessage]
 *        Error message for validation failures.
 * @param {string | ((type: string) => string)} [parameters.typeErrorMessage]
 *        Error message for type validation failures.
 * @param {boolean} [parameters.blankStringReturnsDefault]
 *        Whether blank strings fall back to the default value.
 * @param {(value: number | undefined) => number | null | undefined} [parameters.transform]
 *        Optional transformation applied to resolved values.
 * @param {string} [parameters.optionAlias]
 *        Alternative name for the defaultValue option in resolve() calls.
 * @returns {{
 *   getDefault: () => number | undefined,
 *   setDefault: (value: unknown) => number | undefined,
 *   applyEnvOverride: (env?: NodeJS.ProcessEnv) => number | undefined,
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
    transform,
    optionAlias
} = {}) {
    assertFunction(baseCoerce, "baseCoerce");

    const coerce = (value, context = {}) => {
        const opts =
            createErrorMessage && !context.createErrorMessage
                ? { ...context, createErrorMessage }
                : context;
        return baseCoerce(value, opts);
    };

    const state = createEnvConfiguredValue({
        defaultValue,
        envVar,
        normalize: (value, fallback) =>
            resolveIntegerOption(value, {
                defaultValue: fallback,
                coerce,
                typeErrorMessage,
                blankStringReturnsDefault
            })
    });

    function resolve(rawValue, options = {}) {
        let opts = options;

        if (optionAlias && options?.[optionAlias] !== undefined) {
            opts = { ...options, defaultValue: options[optionAlias] };
            delete opts[optionAlias];
        }

        const fallback = opts.defaultValue ?? state.get();
        const normalized = resolveIntegerOption(rawValue, {
            defaultValue: fallback,
            coerce,
            typeErrorMessage,
            blankStringReturnsDefault
        });

        return transform ? transform(normalized) : normalized;
    }

    return {
        getDefault: state.get,
        setDefault: state.set,
        applyEnvOverride: state.applyEnvOverride,
        resolve
    };
}
