import assert from "node:assert/strict";
import test from "node:test";

import { getFileMtime, listDirectory } from "../src/fs/index.js";

test("listDirectory snapshots iterable results", async () => {
    const source = ["alpha", "beta"];
    const facade = {
        readDir: async () => source
    };

    const result = await listDirectory(facade, "/project");

    assert.deepEqual(result, source);
    assert.notStrictEqual(result, source);

    result.push("gamma");
    assert.deepEqual(source, ["alpha", "beta"]);
});

test("listDirectory returns an empty array for missing directories", async () => {
    const error = new Error("missing") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    const facade = {
        readDir: async () => {
            throw error;
        }
    };

    const entries = await listDirectory(facade, "/missing");

    assert.deepEqual(entries, []);
});

test("getFileMtime resolves to numeric mtimes when available", async () => {
    const facade = {
        stat: async () => ({ mtimeMs: 123 })
    };

    assert.strictEqual(
        await getFileMtime(facade, "/project/manifest.json"),
        123
    );
});

test("getFileMtime returns null when file is missing", async () => {
    const error = new Error("deleted") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    const facade = {
        stat: async () => {
            throw error;
        }
    };

    assert.strictEqual(
        await getFileMtime(facade, "/project/missing.json"),
        null
    );
});
