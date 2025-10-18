import { isErrorWithCode } from "../../../shared/error-utils.js";
import { throwIfAborted } from "./abort-utils.js";

export function isFsErrorCode(error, ...codes) {
    return isErrorWithCode(error, ...codes);
}

export async function listDirectory(fsFacade, directoryPath, options = {}) {
    const signal = options?.signal ?? null;
    throwIfAborted(signal, "Directory listing was aborted.");

    try {
        const entries = await fsFacade.readDir(directoryPath);
        throwIfAborted(signal, "Directory listing was aborted.");
        return entries;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT", "ENOTDIR")) {
            return [];
        }
        throw error;
    }
}

export async function getFileMtime(fsFacade, filePath, options = {}) {
    const signal = options?.signal ?? null;
    throwIfAborted(signal, "File metadata read was aborted.");

    try {
        const stats = await fsFacade.stat(filePath);
        throwIfAborted(signal, "File metadata read was aborted.");
        return typeof stats.mtimeMs === "number" ? stats.mtimeMs : null;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            return null;
        }
        throw error;
    }
}
