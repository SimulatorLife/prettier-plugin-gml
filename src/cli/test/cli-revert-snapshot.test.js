import assert from "node:assert/strict";
import { test } from "node:test";

import { SKIP_CLI_RUN_ENV_VAR } from "../src/shared/dependencies.js";

const originalSkipFlag = process.env[SKIP_CLI_RUN_ENV_VAR];
process.env[SKIP_CLI_RUN_ENV_VAR] = "1";

const cliModule = await import("../src/cli.js");
const { readSnapshotContentsForTests, setReadSnapshotFileForTests } =
    cliModule.__test__;

if (originalSkipFlag === undefined) {
    delete process.env[SKIP_CLI_RUN_ENV_VAR];
} else {
    process.env[SKIP_CLI_RUN_ENV_VAR] = originalSkipFlag;
}

test("readSnapshotContents returns null when the snapshot file is missing", async (t) => {
    const missingError = new Error("missing");
    missingError.code = "ENOENT";
    const restoreReader = setReadSnapshotFileForTests(async () => {
        throw missingError;
    });
    t.after(restoreReader);

    const result = await readSnapshotContentsForTests({
        snapshotPath: "/tmp/missing-snapshot"
    });

    assert.strictEqual(result, null);
});

test("readSnapshotContents wraps unexpected read failures with context", async (t) => {
    const underlying = new Error("permission denied");
    underlying.code = "EACCES";
    const restoreReader = setReadSnapshotFileForTests(async () => {
        throw underlying;
    });
    t.after(restoreReader);

    await assert.rejects(
        () =>
            readSnapshotContentsForTests({
                snapshotPath: "/tmp/protected-snapshot"
            }),
        (error) => {
            assert.strictEqual(
                error.message,
                "Failed to read revert snapshot from /tmp/protected-snapshot."
            );
            assert.strictEqual(error.cause, underlying);
            return true;
        }
    );
});
