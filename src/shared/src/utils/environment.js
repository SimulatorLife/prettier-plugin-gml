import { assertFunction, isObjectLike } from "./object.js";
import { assertNonEmptyString } from "./string.js";

/**
 * Apply an environment-driven override by invoking {@link applyValue} when the
 * referenced variable is defined.
 *
 * Centralizes the defensive plumbing shared by CLI utilities and the project
 * index so future overrides can opt into consistent validation and fallback
 * behaviour without repeating boilerplate guards.
 *
 * @param {object} parameters
 * @param {NodeJS.ProcessEnv | null | undefined} [parameters.env] Environment
 *        map to read from. Defaults to {@link process.env} when omitted.
 * @param {string} parameters.envVar Name of the environment variable powering
 *        the override.
 * @param {(value: string) => void} parameters.applyValue Callback invoked with
 *        the environment value when present.
 * @param {boolean} [parameters.includeUndefined=false] When `true`, invoke the
 *        callback even if the variable is explicitly set to `undefined`.
 */
export function applyEnvironmentOverride({
    env,
    envVar,
    applyValue,
    includeUndefined = false
} = {}) {
    const variable = assertNonEmptyString(envVar, {
        name: "envVar",
        trim: true
    });
    assertFunction(applyValue, "applyValue");

    const sourceEnv = resolveEnvironmentMap(env);

    if (!sourceEnv) {
        return;
    }

    const rawValue = sourceEnv[variable];

    if (rawValue === undefined && !includeUndefined) {
        return;
    }

    applyValue(rawValue);
}

/**
 * Normalize a candidate environment map into a plain object reference.
 *
 * The helper mirrors the defensive guards used by the other environment
 * utilities so callers can accept optional overrides without sprinkling
 * `process.env` checks or trusting non-object values. When a usable map is not
 * supplied it falls back to {@link process.env} when available, otherwise
 * returns `null` so consumers can gracefully skip environment-driven logic.
 *
 * @param {NodeJS.ProcessEnv | null | undefined | unknown} candidate Potential
 *        environment source provided by the caller.
 * @returns {NodeJS.ProcessEnv | null} Normalized environment map or `null`
 *          when neither the candidate nor {@link process.env} is usable.
 */
export function resolveEnvironmentMap(candidate) {
    if (isObjectLike(candidate)) {
        return candidate;
    }

    if (typeof process?.env === "object" && process.env !== null) {
        return process.env;
    }

    return null;
}

/**
 * Apply an environment override after normalizing the provided environment map.
 *
 * Shared configuration modules often accept optional `env` overrides so tests
 * can simulate distinct process environments. Centralizing the
 * `resolveEnvironmentMap`/nullish fallback pattern keeps each module focused on
 * its domain logic while ensuring we consistently guard against non-object
 * inputs.
 *
 * @template {{ applyEnvOverride: (env?: NodeJS.ProcessEnv | undefined) => any }} TConfig
 * @param {TConfig | null | undefined} config Configured value wrapper exposing
 *        an `applyEnvOverride` method.
 * @param {NodeJS.ProcessEnv | null | undefined | unknown} env Candidate
 *        environment override supplied by the caller.
 * @returns {ReturnType<TConfig["applyEnvOverride"]>} Result of invoking
 *          `config.applyEnvOverride` with the normalized environment map.
 */
export function applyConfiguredValueEnvOverride(config, env) {
    const applyOverride = assertFunction(
        config?.applyEnvOverride,
        "config.applyEnvOverride"
    );

    const sourceEnv = resolveEnvironmentMap(env);
    if (!sourceEnv) {
        return applyOverride.call(config);
    }

    return applyOverride.call(config, sourceEnv);
}

/**
 * Create a stateful value that can be configured imperatively and via
 * environment overrides.
 *
 * Simplified from the previous multi-parameter context approach. The normalize
 * function receives both the original default and the current value, allowing
 * it to choose the appropriate fallback behavior.
 *
 * @template TValue
 * @param {object} parameters
 * @param {TValue} parameters.defaultValue Baseline value before overrides.
 * @param {string | null | undefined} [parameters.envVar] Environment variable
 *        to read. When omitted, applyEnvOverride is a no-op.
 * @param {(raw: unknown, context: { defaultValue: TValue, previousValue: TValue }) => TValue} parameters.normalize
 *        Function that validates and returns the normalized value.
 * @returns {{
 *     get(): TValue;
 *     set(value: unknown): TValue;
 *     applyEnvOverride(env?: NodeJS.ProcessEnv | null | undefined): TValue;
 * }}
 */
export function createEnvConfiguredValue({
    defaultValue,
    envVar,
    normalize
} = {}) {
    assertFunction(normalize, "normalize");

    let currentValue = defaultValue;

    const set = (value) => {
        currentValue = normalize(value, {
            defaultValue,
            previousValue: currentValue
        });
        return currentValue;
    };

    const get = () => currentValue;

    const applyEnvOverride = envVar
        ? (env) => {
              const sourceEnv = resolveEnvironmentMap(env);
              const rawValue = sourceEnv?.[envVar];
              if (rawValue !== undefined) {
                  set(rawValue);
              }
              return currentValue;
          }
        : () => currentValue;

    return { get, set, applyEnvOverride };
}

/**
 * Create an environment-configured value with automatic fallback on errors.
 *
 * Simplified from the previous wrapper approach. The resolve function attempts
 * normalization and returns null/undefined on failure, triggering fallback.
 * By default, the fallback prefers the previous value over the default.
 *
 * @template TValue
 * @param {object} parameters
 * @param {TValue} parameters.defaultValue Baseline value.
 * @param {string | null | undefined} [parameters.envVar] Environment variable.
 * @param {(raw: unknown, context: { defaultValue: TValue, previousValue: TValue, fallback: TValue }) => TValue | null | undefined} parameters.resolve
 *        Normalizes the value or returns null/undefined to use fallback.
 * @param {(context: { defaultValue: TValue, previousValue: TValue }) => TValue} [parameters.computeFallback]
 *        Optional function to compute the fallback value. Defaults to previousValue ?? defaultValue.
 * @returns {{
 *     get(): TValue;
 *     set(value: unknown): TValue;
 *     applyEnvOverride(env?: NodeJS.ProcessEnv | null | undefined): TValue;
 * }}
 */
export function createEnvConfiguredValueWithFallback({
    defaultValue,
    envVar,
    resolve,
    computeFallback
} = {}) {
    assertFunction(resolve, "resolve");

    const fallbackFactory =
        typeof computeFallback === "function"
            ? computeFallback
            : (context) => context.previousValue ?? context.defaultValue;

    return createEnvConfiguredValue({
        defaultValue,
        envVar,
        normalize: (rawValue, context) => {
            const fallback = fallbackFactory(context);
            try {
                const resolved = resolve(rawValue, {
                    ...context,
                    fallback
                });
                if (resolved != null) {
                    return resolved;
                }
            } catch {
                // Use fallback when resolution throws.
            }
            return fallback;
        }
    });
}
