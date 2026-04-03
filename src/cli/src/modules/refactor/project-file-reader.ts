import * as fs from "node:fs";
import path from "node:path";

/**
 * Reads a project file (resolved relative to `projectRoot`) as UTF-8 text.
 *
 * Returns `null` when the file does not exist or cannot be read. This is the
 * single source of truth for the "resolve → existsSync → readFileSync"
 * pattern that recurs across the refactor modules.
 *
 * @param projectRoot Absolute path to the project root directory.
 * @param filePath    Path to the file, resolved relative to `projectRoot`.
 * @returns The UTF-8 text content of the file, or `null` on any failure.
 */
export function readProjectFileText(projectRoot: string, filePath: string): string | null {
    const absolutePath = path.resolve(projectRoot, filePath);
    if (!fs.existsSync(absolutePath)) {
        return null;
    }

    try {
        return fs.readFileSync(absolutePath, "utf8");
    } catch {
        return null;
    }
}
