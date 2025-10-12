import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
    deriveCacheKey,
    findProjectRoot,
    PROJECT_MANIFEST_EXTENSION
} from "../project-index/index.js";

function createMockFs(entries) {
    const normalizedEntries = new Map();
    for (const [rawPath, value] of Object.entries(entries)) {
        normalizedEntries.set(path.resolve(rawPath), value);
    }

    return {
        async readDir(targetPath) {
            const normalizedPath = path.resolve(targetPath);
            const node = normalizedEntries.get(normalizedPath);
            if (!node) {
                const error = new Error(`No such directory: ${normalizedPath}`);
                error.code = "ENOENT";
                throw error;
            }
            if (node.type !== "dir") {
                const error = new Error(`Not a directory: ${normalizedPath}`);
                error.code = "ENOTDIR";
                throw error;
            }
            return node.entries.slice();
        },
        async stat(targetPath) {
            const normalizedPath = path.resolve(targetPath);
            const node = normalizedEntries.get(normalizedPath);
            if (!node) {
                const error = new Error(`No such file: ${normalizedPath}`);
                error.code = "ENOENT";
                throw error;
            }
            return { mtimeMs: node.mtimeMs ?? 0 };
        }
    };
}

test("findProjectRoot returns nearest directory containing a manifest", async () => {
    const projectRoot = path.resolve("/workspace/project");
    const filePath = path.join(projectRoot, "scripts", "enemy", "attack.gml");
    const mockFs = createMockFs({
        [projectRoot]: {
            type: "dir",
            entries: ["project.yyp", "scripts"]
        },
        [path.join(projectRoot, "project.yyp")]: {
            type: "file",
            mtimeMs: 10
        },
        [path.join(projectRoot, "scripts")]: {
            type: "dir",
            entries: ["enemy"]
        },
        [path.join(projectRoot, "scripts", "enemy")]: {
            type: "dir",
            entries: ["attack.gml"]
        },
        [filePath]: {
            type: "file",
            mtimeMs: 20
        }
    });

    const result = await findProjectRoot({ filepath: filePath }, mockFs);
    assert.equal(result, projectRoot);
});

test("findProjectRoot returns null when no manifest is discovered", async () => {
    const workingDir = path.resolve("/workspace/random");
    const filePath = path.join(workingDir, "scratch", "notes.gml");
    const mockFs = createMockFs({
        [workingDir]: { type: "dir", entries: ["scratch"] },
        [path.join(workingDir, "scratch")]: {
            type: "dir",
            entries: ["notes.gml"]
        },
        [filePath]: { type: "file", mtimeMs: 5 }
    });

    const result = await findProjectRoot({ filepath: filePath }, mockFs);
    assert.equal(result, null);
});

test("deriveCacheKey changes when manifest mtime changes", async () => {
    const projectRoot = path.resolve("/workspace/project");
    const manifestName = `project${PROJECT_MANIFEST_EXTENSION}`;
    const filePath = path.join(projectRoot, "scripts", "hero.gml");

    const initialFs = createMockFs({
        [projectRoot]: { type: "dir", entries: [manifestName, "scripts"] },
        [path.join(projectRoot, manifestName)]: { type: "file", mtimeMs: 100 },
        [path.join(projectRoot, "scripts")]: {
            type: "dir",
            entries: ["hero.gml"]
        },
        [filePath]: { type: "file", mtimeMs: 200 }
    });

    const updatedFs = createMockFs({
        [projectRoot]: { type: "dir", entries: [manifestName, "scripts"] },
        [path.join(projectRoot, manifestName)]: { type: "file", mtimeMs: 150 },
        [path.join(projectRoot, "scripts")]: {
            type: "dir",
            entries: ["hero.gml"]
        },
        [filePath]: { type: "file", mtimeMs: 200 }
    });

    const firstKey = await deriveCacheKey(
        { filepath: filePath, projectRoot, formatterVersion: "1.0.0" },
        initialFs
    );
    const secondKey = await deriveCacheKey(
        { filepath: filePath, projectRoot, formatterVersion: "1.0.0" },
        updatedFs
    );

    assert.notEqual(firstKey, secondKey);
});

test("deriveCacheKey is stable across manifest ordering", async () => {
    const projectRoot = path.resolve("/workspace/project");
    const filePath = path.join(projectRoot, "scripts", "hero.gml");
    const manifestA = `main${PROJECT_MANIFEST_EXTENSION}`;
    const manifestB = `tools${PROJECT_MANIFEST_EXTENSION}`;

    const fsVariantA = createMockFs({
        [projectRoot]: {
            type: "dir",
            entries: [manifestA, manifestB, "scripts"]
        },
        [path.join(projectRoot, manifestA)]: { type: "file", mtimeMs: 100 },
        [path.join(projectRoot, manifestB)]: { type: "file", mtimeMs: 200 },
        [path.join(projectRoot, "scripts")]: {
            type: "dir",
            entries: ["hero.gml"]
        },
        [filePath]: { type: "file", mtimeMs: 300 }
    });

    const fsVariantB = createMockFs({
        [projectRoot]: {
            type: "dir",
            entries: [manifestB, manifestA, "scripts"]
        },
        [path.join(projectRoot, manifestA)]: { type: "file", mtimeMs: 100 },
        [path.join(projectRoot, manifestB)]: { type: "file", mtimeMs: 200 },
        [path.join(projectRoot, "scripts")]: {
            type: "dir",
            entries: ["hero.gml"]
        },
        [filePath]: { type: "file", mtimeMs: 300 }
    });

    const firstKey = await deriveCacheKey(
        { filepath: filePath, projectRoot, formatterVersion: "1.0.0" },
        fsVariantA
    );
    const secondKey = await deriveCacheKey(
        { filepath: filePath, projectRoot, formatterVersion: "1.0.0" },
        fsVariantB
    );

    assert.equal(firstKey, secondKey);
});
