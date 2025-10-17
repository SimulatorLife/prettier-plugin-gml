import { isErrorWithCode } from "../../../shared/error-utils.js";

export function isFsErrorCode(error, ...codes) {
    return isErrorWithCode(error, ...codes);
}

export async function listDirectory(fsFacade, directoryPath) {
    try {
        return await fsFacade.readDir(directoryPath);
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
