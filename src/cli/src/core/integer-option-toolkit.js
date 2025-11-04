import {
    createIntegerOptionCoercer,
    createIntegerOptionState,
    createIntegerOptionResolver
} from "./numeric-option-state.js";
import {
    resolveEnvironmentMap,
    createNumericTypeErrorFormatter
} from "../shared/dependencies.js";

/**
 * Generate standard error message functions for integer option validation.
 * Reduces duplication across CLI modules that create numeric options with
 * similar error messaging patterns.
 *
 * @param {string} label Human-readable option name (e.g., "Progress bar width",
 *        "VM evaluation timeout").
 * @param {object} [options]
 * @param {"positive" | "non-negative"} [options.validationType="positive"]
 *        Constraint type: "positive" requires values >= 1, "non-negative"
 *        requires values >= 0.
 * @param {string} [options.additionalHelp] Optional guidance appended to the
 *        range error (e.g., "Provide 0 to disable the timeout.").
 * @returns {{
 *   createErrorMessage: (received: unknown) => string,
 *   typeErrorMessage: (type: string) => string
 * }}
 */
export function createStandardIntegerOptionMessages(
    label,
    { validationType = "positive", additionalHelp } = {}
) {
    const constraint =
        validationType === "non-negative"
            ? "a non-negative integer"
            : "a positive integer";

    const createErrorMessage = (received) => {
        const base = `${label} must be ${constraint} (received ${received}).`;
        return additionalHelp ? `${base} ${additionalHelp}` : base;
    };

    const typeErrorMessage = createNumericTypeErrorFormatter(label);

    return { createErrorMessage, typeErrorMessage };
}

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
