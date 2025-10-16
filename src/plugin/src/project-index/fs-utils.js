export function isFsErrorCode(error, ...codes) {
    if (!error || typeof error !== "object") {
        return false;
    }

    const { code } = error;
    if (typeof code !== "string") {
        return false;
    }

    return codes.includes(code);
}

/**
 * @param {import("./fs-facade.js").ProjectIndexDirectoryReader} directoryReader
 * @param {string} directoryPath
 */
export async function listDirectory(directoryReader, directoryPath) {
    try {
        return await directoryReader.readDir(directoryPath);
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT", "ENOTDIR")) {
            return [];
        }
        throw error;
    }
}

/**
 * @param {import("./fs-facade.js").ProjectIndexFileStatReader} statReader
 * @param {string} filePath
 */
export async function getFileMtime(statReader, filePath) {
    try {
        const stats = await statReader.stat(filePath);
        return typeof stats.mtimeMs === "number" ? stats.mtimeMs : null;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            return null;
        }
        throw error;
    }
}
