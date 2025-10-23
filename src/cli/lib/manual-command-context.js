import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    createManualGitHubFileClient,
    createManualGitHubCommitResolver,
    createManualGitHubRefResolver,
    createManualGitHubRequestDispatcher,
    resolveManualCacheRoot
} from "./manual/utils.js";
import { buildManualRepositoryEndpoints } from "./manual/repository.js";
import { assertNonEmptyString } from "./shared-deps.js";

/** @typedef {import("./manual/utils.js").ManualGitHubRequestDispatcher} ManualGitHubRequestDispatcher */
/** @typedef {import("./manual/utils.js").ManualGitHubCommitResolver} ManualGitHubCommitResolver */
/** @typedef {import("./manual/utils.js").ManualGitHubRefResolver} ManualGitHubRefResolver */
/** @typedef {import("./manual/utils.js").ManualGitHubFileClient} ManualGitHubFileClient */

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
 * @property {ManualGitHubRequestDispatcher} requests
 * @property {ManualGitHubCommitResolver} commitResolver
 * @property {ManualGitHubRefResolver} refResolver
 * @property {ManualGitHubFileClient} fileClient
 */

/**
 * @typedef {object} ManualCommandGitHubOperations
 * @property {ManualGitHubFileClient["fetchManualFile"]} fetchManualFile
 * @property {ManualGitHubRefResolver["resolveManualRef"]} resolveManualRef
 * @property {ManualGitHubCommitResolver["resolveCommitFromRef"]} resolveCommitFromRef
 */

/**
 * @typedef {object} ManualCommandContext
 * @property {ManualCommandEnvironment} environment
 * @property {ManualCommandGitHubClients} clients
 * @property {ManualCommandGitHubOperations} operations
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

    const clients = Object.freeze({
        requests: manualRequests,
        commitResolver: manualCommitResolver,
        refResolver: manualRefResolver,
        fileClient: manualFileFetcher
    });

    const operations = Object.freeze({
        fetchManualFile: manualFileFetcher.fetchManualFile,
        resolveManualRef: manualRefResolver.resolveManualRef,
        resolveCommitFromRef: manualCommitResolver.resolveCommitFromRef
    });

    return Object.freeze({ environment, clients, operations });
}
