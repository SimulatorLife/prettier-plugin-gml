import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { createManualCommandContext } from "../lib/manual-command-context.js";
import { resolveManualCacheRoot } from "../lib/manual-utils.js";

test("createManualCommandContext centralizes manual command defaults", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-gml-identifiers.js")
    ).href;

    const context = createManualCommandContext({
        importMetaUrl: commandUrl,
        userAgent: "manual-context-test",
        outputFileName: "example.json"
    });

    const expectedRepoRoot = path.resolve("src/cli/commands", "..", "..");
    assert.equal(context.repoRoot, expectedRepoRoot);
    assert.equal(
        context.defaultCacheRoot,
        resolveManualCacheRoot({ repoRoot: expectedRepoRoot })
    );
    assert.equal(
        context.defaultOutputPath,
        path.join(expectedRepoRoot, "resources", "example.json")
    );
    assert.equal(typeof context.manualRequests.execute, "function");
    assert.equal(typeof context.manualReferences.resolveManualRef, "function");
    assert.equal(typeof context.manualFileFetcher.fetchManualFile, "function");
    assert.equal(typeof context.fetchManualFile, "function");
    assert.equal(typeof context.resolveManualRef, "function");
});

test("createManualCommandContext validates required arguments", () => {
    assert.throws(
        () => createManualCommandContext({ userAgent: "missing-url" }),
        /importMetaUrl must be provided/i
    );

    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-feather-metadata.js")
    ).href;

    assert.throws(
        () => createManualCommandContext({ importMetaUrl: commandUrl }),
        /userAgent must be provided/i
    );
});
