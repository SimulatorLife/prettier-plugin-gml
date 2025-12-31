import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findRepoRootSync } from "./find-repo-root-sync.js";

/**
 * Centralized workspace path helpers for the CLI package. Several modules
 * previously re-derived the same directory hierarchy (module directory →
 * package → workspace → repository) which scattered the `REPO_ROOT`
 * calculation across performance tooling and the plugin runtime. Keeping the
 * resolution logic in one place ensures every caller works with the same
 * canonical directories and avoids subtle drift when files relocate.
 */

const SHARED_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

function readPackageName(candidateDirectory: string): string | null {
    try {
        const packageJsonPath = path.resolve(
            candidateDirectory,
            "package.json"
        );
        const contents = fs.readFileSync(packageJsonPath, "utf8");
        const parsed = JSON.parse(contents) as { name?: string };
        return typeof parsed.name === "string" ? parsed.name : null;
    } catch {
        return null;
    }
}

function resolveCliPackageDirectory(startDirectory: string): string {
    let current = startDirectory;

    for (let depth = 0; depth < 6; depth += 1) {
        const packageName = readPackageName(current);
        if (packageName === "@gml-modules/cli") {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }

    return path.resolve(startDirectory, "..");
}

const CLI_PACKAGE_DIRECTORY = resolveCliPackageDirectory(SHARED_DIRECTORY);
const CLI_SRC_DIRECTORY = path.resolve(CLI_PACKAGE_DIRECTORY, "src");
const WORKSPACE_SOURCE_DIRECTORY = path.resolve(CLI_PACKAGE_DIRECTORY, "..");
const REPO_ROOT = findRepoRootSync(SHARED_DIRECTORY);

export {
    CLI_SRC_DIRECTORY,
    CLI_PACKAGE_DIRECTORY,
    WORKSPACE_SOURCE_DIRECTORY,
    REPO_ROOT
};

/**
 * Resolve a path relative to the repository root using the shared directory
 * hierarchy derived above. Modules that frequently join segments onto the
 * repo root can delegate to this helper to keep their intent obvious.
 *
 * @param segments Path segments to resolve from the repo root.
 * @returns Absolute path anchored at the repository root.
 */
export function resolveFromRepoRoot(...segments: Array<string>): string {
    return path.resolve(REPO_ROOT, ...segments);
}
