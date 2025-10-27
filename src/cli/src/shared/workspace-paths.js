import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Centralized workspace path helpers for the CLI package. Several modules
 * previously re-derived the same directory hierarchy (module directory →
 * package → workspace → repository) which scattered the `REPO_ROOT`
 * calculation across performance tooling and the plugin runtime. Keeping the
 * resolution logic in one place ensures every caller works with the same
 * canonical directories and avoids subtle drift when files relocate.
 */

const SHARED_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const CLI_SRC_DIRECTORY = path.resolve(SHARED_DIRECTORY, "..");
const CLI_PACKAGE_DIRECTORY = path.resolve(CLI_SRC_DIRECTORY, "..");
const WORKSPACE_SOURCE_DIRECTORY = path.resolve(CLI_PACKAGE_DIRECTORY, "..");
const REPO_ROOT = path.resolve(WORKSPACE_SOURCE_DIRECTORY, "..");

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
 * @param {...string} segments Path segments to resolve from the repo root.
 * @returns {string} Absolute path anchored at the repository root.
 */
export function resolveFromRepoRoot(...segments) {
    return path.resolve(REPO_ROOT, ...segments);
}
