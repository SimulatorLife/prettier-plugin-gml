import { toArrayFromIterable } from "../../../shared/array-utils.js";
import { isErrorWithCode } from "../../../shared/error-utils.js";
import { createAbortGuard } from "./abort-guard.js";

export function isFsErrorCode(error, ...codes) {
    return isErrorWithCode(error, ...codes);
}

export async function listDirectory(fsFacade, directoryPath, options = {}) {
    const abortMessage = "Directory listing was aborted.";
    const { ensureNotAborted } = createAbortGuard(options, {
        fallbackMessage: abortMessage
    });

    try {
        const entries = await fsFacade.readDir(directoryPath);
        ensureNotAborted();

        return toArrayFromIterable(entries);
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT", "ENOTDIR")) {
            return [];
        }
        throw error;
    }
}

export async function getFileMtime(fsFacade, filePath, options = {}) {
    const abortMessage = "File metadata read was aborted.";
    const { ensureNotAborted } = createAbortGuard(options, {
        fallbackMessage: abortMessage
    });

    try {
        const stats = await fsFacade.stat(filePath);
        ensureNotAborted();
        return typeof stats.mtimeMs === "number" ? stats.mtimeMs : null;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            return null;
        }
        throw error;
    }
}
