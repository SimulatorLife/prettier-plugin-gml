import process from "node:process";

import { toTrimmedString } from "../dependencies.js";

export const SKIP_CLI_RUN_ENV_VAR = "PRETTIER_PLUGIN_GML_SKIP_CLI_RUN";
const SKIP_ENABLED_VALUE = "1";
const DEFAULT_RESOLUTION_MESSAGE =
    "Clear the environment variable to continue.";

function resolveEnvironment(env) {
    if (env && typeof env === "object") {
        return env;
    }

    if (typeof process?.env === "object" && process.env !== null) {
        return process.env;
    }

    return null;
}

export function isCliRunSkipped(env) {
    const sourceEnv = resolveEnvironment(env);
    if (!sourceEnv) {
        return false;
    }

    const flagValue = toTrimmedString(sourceEnv[SKIP_CLI_RUN_ENV_VAR]);
    return flagValue === SKIP_ENABLED_VALUE;
}

export function createCliRunSkippedError(
    actionDescription,
    { resolution } = {}
) {
    const normalizedAction = toTrimmedString(actionDescription);
    const actionLabel =
        normalizedAction.length > 0 ? normalizedAction : "perform this action";

    const normalizedResolution = toTrimmedString(resolution);
    const resolutionMessage =
        normalizedResolution.length > 0
            ? normalizedResolution
            : DEFAULT_RESOLUTION_MESSAGE;

    return new Error(
        `Cannot ${actionLabel} while ${SKIP_CLI_RUN_ENV_VAR}=${SKIP_ENABLED_VALUE}. ${resolutionMessage}`
    );
}
