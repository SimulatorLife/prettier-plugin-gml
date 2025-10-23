import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { createManualCommandContext } from "../lib/manual-command-context.js";
import { resolveManualCacheRoot } from "../lib/manual/utils.js";
import { buildManualRepositoryEndpoints } from "../lib/manual/repository.js";

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
    assert.equal(context.environment.repoRoot, expectedRepoRoot);
    assert.equal(
        context.environment.defaultCacheRoot,
        resolveManualCacheRoot({ repoRoot: expectedRepoRoot })
    );
    assert.equal(
        context.environment.defaultOutputPath,
        path.join(expectedRepoRoot, "resources", "example.json")
    );
    assert.equal(
        context.environment.defaultManualRawRoot,
        buildManualRepositoryEndpoints().rawRoot
    );
    assert.ok(Object.isFrozen(context.environment));
    assert.ok(Object.isFrozen(context.clients));
    assert.ok(Object.isFrozen(context.operations));
    assert.equal(typeof context.clients.requests.execute, "function");
    assert.equal(
        typeof context.clients.refResolver.resolveManualRef,
        "function"
    );
    assert.equal(
        typeof context.clients.commitResolver.resolveCommitFromRef,
        "function"
    );
    assert.equal(typeof context.clients.fileClient.fetchManualFile, "function");
    assert.equal(typeof context.operations.fetchManualFile, "function");
    assert.equal(typeof context.operations.resolveManualRef, "function");
    assert.equal(typeof context.operations.resolveCommitFromRef, "function");
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
