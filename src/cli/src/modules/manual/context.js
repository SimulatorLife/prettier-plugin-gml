import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    buildManualRepositoryEndpoints,
    createManualGitHubCommitResolver,
    createManualGitHubFileClient,
    createManualGitHubRefResolver,
    createManualGitHubRequestDispatcher,
    resolveManualCacheRoot
} from "./utils.js";
import {
    assertFunction,
    assertNonEmptyString,
    isNonEmptyString
} from "../dependencies.js";

/** @typedef {import("./utils.js").ManualGitHubRequestExecutor} ManualGitHubRequestExecutor */
/** @typedef {import("./utils.js").ManualGitHubCommitResolver} ManualGitHubCommitResolver */
/** @typedef {import("./utils.js").ManualGitHubRefResolver} ManualGitHubRefResolver */
/** @typedef {import("./utils.js").ManualGitHubFileClient} ManualGitHubFileClient */

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
 * @typedef {object} ManualFileAccess
 * @property {ManualCommandEnvironment} environment
 * @property {ManualGitHubFileClient["fetchManualFile"]} fetchManualFile
 */

/**
 * @typedef {object} ManualReferenceAccess
 * @property {ManualCommandEnvironment} environment
 * @property {ManualGitHubRefResolver["resolveManualRef"]} resolveManualRef
 */

/**
 * Manual access helpers previously returned a catch-all "bundle" that exposed
 * file fetching and reference resolution off the same object. Commands that
 * only needed one collaborator still depended on both behaviours. Returning
 * the focused access contexts keeps the shared environment available while
 * letting call sites opt into the narrow collaborator they require.
 */
function buildManualCommandContext({
    importMetaUrl,
    userAgent,
    outputFileName,
    repoRootSegments = ["..", ".."],
    workflowPathFilter
} = {}) {
    const normalizedUrl = assertFileUrl(importMetaUrl);
    const filename = fileURLToPath(normalizedUrl);
    const dirname = path.dirname(filename);
    const repoRoot = path.resolve(dirname, ...repoRootSegments);
    const defaultCacheRoot = resolveManualCacheRoot({ repoRoot });
    const { rawRoot: defaultManualRawRoot } = buildManualRepositoryEndpoints();

    const normalizedUserAgent = assertUserAgent(userAgent);

    // Manual GitHub helpers are wired independently so call sites can depend on
    // the specific collaborator they require without pulling in the full
    // request/commit/ref/file bundle.
    const manualRequestExecutor = createManualGitHubRequestDispatcher({
        userAgent: normalizedUserAgent
    });
    const manualCommitResolver = createManualGitHubCommitResolver({
        request: manualRequestExecutor
    });
    const manualRefResolver = createManualGitHubRefResolver({
        request: manualRequestExecutor,
        commitResolver: manualCommitResolver
    });
    const manualFileFetcher = Object.freeze(
        createManualGitHubFileClient({
            request: manualRequestExecutor,
            defaultCacheRoot,
            defaultRawRoot: defaultManualRawRoot,
            workflowPathFilter
        })
    );

    const environment = Object.freeze({
        repoRoot,
        defaultCacheRoot,
        defaultManualRawRoot,
        defaultOutputPath: resolveOutputPath(repoRoot, outputFileName)
    });

    return Object.freeze({
        environment,
        request: manualRequestExecutor,
        commitResolver: manualCommitResolver,
        refResolver: manualRefResolver,
        fileClient: manualFileFetcher
    });
}

function mapManualFileAccessContext({ environment, fileClient }) {
    return Object.freeze({
        environment,
        fetchManualFile: fileClient.fetchManualFile
    });
}

function mapManualReferenceAccessContext({ environment, refResolver }) {
    return Object.freeze({
        environment,
        resolveManualRef: refResolver.resolveManualRef
    });
}

function resolveManualContextSelection(options = {}, selector, { label } = {}) {
    const contextSelector = assertFunction(
        selector,
        label ?? "manual context selector"
    );

    const context = buildManualCommandContext(options);
    const selection = contextSelector(context);

    if (selection === undefined) {
        const description = label ?? contextSelector.name ?? "selector";
        throw new Error(
            `Manual context selector '${description}' returned undefined.`
        );
    }

    return selection;
}

function resolveManualContextProperty(
    options = {},
    propertyName,
    { label } = {}
) {
    const normalizedPropertyName = assertNonEmptyString(propertyName, {
        name: "propertyName",
        errorMessage:
            "Manual context property name must be provided as a non-empty string."
    });

    const description = label ?? normalizedPropertyName;

    return resolveManualContextSelection(
        options,
        (context) => context[normalizedPropertyName],
        { label: description }
    );
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
 * @returns {ManualFileAccess}
 */
export function createManualFileAccessContext(options = {}) {
    return mapManualFileAccessContext(buildManualCommandContext(options));
}

/**
 * Resolve manual reference helpers along with the shared environment metadata.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualReferenceAccess}
 */
export function createManualReferenceAccessContext(options = {}) {
    return mapManualReferenceAccessContext(buildManualCommandContext(options));
}

/**
 * Resolve the manual GitHub request executor function so callers can depend on
 * the narrow dispatcher contract instead of the former service wrapper.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualGitHubRequestExecutor}
 */
export function resolveManualGitHubRequestExecutor(options = {}) {
    return resolveManualContextProperty(options, "request");
}

/**
 * Resolve the commit resolver used to look up manual commits directly.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualGitHubCommitResolver}
 */
export function resolveManualGitHubCommitResolver(options = {}) {
    return resolveManualContextProperty(options, "commitResolver");
}

/**
 * Resolve the low-level manual GitHub ref resolver for callers that need to
 * work with the raw collaborator.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualGitHubRefResolver}
 */
export function resolveManualGitHubRefResolver(options = {}) {
    return resolveManualContextProperty(options, "refResolver");
}

/**
 * Resolve the manual GitHub file client used for fetching artefacts.
 *
 * @param {Parameters<typeof buildManualCommandContext>[0]} options
 * @returns {ManualGitHubFileClient}
 */
export function resolveManualGitHubFileClient(options = {}) {
    return resolveManualContextProperty(options, "fileClient");
}
