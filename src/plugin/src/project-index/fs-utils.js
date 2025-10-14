export function isFsErrorCode(error, ...codes) {
    if (!error || typeof error !== "object") {
        return false;
    }

    const { code } = error;
    if (typeof code !== "string") {
        return false;
    }

    return codes.some((candidate) => candidate === code);
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
