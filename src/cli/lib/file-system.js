import fs from "node:fs/promises";

/**
 * Ensure that a directory exists, creating it if necessary.
 *
 * @param {string} dirPath Path to the directory to ensure.
 * @returns {Promise<void>} Resolves when the directory exists.
 */
export async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}
