import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    buildManualRepositoryEndpoints,
    createManualGitHubFileClient,
    createManualGitHubCommitResolver,
    createManualGitHubRefResolver,
    createManualGitHubRequestDispatcher
} from "./manual/github.js";
import { resolveManualCacheRoot } from "./manual/utils.js";
import { assertNonEmptyString } from "./shared-deps.js";

function assertFileUrl(value) {
    return assertNonEmptyString(value, {
        name: "importMetaUrl",
        errorMessage: "importMetaUrl must be provided as a file URL string."
    });
}

function assertUserAgent(value) {
    return assertNonEmptyString(value, { name: "userAgent" });
}

function resolveOutputPath(repoRoot, fileName) {
    if (typeof fileName !== "string" || fileName.length === 0) {
        return null;
    }

    return path.join(repoRoot, "resources", fileName);
}

/**
 * Normalize shared defaults used by manual-powered CLI commands.
 *
 * Centralizes bootstrap logic so each command can focus on its own behavior
 * while reusing consistent repository discovery, cache directories, and manual
 * client wiring.
 */
export function createManualCommandContext({
    importMetaUrl,
    userAgent,
    outputFileName,
    repoRootSegments = ["..", ".."]
} = {}) {
    const normalizedUrl = assertFileUrl(importMetaUrl);
    const filename = fileURLToPath(normalizedUrl);
    const dirname = path.dirname(filename);
    const repoRoot = path.resolve(dirname, ...repoRootSegments);
    const defaultCacheRoot = resolveManualCacheRoot({ repoRoot });
    const { rawRoot: defaultManualRawRoot } = buildManualRepositoryEndpoints();

    const manualRequests = createManualGitHubRequestDispatcher({
        userAgent: assertUserAgent(userAgent)
    });
    const manualCommitResolver = createManualGitHubCommitResolver({
        requestDispatcher: manualRequests
    });
    const manualRefResolver = createManualGitHubRefResolver({
        requestDispatcher: manualRequests,
        commitResolver: manualCommitResolver
    });
    const manualFileFetcher = createManualGitHubFileClient({
        requestDispatcher: manualRequests,
        defaultCacheRoot,
        defaultRawRoot: defaultManualRawRoot
    });

    return {
        repoRoot,
        defaultCacheRoot,
        defaultManualRawRoot,
        defaultOutputPath: resolveOutputPath(repoRoot, outputFileName),
        manualRequests,
        manualCommitResolver,
        manualRefResolver,
        manualFileFetcher,
        fetchManualFile: manualFileFetcher.fetchManualFile,
        resolveManualRef: manualRefResolver.resolveManualRef,
        resolveCommitFromRef: manualCommitResolver.resolveCommitFromRef
    };
}
