import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";

import { DEFAULT_WRITE_ACCESS_MODE } from "../src/identifier-case/common.js";
import { __private__ } from "../src/identifier-case/asset-rename-executor.js";

const { ensureWritableDirectory, ensureWritableFile } = __private__;

describe("asset rename executor filesystem utilities", () => {
    it("skips directory creation when accessSync allows writing", () => {
        const calls = [];
        const fsFacade = {
            accessSync(targetPath, mode) {
                calls.push({ targetPath, mode });
            },
            mkdirSync() {
                assert.fail(
                    "mkdirSync should not be invoked when directory is accessible"
                );
            }
        };

        ensureWritableDirectory(fsFacade, "/tmp/demo");

        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].targetPath, "/tmp/demo");
        assert.strictEqual(calls[0].mode, DEFAULT_WRITE_ACCESS_MODE);
    });

    it("uses existsSync fallback when accessSync is unavailable", () => {
        let mkdirCalled = false;
        const fsFacade = {
            existsSync(targetPath) {
                assert.strictEqual(targetPath, "/tmp/demo");
                return true;
            },
            mkdirSync() {
                mkdirCalled = true;
            }
        };

        ensureWritableDirectory(fsFacade, "/tmp/demo");

        assert.strictEqual(mkdirCalled, false);
    });

    it("skips directory creation when file is already accessible", () => {
        let mkdirCalled = false;
        const fsFacade = {
            statSync(targetPath) {
                assert.strictEqual(targetPath, "/tmp/demo/file.yy");
                return {};
            },
            mkdirSync() {
                mkdirCalled = true;
            }
        };

        ensureWritableFile(fsFacade, "/tmp/demo/file.yy");

        assert.strictEqual(mkdirCalled, false);
    });

    it("ensures the parent directory exists when a file is missing", () => {
        const ensuredDirectories = [];
        const fsFacade = {
            statSync() {
                const error = new Error("missing file");
                error.code = "ENOENT";
                throw error;
            },
            existsSync() {
                return false;
            },
            mkdirSync(targetPath) {
                ensuredDirectories.push(targetPath);
            }
        };

        const filePath = path.join("/tmp", "demo", "file.yy");

        ensureWritableFile(fsFacade, filePath);

        assert.deepStrictEqual(ensuredDirectories, [path.join("/tmp", "demo")]);
    });
});
