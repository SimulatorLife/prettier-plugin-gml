import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    buildRuntimeRepositoryEndpoints,
    createRuntimeGitHubCommitResolver,
    createRuntimeGitHubFileClient,
    createRuntimeGitHubRefResolver,
    createRuntimeGitHubRequestDispatcher,
    resolveRuntimeCacheRoot
} from "./utils.js";
import { assertFunction, assertNonEmptyString } from "../dependencies.js";

function assertFileUrl(value) {
    return assertNonEmptyString(value, {
        name: "importMetaUrl",
        errorMessage: "importMetaUrl must be provided as a file URL string."
    });
}

function assertUserAgent(value) {
    return assertNonEmptyString(value, { name: "userAgent" });
}

function buildRuntimeCommandContext({
    importMetaUrl,
    userAgent,
    runtimeRepo,
    repoRootSegments = ["..", ".."],
    cacheRootSegments = ["src", "cli", "cache", "runtime"],
    workflowPathFilter
} = {}) {
    const normalizedUrl = assertFileUrl(importMetaUrl);
    const filename = fileURLToPath(normalizedUrl);
    const dirname = path.dirname(filename);
    const repoRoot = path.resolve(dirname, ...repoRootSegments);
    const defaultCacheRoot = resolveRuntimeCacheRoot({
        repoRoot,
        relativeFallback: cacheRootSegments
    });
    const { rawRoot: defaultRuntimeRawRoot } =
        buildRuntimeRepositoryEndpoints(runtimeRepo);

    const normalizedUserAgent = assertUserAgent(userAgent);

    const runtimeRequestExecutor = createRuntimeGitHubRequestDispatcher({
        userAgent: normalizedUserAgent
    });
    const runtimeCommitResolver = createRuntimeGitHubCommitResolver({
        request: runtimeRequestExecutor
    });
    const runtimeRefResolver = createRuntimeGitHubRefResolver({
        request: runtimeRequestExecutor,
        commitResolver: runtimeCommitResolver
    });
    const runtimeFileFetcher = Object.freeze(
        createRuntimeGitHubFileClient({
            request: runtimeRequestExecutor,
            defaultCacheRoot,
            defaultRawRoot: defaultRuntimeRawRoot,
            workflowPathFilter
        })
    );

    const environment = Object.freeze({
        repoRoot,
        defaultCacheRoot,
        defaultRuntimeRawRoot
    });

    return Object.freeze({
        environment,
        request: runtimeRequestExecutor,
        commitResolver: runtimeCommitResolver,
        refResolver: runtimeRefResolver,
        fileClient: runtimeFileFetcher
    });
}

function mapRuntimeFileAccessContext({ environment, fileClient }) {
    return Object.freeze({
        environment,
        fetchRuntimeFile: fileClient.fetchManualFile
    });
}

function mapRuntimeReferenceAccessContext({ environment, refResolver }) {
    return Object.freeze({
        environment,
        resolveRuntimeRef: refResolver.resolveManualRef
    });
}

function resolveRuntimeContextSelection(
    options = {},
    selector,
    { label } = {}
) {
    const contextSelector = assertFunction(
        selector,
        label ?? "runtime context selector"
    );

    const context = buildRuntimeCommandContext(options);
    return contextSelector(context);
}

export function createRuntimeEnvironmentContext(options = {}) {
    return resolveRuntimeContextSelection(
        options,
        (context) => ({ environment: context.environment }),
        { label: "createRuntimeEnvironmentContext selector" }
    );
}

export function createRuntimeFileAccessContext(options = {}) {
    return resolveRuntimeContextSelection(
        options,
        (context) => mapRuntimeFileAccessContext(context),
        { label: "createRuntimeFileAccessContext selector" }
    );
}

export function createRuntimeReferenceAccessContext(options = {}) {
    return resolveRuntimeContextSelection(
        options,
        (context) => mapRuntimeReferenceAccessContext(context),
        { label: "createRuntimeReferenceAccessContext selector" }
    );
}

export function resolveRuntimeFileFetcher(options = {}) {
    const fileAccess = createRuntimeFileAccessContext(options);
    const fetchRuntimeFile = assertFunction(
        fileAccess.fetchRuntimeFile,
        "runtime file fetcher"
    );

    return (sha, filePath, fetchOptions) => {
        if (fetchOptions === undefined) {
            return fetchRuntimeFile(sha, filePath);
        }

        return fetchRuntimeFile(sha, filePath, fetchOptions);
    };
}

export function resolveRuntimeGitHubRefResolver(options = {}) {
    return resolveRuntimeContextSelection(
        options,
        (context) => context.refResolver,
        { label: "resolveRuntimeGitHubRefResolver selector" }
    );
}

export function resolveRuntimeGitHubRequestExecutor(options = {}) {
    return resolveRuntimeContextSelection(
        options,
        (context) => context.request,
        { label: "resolveRuntimeGitHubRequestExecutor selector" }
    );
}

export function resolveRuntimeGitHubCommitResolver(options = {}) {
    return resolveRuntimeContextSelection(
        options,
        (context) => context.commitResolver,
        { label: "resolveRuntimeGitHubCommitResolver selector" }
    );
}

export function resolveRuntimeGitHubFileClient(options = {}) {
    return resolveRuntimeContextSelection(
        options,
        (context) => context.fileClient,
        { label: "resolveRuntimeGitHubFileClient selector" }
    );
}
