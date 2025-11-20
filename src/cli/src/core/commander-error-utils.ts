import { isErrorLike } from "../shared/dependencies.js";

const COMMANDER_ERROR_CODE_PREFIX = "commander.";

export interface CommanderErrorLike extends Error {
    code: string;
    exitCode?: number;
}

export function isCommanderErrorLike(
    value: unknown
): value is CommanderErrorLike {
    if (!isErrorLike(value)) {
        return false;
    }

    const code = typeof value.code === "string" ? value.code : null;
    if (!code || !code.startsWith(COMMANDER_ERROR_CODE_PREFIX)) {
        return false;
    }

    if ("exitCode" in value && typeof value.exitCode !== "number") {
        return false;
    }

    return true;
}
