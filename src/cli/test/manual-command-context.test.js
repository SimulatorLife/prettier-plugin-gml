import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
    createManualEnvironmentContext,
    createManualFileAccessContext,
    createManualReferenceAccessContext,
    resolveManualFileFetcher,
    resolveManualGitHubRequestExecutor,
    resolveManualGitHubCommitResolver,
    resolveManualGitHubRefResolver,
    resolveManualGitHubFileClient
} from "../src/modules/manual/context.js";
import {
    buildManualRepositoryEndpoints,
    resolveManualCacheRoot
} from "../src/modules/manual/utils.js";

test("manual access helpers expose focused contexts", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/src/commands/generate-feather-metadata.js")
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
    assert.equal(typeof fileAccess.fetchManualFile, "function");
    assert.equal(typeof referenceAccess.resolveManualRef, "function");
});

test("resolveManualFileFetcher exposes the manual download helper", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/src/commands/generate-feather-metadata.js")
    ).href;

    const fetchManualFile = resolveManualFileFetcher({
        importMetaUrl: commandUrl,
        userAgent: "manual-context-test"
    });

    assert.equal(typeof fetchManualFile, "function");
});

test("manual file and reference contexts share environment defaults", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/src/commands/generate-gml-identifiers.js")
    ).href;

    const repoRootSegments = ["..", "..", "..", ".."];
    const cacheRootSegments = ["src", "cli", "cache", "manual"];

    const fileAccess = createManualFileAccessContext({
        importMetaUrl: commandUrl,
        userAgent: "manual-context-test",
        outputFileName: "example.json",
        repoRootSegments,
        cacheRootSegments
    });

    const referenceAccess = createManualReferenceAccessContext({
        importMetaUrl: commandUrl,
        userAgent: "manual-context-test",
        repoRootSegments,
        cacheRootSegments
    });

    const expectedRepoRoot = path.resolve(
        "src/cli/src/commands",
        ...repoRootSegments
    );
    const expectedCacheRoot = resolveManualCacheRoot({
        repoRoot: expectedRepoRoot,
        relativeFallback: cacheRootSegments
    });

    assert.equal(fileAccess.environment.repoRoot, expectedRepoRoot);
    assert.equal(fileAccess.environment.defaultCacheRoot, expectedCacheRoot);
    assert.equal(
        fileAccess.environment.defaultOutputPath,
        path.join(expectedRepoRoot, "resources", "example.json")
    );
    assert.equal(
        fileAccess.environment.defaultManualRawRoot,
        buildManualRepositoryEndpoints().rawRoot
    );
    assert.ok(Object.isFrozen(fileAccess.environment));
    assert.equal(typeof fileAccess.fetchManualFile, "function");
    assert.equal(typeof referenceAccess.resolveManualRef, "function");
});

test("manual GitHub helpers expose narrow collaborators", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/src/commands/generate-feather-metadata.js")
    ).href;

    const options = {
        importMetaUrl: commandUrl,
        userAgent: "manual-context-test"
    };

    const requestExecutor = resolveManualGitHubRequestExecutor(options);
    assert.equal(typeof requestExecutor, "function");

    const commitResolver = resolveManualGitHubCommitResolver(options);
    assert.ok(Object.isFrozen(commitResolver));
    assert.equal(typeof commitResolver.resolveCommitFromRef, "function");

    const refResolver = resolveManualGitHubRefResolver(options);
    assert.equal(typeof refResolver.resolveManualRef, "function");

    const fileClient = resolveManualGitHubFileClient(options);
    assert.ok(Object.isFrozen(fileClient));
    assert.equal(typeof fileClient.fetchManualFile, "function");
});

test("createManualEnvironmentContext isolates repository metadata", () => {
    const commandUrl = pathToFileURL(
        path.resolve("src/cli/src/commands/generate-feather-metadata.js")
    ).href;

    const repoRootSegments = ["..", "..", "..", ".."];
    const cacheRootSegments = ["src", "cli", "scripts", "cache", "manual"];

    const context = createManualEnvironmentContext({
        importMetaUrl: commandUrl,
        userAgent: "manual-context-test",
        repoRootSegments,
        cacheRootSegments
    });

    assert.ok(Object.isFrozen(context.environment));
    assert.equal(
        context.environment.repoRoot,
        path.resolve("src/cli/src/commands", ...repoRootSegments)
    );
});

test("manual command context builders validate required arguments", () => {
    assert.throws(
        () => createManualFileAccessContext({ userAgent: "missing-url" }),
        /importMetaUrl must be provided/i
    );

    const commandUrl = pathToFileURL(
        path.resolve("src/cli/src/commands/generate-feather-metadata.js")
    ).href;

    assert.throws(
        () => createManualFileAccessContext({ importMetaUrl: commandUrl }),
        /userAgent must be provided/i
    );
});
