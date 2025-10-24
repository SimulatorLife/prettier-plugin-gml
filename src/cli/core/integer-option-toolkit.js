import {
    createIntegerOptionCoercer,
    createIntegerOptionState,
    createIntegerOptionResolver
} from "./numeric-option-state.js";

/**
 * Compose a CLI integer option from the shared numeric option primitives.
 * Centralizes the common boilerplate used by modules that expose numeric
 * configuration flags with optional environment overrides so each module can
 * focus on domain-specific messaging.
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
 *        Error message forwarded to {@link createIntegerOptionState} for type
 *        validation failures.
 * @param {boolean} [parameters.blankStringReturnsDefault]
 *        Whether blank strings should fall back to the default value.
 * @param {(value: number | undefined) => number | undefined} [parameters.finalizeSet]
 *        Mutator applied when storing configured defaults.
 * @param {(value: number | undefined) => number | null | undefined} [parameters.finalizeResolved]
 *        Mutator applied to resolved values before they are returned.
 * @param {string} [parameters.defaultValueOption]
 *        Alias forwarded to the resolver so callers can expose descriptive
 *        option names while continuing to delegate to the shared state.
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
    finalizeSet,
    finalizeResolved,
    defaultValueOption
} = {}) {
    const coerce = createIntegerOptionCoercer({
        baseCoerce,
        createErrorMessage
    });

    const state = createIntegerOptionState({
        defaultValue,
        envVar,
        coerce,
        typeErrorMessage,
        blankStringReturnsDefault,
        finalizeSet,
        finalizeResolved
    });

    const resolve = createIntegerOptionResolver(state.resolve, {
        defaultValueOption
    });

    return {
        coerce,
        getDefault: state.getDefault,
        setDefault: state.setDefault,
        applyEnvOverride: state.applyEnvOverride,
        resolve
    };
}
