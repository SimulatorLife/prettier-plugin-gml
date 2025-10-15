import { CliUsageError } from "../cli-errors.js";
import { isNonEmptyString } from "../../shared/string-utils.js";

const DEFAULT_SOURCE = "env";

function defaultResolve(value) {
    return value;
}

function resolveUsage(getUsage) {
    if (typeof getUsage === "function") {
        return getUsage();
    }

    return getUsage ?? null;
}

function normalizeErrorMessage(error, envVar) {
    if (error instanceof Error) {
        const { message } = error;
        if (isNonEmptyString(message)) {
            return message;
        }
    }

    return envVar
        ? `Invalid value provided for ${envVar}.`
        : "Invalid environment variable value provided.";
}

export function applyEnvOptionOverride({
    command,
    env,
    envVar,
    optionName,
    resolveValue = defaultResolve,
    source = DEFAULT_SOURCE,
    getUsage
}) {
    if (!env || env[envVar] === undefined) {
        return;
    }

    try {
        const resolved = resolveValue(env[envVar]);
        command.setOptionValueWithSource(optionName, resolved, source);
    } catch (error) {
        const usage = resolveUsage(getUsage);
        const message = normalizeErrorMessage(error, envVar);
        const cliError = new CliUsageError(message, { usage });
        cliError.cause = error instanceof Error ? error : undefined;
        throw cliError;
    }
}
