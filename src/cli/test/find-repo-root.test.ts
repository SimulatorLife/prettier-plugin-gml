import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { describe, it } from "node:test";
import { findRepoRoot } from "../src/shared/find-repo-root.js";
import { findRepoRootSync } from "../src/shared/find-repo-root-sync.js";

async function createTemporaryDirectory() {
    const directoryPrefix = path.join(os.tmpdir(), "gml-core-find-repo");
    return fs.mkdtemp(directoryPrefix);
}

async function withTemporaryDirectory(
    callback: (tempDir: string) => Promise<void>
) {
    const tempDir = await createTemporaryDirectory();
    try {
        await callback(tempDir);
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
    }
}

async function createNestedDirectoryWithSentinel(root: string) {
    const nested = path.join(root, "sub", "inner");
    await fs.mkdir(nested, { recursive: true });
    const pkgOuter = path.join(root, "package.json");
    await fs.writeFile(pkgOuter, JSON.stringify({ name: "outer" }), "utf8");
    const agents = path.join(root, "AGENTS.md");
    await fs.writeFile(agents, "# sentinel", "utf8");
    return nested;
}

async function createNestedDirectoryWithPackages(root: string) {
    const nested = path.join(root, "a", "b", "c");
    await fs.mkdir(nested, { recursive: true });
    const pkgInner = path.join(root, "a", "b", "package.json");
    await fs.writeFile(pkgInner, JSON.stringify({ name: "inner" }), "utf8");
    const pkgOuter = path.join(root, "package.json");
    await fs.writeFile(pkgOuter, JSON.stringify({ name: "outer" }), "utf8");
    return nested;
}

void describe("findRepoRoot helper (CLI)", () => {
    void it("prefers repository sentinels (AGENTS.md) over package.json", async () => {
        await withTemporaryDirectory(async (tempDir) => {
            const nested = await createNestedDirectoryWithSentinel(tempDir);
            const resolved = await findRepoRoot(nested);
            assert.strictEqual(resolved, tempDir);
        });
    });

    void it("falls back to the top-most package.json when no sentinel is present", async () => {
        await withTemporaryDirectory(async (tempDir) => {
            const nested = await createNestedDirectoryWithPackages(tempDir);
            const resolved = await findRepoRoot(nested);
            // Top-most package.json should be returned (outermost)
            assert.strictEqual(resolved, tempDir);
        });
    });
});

void describe("findRepoRootSync helper (CLI)", () => {
    void it("prefers repository sentinels (AGENTS.md) over package.json", async () => {
        await withTemporaryDirectory(async (tempDir) => {
            const nested = await createNestedDirectoryWithSentinel(tempDir);
            const resolved = findRepoRootSync(nested);
            assert.strictEqual(resolved, tempDir);
        });
    });

    void it("falls back to the top-most package.json when no sentinel is present", async () => {
        await withTemporaryDirectory(async (tempDir) => {
            const nested = await createNestedDirectoryWithPackages(tempDir);
            const resolved = findRepoRootSync(nested);
            // Top-most package.json should be returned (outermost)
            assert.strictEqual(resolved, tempDir);
        });
    });
});
