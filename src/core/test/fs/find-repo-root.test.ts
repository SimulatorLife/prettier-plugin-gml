import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, it } from "node:test";
import { findRepoRoot } from "../../src/fs/find-repo-root.js";
import { findRepoRootSync } from "../../src/fs/find-repo-root-sync.js";

async function createTemporaryDirectory() {
    const directoryPrefix = path.join(os.tmpdir(), "gml-core-find-repo");
    return fs.mkdtemp(directoryPrefix);
}

describe("findRepoRoot helper (core)", () => {
    it("prefers repository sentinels (AGENTS.md) over package.json", async () => {
        const tempDir = await createTemporaryDirectory();
        try {
            const nested = path.join(tempDir, "sub", "inner");
            await fs.mkdir(nested, { recursive: true });
            // Add a package.json at the outer level but a sentinel at the root
            const pkgOuter = path.join(tempDir, "package.json");
            await fs.writeFile(
                pkgOuter,
                JSON.stringify({ name: "outer" }),
                "utf8"
            );
            const agents = path.join(tempDir, "AGENTS.md");
            await fs.writeFile(agents, "# sentinel", "utf8");

            const resolved = await findRepoRoot(nested);
            assert.strictEqual(resolved, tempDir);
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    it("falls back to the top-most package.json when no sentinel is present", async () => {
        const tempDir = await createTemporaryDirectory();
        try {
            const nested = path.join(tempDir, "a", "b", "c");
            await fs.mkdir(nested, { recursive: true });
            const pkgInner = path.join(tempDir, "a", "b", "package.json");
            const pkgOuter = path.join(tempDir, "package.json");
            await fs.writeFile(
                pkgInner,
                JSON.stringify({ name: "inner" }),
                "utf8"
            );
            await fs.writeFile(
                pkgOuter,
                JSON.stringify({ name: "outer" }),
                "utf8"
            );

            const resolved = await findRepoRoot(nested);
            // Top-most package.json should be returned (outermost)
            assert.strictEqual(resolved, tempDir);
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });
});

describe("findRepoRootSync helper (core)", () => {
    it("prefers repository sentinels (AGENTS.md) over package.json", async () => {
        const tempDir = await createTemporaryDirectory();
        try {
            const nested = path.join(tempDir, "sub", "inner");
            await fs.mkdir(nested, { recursive: true });
            // Add a package.json at the outer level but a sentinel at the root
            const pkgOuter = path.join(tempDir, "package.json");
            await fs.writeFile(
                pkgOuter,
                JSON.stringify({ name: "outer" }),
                "utf8"
            );
            const agents = path.join(tempDir, "AGENTS.md");
            await fs.writeFile(agents, "# sentinel", "utf8");

            const resolved = findRepoRootSync(nested);
            assert.strictEqual(resolved, tempDir);
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });

    it("falls back to the top-most package.json when no sentinel is present", async () => {
        const tempDir = await createTemporaryDirectory();
        try {
            const nested = path.join(tempDir, "a", "b", "c");
            await fs.mkdir(nested, { recursive: true });
            const pkgInner = path.join(tempDir, "a", "b", "package.json");
            const pkgOuter = path.join(tempDir, "package.json");
            await fs.writeFile(
                pkgInner,
                JSON.stringify({ name: "inner" }),
                "utf8"
            );
            await fs.writeFile(
                pkgOuter,
                JSON.stringify({ name: "outer" }),
                "utf8"
            );

            const resolved = findRepoRootSync(nested);
            // Top-most package.json should be returned (outermost)
            assert.strictEqual(resolved, tempDir);
        } finally {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
    });
});
