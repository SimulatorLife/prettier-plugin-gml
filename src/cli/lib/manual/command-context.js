import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    buildManualRepositoryEndpoints,
    createManualGitHubFileClient,
    createManualGitHubCommitResolver,
    createManualGitHubRefResolver,
    createManualGitHubRequestDispatcher,
    resolveManualCacheRoot
} from "./utils.js";
import { assertNonEmptyString } from "../shared-deps.js";

/** @typedef {import("./utils.js").ManualGitHubRequestDispatcher} ManualGitHubRequestDispatcher */
/** @typedef {import("./utils.js").ManualGitHubCommitResolver} ManualGitHubCommitResolver */
/** @typedef {import("./utils.js").ManualGitHubRefResolver} ManualGitHubRefResolver */
/** @typedef {import("./utils.js").ManualGitHubFileClient} ManualGitHubFileClient */
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
 * Manual commands historically shared a single `ManualCommandContext` object
 * that bundled environment discovery, GitHub dispatchers, file fetching, and
 * reference resolution behind one umbrella. That wide contract made commands
 * that only needed file/ref helpers depend on request and commit services as
 * well. The helpers below expose narrower contexts so consumers can opt into
 * the responsibilities they actually use.
 */

/**
 * @typedef {object} ManualEnvironmentContext
 * @property {ManualCommandEnvironment} environment
 */

/**
 * @typedef {object} ManualManualAccessContext
 * @property {ManualCommandEnvironment} environment
 * @property {ManualCommandFileService} files
 * @property {ManualCommandRefResolutionService} refs
 */

/**
 * @typedef {object} ManualGitHubExecutionContext
 * @property {ManualCommandGitHubClients} clients
 * @property {ManualCommandRequestService} requests
 * @property {ManualCommandCommitResolutionService} commits
 */

function buildManualCommandContext({
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

    return {
        environment,
        clients,
        requests,
        files,
        refs,
        commits
    };
}

/**
 * Resolve only the repository environment metadata shared by manual commands.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualEnvironmentContext}
 */
export function createManualEnvironmentContext(options = {}) {
    const { environment } = buildManualCommandContext(options);
    return Object.freeze({ environment });
}

/**
 * Resolve manual fetching and reference helpers along with the environment
 * information commonly needed by artefact generators.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualManualAccessContext}
 */
export function createManualManualAccessContext(options = {}) {
    const { environment, files, refs } = buildManualCommandContext(options);
    return Object.freeze({ environment, files, refs });
}

/**
 * Resolve the GitHub-facing collaborators used by manual commands that need to
 * dispatch requests or look up commits directly.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualGitHubExecutionContext}
 */
export function createManualGitHubExecutionContext(options = {}) {
    const { clients, requests, commits } = buildManualCommandContext(options);
    return Object.freeze({ clients, requests, commits });
}
