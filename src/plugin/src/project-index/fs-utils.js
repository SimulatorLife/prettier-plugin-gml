import { toArrayFromIterable } from "../../../shared/array-utils.js";
import { isErrorWithCode } from "../../../shared/error-utils.js";
import {
    resolveAbortSignalFromOptions,
    throwIfAborted
} from "../../../shared/abort-utils.js";

export function isFsErrorCode(error, ...codes) {
    return isErrorWithCode(error, ...codes);
}

export async function listDirectory(fsFacade, directoryPath, options = {}) {
    const abortMessage = "Directory listing was aborted.";
    const signal = resolveAbortSignalFromOptions(options, {
        fallbackMessage: abortMessage
    });
    throwIfAborted(signal, abortMessage);

    try {
        const entries = await fsFacade.readDir(directoryPath);
        throwIfAborted(signal, abortMessage);

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
    const signal = resolveAbortSignalFromOptions(options, {
        fallbackMessage: abortMessage
    });
    throwIfAborted(signal, abortMessage);

    try {
        const stats = await fsFacade.stat(filePath);
        throwIfAborted(signal, abortMessage);
        return typeof stats.mtimeMs === "number" ? stats.mtimeMs : null;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            return null;
        }
        throw error;
    }
}
