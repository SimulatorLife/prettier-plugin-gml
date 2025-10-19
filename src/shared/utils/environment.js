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

    const sourceEnv =
        env && typeof env === "object"
            ? env
            : typeof process?.env === "object" && process.env !== null
              ? process.env
              : null;

    if (!sourceEnv) {
        return;
    }

    const rawValue = sourceEnv[variable];

    if (rawValue === undefined && !includeUndefined) {
        return;
    }

    applyValue(rawValue);
}
