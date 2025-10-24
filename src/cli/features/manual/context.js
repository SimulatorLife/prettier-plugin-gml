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
import {
    assertNonEmptyString,
    isNonEmptyString
} from "../../shared/dependencies.js";

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
    if (!isNonEmptyString(fileName)) {
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
 * @typedef {object} ManualFileAccessContext
 * @property {ManualCommandEnvironment} environment
 * @property {ManualCommandFileService} files
 */

/**
 * @typedef {object} ManualReferenceAccessContext
 * @property {ManualCommandEnvironment} environment
 * @property {ManualCommandRefResolutionService} refs
 */

/**
 * @typedef {object} ManualAccessContexts
 * @property {ManualCommandEnvironment} environment
 * @property {ManualFileAccessContext} fileAccess
 * @property {ManualReferenceAccessContext} referenceAccess
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
        request: manualRequestExecutor,
        commitResolver: manualCommitResolver,
        refResolver: manualRefResolver,
        fileClient: manualFileFetcher,
        requests,
        files,
        refs,
        commits
    });
}

function mapManualFileAccessContext({ environment, files }) {
    return Object.freeze({ environment, files });
}

function mapManualReferenceAccessContext({ environment, refs }) {
    return Object.freeze({ environment, refs });
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
 * @returns {ManualFileAccessContext}
 */
export function createManualFileAccessContext(options = {}) {
    return mapManualFileAccessContext(buildManualCommandContext(options));
}

/**
 * Resolve manual reference helpers along with the shared environment metadata.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualReferenceAccessContext}
 */
export function createManualReferenceAccessContext(options = {}) {
    return mapManualReferenceAccessContext(buildManualCommandContext(options));
}

/**
 * Resolve both manual file and reference collaborators while reusing the
 * underlying GitHub wiring and shared environment metadata.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualAccessContexts}
 */
export function createManualAccessContexts(options = {}) {
    const context = buildManualCommandContext(options);
    return Object.freeze({
        environment: context.environment,
        fileAccess: mapManualFileAccessContext(context),
        referenceAccess: mapManualReferenceAccessContext(context)
    });
}

/**
 * Resolve the frozen manual GitHub request service used to execute raw API calls.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualCommandRequestService}
 */
export function resolveManualGitHubRequestService(options = {}) {
    const { requests } = buildManualCommandContext(options);
    return requests;
}

/**
 * Resolve the manual GitHub request executor function for callers that need the
 * bare dispatcher rather than the service facade.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualGitHubRequestExecutor}
 */
export function resolveManualGitHubRequestExecutor(options = {}) {
    const { request } = buildManualCommandContext(options);
    return request;
}

/**
 * Resolve the frozen manual GitHub commit resolution service.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualCommandCommitResolutionService}
 */
export function resolveManualGitHubCommitService(options = {}) {
    const { commits } = buildManualCommandContext(options);
    return commits;
}

/**
 * Resolve the commit resolver used to look up manual commits directly.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualGitHubCommitResolver}
 */
export function resolveManualGitHubCommitResolver(options = {}) {
    const { commitResolver } = buildManualCommandContext(options);
    return commitResolver;
}

/**
 * Resolve the low-level manual GitHub ref resolver for callers that need to
 * work with the raw collaborator.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualGitHubRefResolver}
 */
export function resolveManualGitHubRefResolver(options = {}) {
    const { refResolver } = buildManualCommandContext(options);
    return refResolver;
}

/**
 * Resolve the manual GitHub file client used for fetching artefacts.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualGitHubFileClient}
 */
export function resolveManualGitHubFileClient(options = {}) {
    const { fileClient } = buildManualCommandContext(options);
    return fileClient;
}
