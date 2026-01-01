import fs from "node:fs";
import path from "node:path";

import { walkAncestorDirectories } from "./path.js";

/**
 * Check if a path exists and optionally satisfies a predicate.
 * Returns true only if the path exists and the predicate passes; returns false
 * for any error including non-existent paths or permission issues.
 */
function pathExistsSync(
    filePath: string,
    predicate?: (stat: ReturnType<typeof fs.statSync>) => boolean
): boolean {
    try {
        const stat = fs.statSync(filePath);
        return predicate ? predicate(stat) : true;
    } catch {
        return false;
    }
}

/**
 * Synchronous variant of findRepoRoot that mirrors the async helper in behavior
 * but uses blocking fs calls. The function searches parents starting from the
 * provided directory and prefers AGENTS.md or a .git directory sentinel. If
 * none are found, the top-most package.json ancestor is returned. If nothing
 * matches, an error is thrown.
 */
export function findRepoRootSync(startDir: string): string {
    let lastPackageJson: string | null = null;

    for (const dir of walkAncestorDirectories(startDir)) {
        if (pathExistsSync(path.join(dir, "AGENTS.md"), (s) => s.isFile())) {
            return dir;
        }

        if (pathExistsSync(path.join(dir, ".git"), (s) => s.isDirectory())) {
            return dir;
        }

        if (pathExistsSync(path.join(dir, "package.json"))) {
            lastPackageJson = dir;
        }
    }

    if (lastPackageJson) {
        return lastPackageJson;
    }

    throw new Error("Repository root not found while resolving test paths");
}
