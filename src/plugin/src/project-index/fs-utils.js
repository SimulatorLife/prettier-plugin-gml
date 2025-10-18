import { isErrorWithCode } from "../../../shared/error-utils.js";

export function isFsErrorCode(error, ...codes) {
    return isErrorWithCode(error, ...codes);
}

export async function listDirectory(fsFacade, directoryPath) {
    try {
        const entries = await fsFacade.readDir(directoryPath);

        if (Array.isArray(entries)) {
            return entries;
        }

        if (entries == null) {
            return [];
        }

        return typeof entries[Symbol.iterator] === "function"
            ? Array.from(entries)
            : [];
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT", "ENOTDIR")) {
            return [];
        }
        throw error;
    }
}

export async function getFileMtime(fsFacade, filePath) {
    try {
        const stats = await fsFacade.stat(filePath);
        return typeof stats.mtimeMs === "number" ? stats.mtimeMs : null;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            return null;
        }
        throw error;
    }
}
