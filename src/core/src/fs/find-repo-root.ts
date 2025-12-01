import fs from "node:fs/promises";
import path from "node:path";

/**
 * Walk upward from startDir until a repo sentinel or top-most package.json is found.
 * Prefer AGENTS.md or a .git directory. If none are present, return the top-most
 * package.json ancestor.
 */
export async function findRepoRoot(startDir: string): Promise<string> {
    let dir = startDir;
    let lastPackageJson: string | null = null;

    for (;;) {
        const agentPath = path.join(dir, "AGENTS.md");
        try {
            const agentStat = await fs.stat(agentPath);
            if (agentStat.isFile()) {
                return dir;
            }
        } catch {
            // ignore
        }

        const gitPath = path.join(dir, ".git");
        try {
            const gitStat = await fs.stat(gitPath);
            if (gitStat.isDirectory()) {
                return dir;
            }
        } catch {
            // ignore
        }

        const candidate = path.join(dir, "package.json");
        try {
            await fs.stat(candidate);
            lastPackageJson = dir;
        } catch {
            // ignore
        }

        const parent = path.dirname(dir);
        if (parent === dir) {
            if (lastPackageJson) return lastPackageJson;
            throw new Error(
                "Repository root not found while resolving test paths"
            );
        }

        dir = parent;
    }
}
