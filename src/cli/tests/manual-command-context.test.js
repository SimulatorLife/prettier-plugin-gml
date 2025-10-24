import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
    createManualEnvironmentContext,
    createManualAccessContext,
    resolveManualGitHubRequestService,
    resolveManualGitHubRequestExecutor,
    resolveManualGitHubCommitService,
    resolveManualGitHubCommitResolver,
    resolveManualGitHubRefResolver,
    resolveManualGitHubFileClient
} from "../lib/manual/context.js";
import {
    buildManualRepositoryEndpoints,
    resolveManualCacheRoot
} from "../lib/manual/utils.js";

test("createManualAccessContext centralizes manual access defaults", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-gml-identifiers.js")
    ).href;

    const context = createManualAccessContext({
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

test("manual GitHub helpers expose narrow collaborators", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-feather-metadata.js")
    ).href;

    const options = {
        importMetaUrl: commandUrl,
        userAgent: "manual-context-test"
    };

    const requestService = resolveManualGitHubRequestService(options);
    assert.ok(Object.isFrozen(requestService));
    assert.equal(typeof requestService.executeManualRequest, "function");

    const requestExecutor = resolveManualGitHubRequestExecutor(options);
    assert.equal(typeof requestExecutor, "function");

    const commitService = resolveManualGitHubCommitService(options);
    assert.ok(Object.isFrozen(commitService));
    assert.equal(typeof commitService.resolveCommitFromRef, "function");

    const commitResolver = resolveManualGitHubCommitResolver(options);
    assert.equal(typeof commitResolver.resolveCommitFromRef, "function");

    const refResolver = resolveManualGitHubRefResolver(options);
    assert.equal(typeof refResolver.resolveManualRef, "function");

    const fileClient = resolveManualGitHubFileClient(options);
    assert.equal(typeof fileClient.fetchManualFile, "function");
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
        () => createManualAccessContext({ userAgent: "missing-url" }),
        /importMetaUrl must be provided/i
    );

    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-feather-metadata.js")
    ).href;

    assert.throws(
        () => createManualAccessContext({ importMetaUrl: commandUrl }),
        /userAgent must be provided/i
    );
});
