import { CliUsageError } from "./cli-errors.js";
import { isNonEmptyString } from "../../shared/string-utils.js";

const DEFAULT_SOURCE = "env";

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
        const usage =
            typeof getUsage === "function" ? getUsage() : (getUsage ?? null);
        const fallbackMessage = envVar
            ? `Invalid value provided for ${envVar}.`
            : "Invalid environment variable value provided.";
        const message =
            error instanceof Error &&
            isNonEmptyString(error.message) &&
            !/^error\b/i.test(error.message.trim())
                ? error.message
                : fallbackMessage;

        const cliError = new CliUsageError(message, { usage });
        cliError.cause = error instanceof Error ? error : undefined;
        throw cliError;
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
 * @param {() => string | string | null} [parameters.getUsage] Usage provider
 *                                                             used when an
 *                                                             override fails
 *                                                             without its own.
 */
export function applyEnvOptionOverrides({ command, env, overrides, getUsage }) {
    if (!Array.isArray(overrides)) {
        throw new TypeError("overrides must be provided as an array");
    }

    for (const override of overrides) {
        if (!override || typeof override !== "object") {
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
