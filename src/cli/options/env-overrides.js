import { CliUsageError } from "../cli-errors.js";
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
