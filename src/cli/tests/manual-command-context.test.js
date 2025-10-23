import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
    createManualEnvironmentContext,
    createManualManualAccessContext,
    createManualGitHubExecutionContext
} from "../lib/manual/command-context.js";
import {
    buildManualRepositoryEndpoints,
    resolveManualCacheRoot
} from "../lib/manual/utils.js";

test("createManualManualAccessContext centralizes manual access defaults", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-gml-identifiers.js")
    ).href;

    const context = createManualManualAccessContext({
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
    assert.ok(Object.isFrozen(context.files));
    assert.ok(Object.isFrozen(context.refs));
    assert.equal(typeof context.files.fetchManualFile, "function");
    assert.equal(typeof context.refs.resolveManualRef, "function");
});

test("createManualGitHubExecutionContext exposes execution helpers", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-feather-metadata.js")
    ).href;

    const context = createManualGitHubExecutionContext({
        importMetaUrl: commandUrl,
        userAgent: "manual-context-test"
    });

    assert.ok(Object.isFrozen(context.clients));
    assert.ok(Object.isFrozen(context.requests));
    assert.ok(Object.isFrozen(context.commits));
    assert.equal(typeof context.clients.request, "function");
    assert.equal(
        context.clients.request,
        context.requests.executeManualRequest
    );
    assert.equal(
        typeof context.clients.commitResolver.resolveCommitFromRef,
        "function"
    );
    assert.equal(
        typeof context.clients.refResolver.resolveManualRef,
        "function"
    );
    assert.equal(typeof context.clients.fileClient.fetchManualFile, "function");
    assert.equal(typeof context.commits.resolveCommitFromRef, "function");
});

test("createManualEnvironmentContext isolates repository metadata", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-feather-metadata.js")
    ).href;

    const context = createManualEnvironmentContext({
        importMetaUrl: commandUrl,
        userAgent: "manual-context-test"
    });

    assert.ok(Object.isFrozen(context.environment));
    assert.equal(
        context.environment.repoRoot,
        path.resolve("src/cli/commands", "..", "..")
    );
});

test("manual command context builders validate required arguments", () => {
    assert.throws(
        () => createManualManualAccessContext({ userAgent: "missing-url" }),
        /importMetaUrl must be provided/i
    );

    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-feather-metadata.js")
    ).href;

    assert.throws(
        () => createManualManualAccessContext({ importMetaUrl: commandUrl }),
        /userAgent must be provided/i
    );
});
