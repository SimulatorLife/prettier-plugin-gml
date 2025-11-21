import { isErrorLike } from "../shared/dependencies.js";
import type { CommanderCommandLike } from "./commander-types.js";

const COMMANDER_ERROR_CODE_PREFIX = "commander.";

export interface CommanderErrorLike extends Error {
    code: string;
    exitCode?: number;
    command?: CommanderCommandLike;
}

export function isCommanderErrorLike(
    value: unknown
): value is CommanderErrorLike {
    if (!isErrorLike(value)) {
        return false;
    }

    const candidate = value as CommanderErrorLike;
    const code = typeof candidate.code === "string" ? candidate.code : null;
    if (!code || !code.startsWith(COMMANDER_ERROR_CODE_PREFIX)) {
        return false;
    }

    if (
        "exitCode" in candidate &&
        typeof candidate.exitCode !== "number"
    ) {
        return false;
    }

    return true;
}
