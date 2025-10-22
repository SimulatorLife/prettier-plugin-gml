import { assertFunction } from "./object.js";
import { assertNonEmptyString } from "./string.js";

/**
 * Apply an environment-driven override by invoking {@link applyValue} when the
 * referenced variable is defined.
 *
 * Centralizes the defensive plumbing shared by CLI utilities and the project
 * index so future overrides can opt into consistent validation and fallback
 * behavior without repeating boilerplate guards.
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

function resolveEnvironmentMap(candidate) {
    if (candidate && typeof candidate === "object") {
        return candidate;
    }

    if (typeof process?.env === "object" && process.env !== null) {
        return process.env;
    }

    return null;
}

/**
 * Create a stateful value that can be configured imperatively and via
 * environment overrides.
 *
 * The helper centralizes the common pattern of tracking a configurable
 * default, exposing getters/setters, and wiring an environment variable that
 * drives the fallback. Callers provide a {@link normalize} function responsible
 * for validating incoming values and returning the updated state. The function
 * receives the raw value along with the baseline default and the previous
 * configured value so normalization logic can make context-aware decisions
 * without closing over module-level variables.
 *
 * @template TValue
 * @param {object} parameters
 * @param {TValue} parameters.defaultValue Baseline value returned before any
 *        overrides are applied.
 * @param {string | null | undefined} [parameters.envVar] Environment variable
 *        that triggers the override when defined. When omitted we intentionally
 *        skip the environment plumbing so {@link applyEnvOverride} simply
 *        returns the in-memory value. This keeps callers that do not expose an
 *        env toggle (for example, tests or programmatic embeds) from
 *        accidentally reading `process.env` or mutating the state, which would
 *        blur the boundary between runtime configuration and defaults.
 * @param {(raw: unknown, context: {
 *     defaultValue: TValue;
 *     previousValue: TValue;
 * }) => TValue} parameters.normalize Function that validates the new value and
 *        returns the configured result.
 * @param {typeof applyEnvironmentOverride} [parameters.applyOverride]
 *        Override for the environment override helper, primarily used in
 *        testing.
 * @returns {{
 *     get(): TValue;
 *     set(value: unknown): TValue;
 *     applyEnvOverride(env?: NodeJS.ProcessEnv | null | undefined): TValue;
 * }} Utility methods for interacting with the configurable value.
 */
export function createEnvConfiguredValue({
    defaultValue,
    envVar,
    normalize,
    applyOverride = applyEnvironmentOverride
} = {}) {
    assertFunction(normalize, "normalize");

    let currentValue = defaultValue;

    function set(value) {
        currentValue = normalize(value, {
            defaultValue,
            previousValue: currentValue
        });

        return currentValue;
    }

    function get() {
        return currentValue;
    }

    function applyEnvOverride(env) {
        if (!envVar) {
            return currentValue;
        }

        applyOverride({
            env,
            envVar,
            applyValue: (rawValue) => {
                set(rawValue);
            }
        });

        return currentValue;
    }

    return { get, set, applyEnvOverride };
}
