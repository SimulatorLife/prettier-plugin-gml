import fs from "node:fs/promises";

/**
 * Ensure that a directory exists, creating it if necessary.
 * @param {string} dirPath - The path to the directory to ensure.
 */
export async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}
