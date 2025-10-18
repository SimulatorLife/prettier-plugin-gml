import { isErrorLike } from "../../shared/utils/capability-probes.js";

const COMMANDER_ERROR_CODE_PREFIX = "commander.";

export function isCommanderErrorLike(value) {
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
