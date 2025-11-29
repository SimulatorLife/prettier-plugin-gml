import fs from "node:fs";
import path from "node:path";

import { walkAncestorDirectories } from "./path.js";

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
        try {
            const agentPath = path.join(dir, "AGENTS.md");
            if (fs.existsSync(agentPath) && fs.statSync(agentPath).isFile()) {
                return dir;
            }
        } catch {
            // ignore stat failures
        }

        try {
            const gitPath = path.join(dir, ".git");
            if (fs.existsSync(gitPath) && fs.statSync(gitPath).isDirectory()) {
                return dir;
            }
        } catch {
            // ignore stat failures
        }

        try {
            const candidate = path.join(dir, "package.json");
            if (fs.existsSync(candidate)) {
                lastPackageJson = dir;
            }
        } catch {
            // ignore
        }
    }

    if (lastPackageJson) return lastPackageJson;
    throw new Error("Repository root not found while resolving test paths");
}
