import fs from "node:fs/promises";
import path from "node:path";

import { Core } from "@gml-modules/core";

/**
 * Check if a path exists and optionally satisfies a predicate.
 * Returns true only if the path exists and the predicate passes; returns false
 * for any error including non-existent paths or permission issues.
 */
async function pathExists(
    filePath: string,
    predicate?: (stat: Awaited<ReturnType<typeof fs.stat>>) => boolean
): Promise<boolean> {
    try {
        const stat = await fs.stat(filePath);
        return predicate ? predicate(stat) : true;
    } catch {
        return false;
    }
}

/**
 * Walk upward from startDir until a repo sentinel or top-most package.json is found.
 * Prefer AGENTS.md or a .git directory. If none are present, return the top-most
 * package.json ancestor.
 */
export async function findRepoRoot(startDir: string): Promise<string> {
    let lastPackageJson: string | null = null;

    for (const dir of Core.walkAncestorDirectories(startDir)) {
        if (await pathExists(path.join(dir, "AGENTS.md"), (s) => s.isFile())) {
            return dir;
        }

        if (await pathExists(path.join(dir, ".git"), (s) => s.isDirectory())) {
            return dir;
        }

        if (await pathExists(path.join(dir, "package.json"))) {
            lastPackageJson = dir;
        }
    }

    if (lastPackageJson) {
        return lastPackageJson;
    }

    throw new Error("Repository root not found while resolving test paths");
}
