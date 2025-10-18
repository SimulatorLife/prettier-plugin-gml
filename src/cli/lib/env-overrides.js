import { CliUsageError } from "./cli-errors.js";
import { isNonEmptyString, isObjectLike } from "../../shared/utils.js";
import { isErrorLike } from "../../shared/utils/capability-probes.js";

const DEFAULT_SOURCE = "env";

function resolveUsage(getUsage) {
    if (typeof getUsage === "function") {
        return getUsage();
    }

    return getUsage ?? null;
}

function createOverrideError({ error, envVar, getUsage }) {
    const usage = resolveUsage(getUsage);
    const fallbackMessage = envVar
        ? `Invalid value provided for ${envVar}.`
        : "Invalid environment variable value provided.";
    const message =
        isErrorLike(error) &&
        isNonEmptyString(error.message) &&
        !/^error\b/i.test(error.message.trim())
            ? error.message
            : fallbackMessage;

    const cliError = new CliUsageError(message, { usage });
    cliError.cause = isErrorLike(error) ? error : undefined;
    return cliError;
}

/**
 * Apply an environment-driven override to a Commander option.
 *
 * Normalises optional hooks and error handling so individual overrides can
 * focus on the mapping logic instead of defensive plumbing.
 *
 * @param {object} parameters
 * @param {import("commander").Command} parameters.command Command receiving
 *                                                          the override.
 * @param {NodeJS.ProcessEnv | undefined} parameters.env Environment variables
 *                                                       to read from.
 * @param {string} parameters.envVar Environment variable powering the
 *                                   override.
 * @param {string} parameters.optionName Commander option to update.
 * @param {(value: string) => unknown} [parameters.resolveValue] Mapper invoked
 *        before the option is set.
 * @param {string} [parameters.source="env"] Source label forwarded to
 *        Commander.
 * @param {(() => string) | string | null} [parameters.getUsage] Optional usage
 *        helper displayed when validation fails.
 */
export function applyEnvOptionOverride({
    command,
    env,
    envVar,
    optionName,
    resolveValue,
    source = DEFAULT_SOURCE,
    getUsage
}) {
    const rawValue = env?.[envVar];
    if (rawValue === undefined) {
        return;
    }

    const resolver =
        typeof resolveValue === "function" ? resolveValue : (value) => value;

    try {
        const resolved = resolver(rawValue);
        command.setOptionValueWithSource(optionName, resolved, source);
    } catch (error) {
        throw createOverrideError({ error, envVar, getUsage });
    }
}

/**
 * Apply multiple environment-driven overrides with shared error handling.
 *
 * Reduces repetition when commands expose several environment variables that
 * need to map onto commander options by centralising the iteration and
 * fallback usage wiring.
 *
 * @param {object} parameters
 * @param {import("commander").Command} parameters.command Command receiving
 *                                                          the overrides.
 * @param {NodeJS.ProcessEnv | undefined} parameters.env Environment variables
 *                                                       to read from.
 * @param {Array<object>} parameters.overrides Override descriptors forwarded to
 *                                             {@link applyEnvOptionOverride}.
 * @param {(() => string) | string | null} [parameters.getUsage] Usage provider
 *                                                             used when an
 *                                                             override fails
 *                                                             without its own.
 */
export function applyEnvOptionOverrides({ command, env, overrides, getUsage }) {
    if (!Array.isArray(overrides)) {
        throw new TypeError("overrides must be provided as an array");
    }

    for (const override of overrides) {
        if (!isObjectLike(override)) {
            continue;
        }

        const { getUsage: overrideGetUsage, ...options } = override;

        applyEnvOptionOverride({
            command,
            env,
            getUsage: overrideGetUsage ?? getUsage,
            ...options
        });
    }
}
