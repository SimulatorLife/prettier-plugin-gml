import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
    createManualEnvironmentContext,
    createManualAccessContexts,
    createManualFileAccessContext,
    createManualReferenceAccessContext,
    resolveManualGitHubRequestService,
    resolveManualGitHubRequestExecutor,
    resolveManualGitHubCommitService,
    resolveManualGitHubCommitResolver,
    resolveManualGitHubRefResolver,
    resolveManualGitHubFileClient
} from "../features/manual/context.js";
import {
    buildManualRepositoryEndpoints,
    resolveManualCacheRoot
} from "../features/manual/utils.js";

test("createManualAccessContexts centralizes manual access defaults", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-gml-identifiers.js")
    ).href;

    const { environment, fileAccess, referenceAccess } =
        createManualAccessContexts({
            importMetaUrl: commandUrl,
            userAgent: "manual-context-test",
            outputFileName: "example.json"
        });

    const expectedRepoRoot = path.resolve("src/cli/commands", "..", "..");
    assert.equal(environment.repoRoot, expectedRepoRoot);
    assert.equal(
        environment.defaultCacheRoot,
        resolveManualCacheRoot({ repoRoot: expectedRepoRoot })
    );
    assert.equal(
        environment.defaultOutputPath,
        path.join(expectedRepoRoot, "resources", "example.json")
    );
    assert.equal(
        environment.defaultManualRawRoot,
        buildManualRepositoryEndpoints().rawRoot
    );
    assert.ok(Object.isFrozen(environment));
    assert.ok(Object.isFrozen(fileAccess));
    assert.ok(Object.isFrozen(referenceAccess));
    assert.equal(fileAccess.environment, environment);
    assert.equal(referenceAccess.environment, environment);
    assert.equal(typeof fileAccess.files.fetchManualFile, "function");
    assert.equal(typeof referenceAccess.refs.resolveManualRef, "function");
});

test("manual access helpers expose focused contexts", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-feather-metadata.js")
    ).href;

    const fileAccess = createManualFileAccessContext({
        importMetaUrl: commandUrl,
        userAgent: "manual-context-test"
    });

    const referenceAccess = createManualReferenceAccessContext({
        importMetaUrl: commandUrl,
        userAgent: "manual-context-test"
    });

    assert.deepStrictEqual(fileAccess.environment, referenceAccess.environment);
    assert.equal(typeof fileAccess.files.fetchManualFile, "function");
    assert.equal(typeof referenceAccess.refs.resolveManualRef, "function");
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
        () => createManualFileAccessContext({ userAgent: "missing-url" }),
        /importMetaUrl must be provided/i
    );

    const commandUrl = pathToFileURL(
        path.resolve("src/cli/commands/generate-feather-metadata.js")
    ).href;

    assert.throws(
        () => createManualFileAccessContext({ importMetaUrl: commandUrl }),
        /userAgent must be provided/i
    );
});
