import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    buildManualRepositoryEndpoints,
    createManualGitHubFileClient,
    createManualGitHubCommitResolver,
    createManualGitHubRefResolver,
    createManualGitHubRequestDispatcher,
    resolveManualCacheRoot
} from "./manual/utils.js";
import { assertNonEmptyString } from "./shared-deps.js";

/** @typedef {import("./manual/utils.js").ManualGitHubRequestDispatcher} ManualGitHubRequestDispatcher */
/** @typedef {import("./manual/utils.js").ManualGitHubCommitResolver} ManualGitHubCommitResolver */
/** @typedef {import("./manual/utils.js").ManualGitHubRefResolver} ManualGitHubRefResolver */
/** @typedef {import("./manual/utils.js").ManualGitHubFileClient} ManualGitHubFileClient */
/** @typedef {ManualGitHubRequestDispatcher["execute"]} ManualGitHubRequestExecutor */

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
 * @typedef {object} ManualCommandEnvironment
 * @property {string} repoRoot
 * @property {string} defaultCacheRoot
 * @property {string} defaultManualRawRoot
 * @property {string | null} defaultOutputPath
 */

/**
 * @typedef {object} ManualCommandGitHubClients
 * @property {ManualGitHubRequestExecutor} request
 * @property {ManualGitHubCommitResolver} commitResolver
 * @property {ManualGitHubRefResolver} refResolver
 * @property {ManualGitHubFileClient} fileClient
 */

/**
 * @typedef {object} ManualCommandRequestService
 * @property {ManualGitHubRequestExecutor} executeManualRequest
 */

/**
 * @typedef {object} ManualCommandFileService
 * @property {ManualGitHubFileClient["fetchManualFile"]} fetchManualFile
 */

/**
 * @typedef {object} ManualCommandRefResolutionService
 * @property {ManualGitHubRefResolver["resolveManualRef"]} resolveManualRef
 */

/**
 * @typedef {object} ManualCommandCommitResolutionService
 * @property {ManualGitHubCommitResolver["resolveCommitFromRef"]} resolveCommitFromRef
 */

/**
 * @typedef {object} ManualCommandContext
 * @property {ManualCommandEnvironment} environment
 * @property {ManualCommandGitHubClients} clients
 * @property {ManualCommandRequestService} requests
 * @property {ManualCommandFileService} files
 * @property {ManualCommandRefResolutionService} refs
 * @property {ManualCommandCommitResolutionService} commits
 */

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

    const environment = Object.freeze({
        repoRoot,
        defaultCacheRoot,
        defaultManualRawRoot,
        defaultOutputPath: resolveOutputPath(repoRoot, outputFileName)
    });

    const manualRequestExecutor = manualRequests.execute;

    const clients = Object.freeze({
        request: manualRequestExecutor,
        commitResolver: manualCommitResolver,
        refResolver: manualRefResolver,
        fileClient: manualFileFetcher
    });

    const requests = Object.freeze({
        executeManualRequest: manualRequestExecutor
    });

    const files = Object.freeze({
        fetchManualFile: manualFileFetcher.fetchManualFile
    });

    const refs = Object.freeze({
        resolveManualRef: manualRefResolver.resolveManualRef
    });

    const commits = Object.freeze({
        resolveCommitFromRef: manualCommitResolver.resolveCommitFromRef
    });

    return Object.freeze({
        environment,
        clients,
        requests,
        files,
        refs,
        commits
    });
}
