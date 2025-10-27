import fs from "node:fs/promises";
import path from "node:path";
import {
    assertPlainObject,
    assertNonEmptyString,
    createAbortGuard,
    identity,
    noop,
    isFsErrorCode,
    isNonEmptyArray,
    isNonEmptyTrimmedString,
    parseJsonWithContext,
    toTrimmedString
} from "../../shared/dependencies.js";
import {
    CliUsageError,
    disposeProgressBars,
    formatBytes,
    formatDuration,
    renderProgressBar,
    withProgressBarCleanup
} from "../dependencies.js";
import { writeManualFile } from "./file-helpers.js";

const MANUAL_REPO_ENV_VAR = "GML_MANUAL_REPO";
const DEFAULT_MANUAL_REPO = "YoYoGames/GameMaker-Manual";
const REPO_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;
const MANUAL_CACHE_ROOT_ENV_VAR = "GML_MANUAL_CACHE_ROOT";
export const MANUAL_REPO_REQUIREMENT_SOURCE = Object.freeze({
    CLI: "cli",
    ENV: "env"
});

/**
 * @typedef {
 *     typeof MANUAL_REPO_REQUIREMENT_SOURCE[
 *         keyof typeof MANUAL_REPO_REQUIREMENT_SOURCE
 *     ]
 * } ManualRepoRequirementSource
 */

const MANUAL_REPO_REQUIREMENTS = Object.freeze({
    [MANUAL_REPO_REQUIREMENT_SOURCE.ENV]: `${MANUAL_REPO_ENV_VAR} must specify a GitHub repository in 'owner/name' format`,
    [MANUAL_REPO_REQUIREMENT_SOURCE.CLI]:
        "Manual repository must be provided in 'owner/name' format"
});

const MANUAL_REPO_REQUIREMENT_SOURCE_LIST = Object.values(
    MANUAL_REPO_REQUIREMENT_SOURCE
).join(", ");

function getManualRepoRequirement(source) {
    const requirement = MANUAL_REPO_REQUIREMENTS[source];
    if (typeof requirement === "string") {
        return requirement;
    }

    const received = source === undefined ? "undefined" : `'${String(source)}'`;
    throw new TypeError(
        `Manual repository requirement source must be one of: ${MANUAL_REPO_REQUIREMENT_SOURCE_LIST}. Received ${received}.`
    );
}

function describeManualRepoInput(value) {
    if (value == null) {
        return String(value);
    }

    return `'${String(value)}'`;
}

function normalizeDownloadLabel(label) {
    return isNonEmptyTrimmedString(label) ? label : "Downloading manual files";
}

/**
 * Ensure the provided manual ref includes a resolved commit SHA before
 * continuing. Commands historically repeated this guard inline, so the helper
 * centralizes the validation and error formatting for all manual workflows.
 *
 * @template T extends { ref?: string | null | undefined; sha?: string | null | undefined }
 * @param {T | null | undefined} manualRef Manual reference resolved by GitHub.
 * @param {{ usage?: string | null }} [options]
 * @returns {T & { sha: string }}
 * @throws {CliUsageError}
 */
export function ensureManualRefHasSha(manualRef, { usage } = {}) {
    if (manualRef?.sha) {
        return manualRef;
    }

    const refLabel = manualRef?.ref ?? "<unknown>";
    throw new CliUsageError(
        `Unable to resolve manual commit SHA for ref '${refLabel}'.`,
        { usage }
    );
}

export function announceManualDownloadStart(
    totalEntries,
    { verbose, description = "manual file" } = {}
) {
    if (!verbose?.downloads) {
        return;
    }

    const normalizedDescription = isNonEmptyTrimmedString(description)
        ? description
        : "manual file";
    const pluralSuffix = totalEntries === 1 ? "" : "s";

    console.log(
        `Fetching ${totalEntries} ${normalizedDescription}${pluralSuffix}…`
    );
}

/**
 * Create a progress reporter for manual file downloads. Callers receive a
 * stable callback that mirrors the branching previously duplicated across CLI
 * commands when switching between progress bars and verbose console output.
 *
 * @param {{
 *   label?: string,
 *   verbose?: { downloads?: boolean, progressBar?: boolean },
 *   progressBarWidth?: number,
 *   formatPath?: (path: string) => string,
 *   render?: typeof renderProgressBar
 * }} options
 * @returns {(update: {
 *   path: string,
 *   fetchedCount: number,
 *   totalEntries: number
 * }) => void}
 */
function createProgressBarReporter({ label, progressBarWidth, render }) {
    const normalizedLabel = normalizeDownloadLabel(label);
    const width = progressBarWidth ?? 0;
    const progressRenderer =
        typeof render === "function" ? render : renderProgressBar;
    let cleanedUp = false;

    return {
        report({ fetchedCount, totalEntries }) {
            progressRenderer(
                normalizedLabel,
                fetchedCount,
                totalEntries,
                width
            );
        },
        cleanup() {
            if (cleanedUp) {
                return;
            }

            cleanedUp = true;
            disposeProgressBars();
        }
    };
}

function createConsoleReporter({ formatPath }) {
    const normalizePath =
        typeof formatPath === "function" ? formatPath : identity;

    return {
        report({ path }) {
            const displayPath = normalizePath(path);
            console.log(displayPath ? `✓ ${displayPath}` : "✓");
        },
        cleanup: noop
    };
}

export function createManualDownloadReporter({
    label,
    verbose = {},
    progressBarWidth,
    formatPath = (path) => path,
    render = renderProgressBar
} = {}) {
    const { downloads = false, progressBar = false } = verbose ?? {};

    if (!downloads) {
        return { report: noop, cleanup: noop };
    }

    return progressBar
        ? createProgressBarReporter({ label, progressBarWidth, render })
        : createConsoleReporter({ formatPath });
}

/**
 * Download the provided manual file entries while collecting their payloads
 * into an object keyed by the entry identifier. The helper centralizes the
 * bookkeeping previously inlined by multiple commands so they can share the
 * same progress reporting pipeline.
 *
 * @param {{
 *   entries: Iterable<[string, string]>,
 *   manualRefSha: string,
 *   fetchManualFile: ManualGitHubFileClient["fetchManualFile"],
 *   requestOptions?: import("./utils.js").ManualGitHubFetchOptions,
 *   onProgress?: (update: {
 *     key: string,
 *     path: string,
 *     fetchedCount: number,
 *     totalEntries: number
 *   }) => void
 * }} options
 * @returns {Promise<Record<string, string>>}
 */
export async function downloadManualFileEntries({
    entries,
    manualRefSha,
    fetchManualFile,
    requestOptions,
    onProgress,
    onProgressCleanup
}) {
    const orderedEntries = Array.from(entries);
    const payloads = {};
    const totalEntries = orderedEntries.length;
    const reportProgress = typeof onProgress === "function" ? onProgress : null;
    const cleanup =
        typeof onProgressCleanup === "function" ? onProgressCleanup : null;
    let fetchedCount = 0;

    try {
        for (const [key, filePath] of orderedEntries) {
            payloads[key] = await fetchManualFile(
                manualRefSha,
                filePath,
                requestOptions
            );

            fetchedCount += 1;

            if (reportProgress) {
                reportProgress({
                    key,
                    path: filePath,
                    fetchedCount,
                    totalEntries
                });
            }
        }
    } finally {
        if (cleanup) {
            try {
                cleanup();
            } catch {
                // Ignore cleanup failures so manual downloads still bubble the
                // original error.
            }
        }
    }

    return payloads;
}

export async function downloadManualEntriesWithProgress({
    entries,
    manualRefSha,
    fetchManualFile,
    requestOptions,
    progress: { label, verbose, progressBarWidth, formatPath, render } = {}
}) {
    return withProgressBarCleanup(async () => {
        const { report: reportProgress, cleanup } =
            createManualDownloadReporter({
                label,
                verbose,
                progressBarWidth,
                formatPath,
                render
            });

        return downloadManualFileEntries({
            entries,
            manualRefSha,
            fetchManualFile,
            requestOptions,
            onProgress: reportProgress,
            onProgressCleanup: cleanup
        });
    });
}

/**
 * @typedef {object} ManualGitHubRequestOptions
 * @property {Record<string, string>} [headers]
 * @property {boolean} [acceptJson]
 */

/**
 * @typedef {object} ManualGitHubRequestDispatcher
 * @property {(url: string, options?: ManualGitHubRequestOptions) => Promise<string>} execute
 */

/**
 * @typedef {object} ManualGitHubResolveOptions
 * @property {object} verbose
 * @property {string} apiRoot
 */

/**
 * @typedef {object} ManualGitHubResolveCommitOptions
 * @property {string} apiRoot
 */

/**
 * @typedef {object} ManualGitHubCommitReference
 * @property {string} ref
 * @property {string} sha
 */

/**
 * @typedef {object} ManualGitHubCommitResolver
 * @property {(ref: string, options: ManualGitHubResolveCommitOptions) =>
 *     Promise<ManualGitHubCommitReference>} resolveCommitFromRef
 */

/**
 * @typedef {object} ManualGitHubRefResolver
 * @property {(ref: string | null | undefined, options: ManualGitHubResolveOptions) =>
 *     Promise<ManualGitHubCommitReference>} resolveManualRef
 */

/**
 * @typedef {object} ManualGitHubFetchOptions
 * @property {boolean} [forceRefresh]
 * @property {object} [verbose]
 * @property {string} [cacheRoot]
 * @property {string} [rawRoot]
 */

/**
 * @typedef {object} ManualGitHubFileClient
 * @property {(sha: string, filePath: string, options?: ManualGitHubFetchOptions) => Promise<string>} fetchManualFile
 */

/**
 * Manual commands historically used a catch-all `ManualGitHubClient` surface
 * that bundled request dispatching, reference resolution, and file fetching.
 * That broad contract violated the Interface Segregation Principle by forcing
 * collaborators that only needed one behavior to depend on all of them. The
 * helpers below expose each concern behind its own focused facade so call sites
 * can compose only what they require.
 */

function createManualVerboseState({
    quiet = false,
    isTerminal = false,
    overrides
} = {}) {
    const baseState = {
        resolveRef: !quiet,
        downloads: !quiet,
        parsing: !quiet,
        progressBar: !quiet && isTerminal
    };

    if (!overrides || typeof overrides !== "object") {
        return baseState;
    }

    const normalizedOverrides = Object.fromEntries(
        Object.entries(overrides).filter(([, value]) => value !== undefined)
    );

    return { ...baseState, ...normalizedOverrides };
}

function validateManualCommitPayload(payload, { ref }) {
    const payloadRecord = assertPlainObject(payload, {
        errorMessage: `Unexpected payload while resolving manual ref '${ref}'. Expected an object.`
    });

    const sha = assertNonEmptyString(payloadRecord.sha, {
        name: "Manual ref commit SHA",
        errorMessage: `Manual ref '${ref}' response did not include a commit SHA.`
    });

    return sha;
}

function normalizeManualTagEntry(entry) {
    const { name: rawName, commit } = assertPlainObject(entry, {
        errorMessage:
            "Manual tags response must contain objects with tag metadata."
    });

    const name = assertNonEmptyString(rawName, {
        name: "Manual tag entry name",
        errorMessage: "Manual tag entry is missing a tag name."
    });

    if (commit == null) {
        return { name, sha: null };
    }

    const { sha } = assertPlainObject(commit, {
        errorMessage: "Manual tag entry commit must be an object when provided."
    });

    if (sha == null) {
        return { name, sha: null };
    }

    return {
        name,
        sha: assertNonEmptyString(sha, {
            name: "Manual tag entry commit SHA",
            errorMessage:
                "Manual tag entry commit SHA must be a non-empty string when provided."
        })
    };
}

function resolveManualCacheRoot({
    repoRoot,
    env = process.env,
    relativeFallback = ["scripts", "cache", "manual"]
} = {}) {
    if (!repoRoot) {
        throw new TypeError(
            "repoRoot must be provided to resolveManualCacheRoot."
        );
    }

    const override = toTrimmedString(env?.[MANUAL_CACHE_ROOT_ENV_VAR]);
    if (override.length > 0) {
        return path.resolve(repoRoot, override);
    }

    return path.join(repoRoot, ...relativeFallback);
}

function normalizeManualRepository(value) {
    const trimmed = toTrimmedString(value);
    if (trimmed.length === 0) {
        return null;
    }

    const segments = trimmed.split("/");
    if (segments.length !== 2) {
        return null;
    }

    const [owner, repo] = segments;
    if (!REPO_SEGMENT_PATTERN.test(owner) || !REPO_SEGMENT_PATTERN.test(repo)) {
        return null;
    }

    return `${owner}/${repo}`;
}

function resolveManualRepoValue(
    rawValue,
    { source = MANUAL_REPO_REQUIREMENT_SOURCE.CLI } = {}
) {
    const requirement = getManualRepoRequirement(source);
    const normalized = normalizeManualRepository(rawValue);
    if (normalized) {
        return normalized;
    }

    const received = describeManualRepoInput(rawValue);

    throw new TypeError(`${requirement} (received ${received}).`);
}

const DEFAULT_MANUAL_REPO_NORMALIZED =
    resolveManualRepoValue(DEFAULT_MANUAL_REPO);

function buildManualRepositoryEndpoints(manualRepo = DEFAULT_MANUAL_REPO) {
    const useDefault =
        manualRepo === undefined || manualRepo === null || manualRepo === "";

    const normalized = useDefault
        ? DEFAULT_MANUAL_REPO_NORMALIZED
        : resolveManualRepoValue(manualRepo);

    return {
        manualRepo: normalized,
        apiRoot: `https://api.github.com/repos/${normalized}`,
        rawRoot: `https://raw.githubusercontent.com/${normalized}`
    };
}

/**
 * Provide specialized GitHub helpers for manual fetching without forcing
 * consumers to depend on unrelated operations.
 *
 * @param {{ userAgent: string }} options
 * @returns {ManualGitHubRequestDispatcher}
 */
function createManualGitHubRequestDispatcher({ userAgent } = {}) {
    const normalizedUserAgent = assertNonEmptyString(userAgent, {
        name: "userAgent",
        errorMessage: "A userAgent string is required."
    });

    const token = process.env.GITHUB_TOKEN;
    const baseHeaders = {
        "User-Agent": normalizedUserAgent,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    async function execute(url, { headers, acceptJson, signal } = {}) {
        const finalHeaders = {
            ...baseHeaders,
            ...headers,
            ...(acceptJson ? { Accept: "application/vnd.github+json" } : {})
        };

        const response = await fetch(url, {
            headers: finalHeaders,
            redirect: "follow",
            signal
        });

        const bodyText = await response.text();
        if (!response.ok) {
            const errorMessage = bodyText || response.statusText;
            throw new Error(`Request failed for ${url}: ${errorMessage}`);
        }

        return bodyText;
    }

    return Object.freeze({ execute });
}

function resolveManualRequestExecutor(requestDispatcher, callerName) {
    const execute = requestDispatcher?.execute;
    if (typeof execute !== "function") {
        throw new TypeError(
            `${callerName} requires a request dispatcher with an execute function.`
        );
    }

    return execute;
}

/**
 * @param {{ requestDispatcher: ManualGitHubRequestDispatcher }} options
 * @returns {ManualGitHubCommitResolver}
 */
function createManualGitHubCommitResolver({ requestDispatcher }) {
    const request = resolveManualRequestExecutor(
        requestDispatcher,
        "ManualGitHubCommitResolver"
    );

    async function resolveCommitFromRef(ref, { apiRoot }) {
        const url = `${apiRoot}/commits/${encodeURIComponent(ref)}`;
        const body = await request(url, { acceptJson: true });
        const payload = parseJsonWithContext(body, {
            description: "manual commit response",
            source: url
        });
        const sha = validateManualCommitPayload(payload, { ref });

        return { ref, sha };
    }

    return Object.freeze({ resolveCommitFromRef });
}

/**
 * @param {{
 *   requestDispatcher: ManualGitHubRequestDispatcher,
 *   commitResolver?: ManualGitHubCommitResolver
 * }} options
 * @returns {ManualGitHubRefResolver}
 */
function createManualGitHubRefResolver({ requestDispatcher, commitResolver }) {
    const request = resolveManualRequestExecutor(
        requestDispatcher,
        "ManualGitHubRefResolver"
    );

    const commitResolution =
        typeof commitResolver?.resolveCommitFromRef === "function"
            ? commitResolver
            : createManualGitHubCommitResolver({ requestDispatcher });
    const resolveCommitFromRef = commitResolution.resolveCommitFromRef;

    async function resolveManualRef(ref, { verbose, apiRoot } = {}) {
        if (verbose?.resolveRef) {
            console.log(
                ref
                    ? `Resolving manual reference '${ref}'…`
                    : "Resolving latest manual tag…"
            );
        }

        if (ref) {
            return resolveCommitFromRef(ref, { apiRoot });
        }

        const latestTagUrl = `${apiRoot}/tags?per_page=1`;
        const body = await request(latestTagUrl, { acceptJson: true });
        const tags = parseJsonWithContext(body, {
            description: "manual tags response",
            source: latestTagUrl
        });

        if (!isNonEmptyArray(tags)) {
            console.warn(
                "No manual tags found; defaulting to 'develop' branch."
            );
            return resolveCommitFromRef("develop", { apiRoot });
        }

        const { name, sha } = normalizeManualTagEntry(tags[0]);
        return {
            ref: name,
            sha
        };
    }

    return Object.freeze({ resolveManualRef });
}

async function tryReadManualFileCache({
    cachePath,
    filePath,
    ensureNotAborted,
    shouldLogDetails
}) {
    try {
        const cached = await fs.readFile(cachePath, "utf8");
        ensureNotAborted();

        if (shouldLogDetails) {
            console.log(`[cache] ${filePath}`);
        }

        return cached;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            return null;
        }

        throw error;
    }
}

/**
 * @param {{
 *   requestDispatcher: ManualGitHubRequestDispatcher,
 *   defaultCacheRoot?: string,
 *   defaultRawRoot: string
 * }} options
 * @returns {ManualGitHubFileClient}
 */
function createManualGitHubFileClient({
    requestDispatcher,
    defaultCacheRoot,
    defaultRawRoot
}) {
    const request = resolveManualRequestExecutor(
        requestDispatcher,
        "ManualGitHubFileClient"
    );

    async function fetchManualFile(
        sha,
        filePath,
        {
            forceRefresh = false,
            verbose = {},
            cacheRoot = defaultCacheRoot,
            rawRoot = defaultRawRoot,
            signal: externalSignal
        } = {}
    ) {
        const abortMessage = "Manual file fetch was aborted.";
        const { signal, ensureNotAborted } = createAbortGuard(
            { signal: externalSignal },
            { fallbackMessage: abortMessage }
        );
        const shouldLogDetails = verbose.downloads && !verbose.progressBar;
        const cachePath = path.join(cacheRoot, sha, filePath);

        const cached = forceRefresh
            ? null
            : await tryReadManualFileCache({
                  cachePath,
                  filePath,
                  ensureNotAborted,
                  shouldLogDetails
              });

        if (cached !== null) {
            return cached;
        }

        ensureNotAborted();
        const startTime = Date.now();
        if (shouldLogDetails) {
            console.log(`[download] ${filePath}…`);
        }

        const url = `${rawRoot}/${sha}/${filePath}`;
        const requestOptions = signal ? { signal } : {};
        const content = await request(url, requestOptions);
        ensureNotAborted();

        await writeManualFile({
            outputPath: cachePath,
            contents: content,
            encoding: "utf8",
            onAfterWrite: () => {
                if (signal?.aborted || !shouldLogDetails) {
                    return;
                }

                console.log(
                    `[done] ${filePath} (${formatBytes(content)} in ${formatDuration(
                        startTime
                    )})`
                );
            }
        });

        ensureNotAborted();
        return content;
    }

    return {
        fetchManualFile
    };
}

/**
 * Assemble the core GitHub collaborators used by manual commands. Centralizes
 * the wiring previously duplicated by context builders and tests so they all
 * share the same dispatcher, resolver, and file client composition.
 *
 * @param {{
 *   userAgent: string,
 *   defaultCacheRoot?: string,
 *   defaultRawRoot: string
 * }} options
 * @returns {{
 *   requestDispatcher: ManualGitHubRequestDispatcher,
 *   commitResolver: ManualGitHubCommitResolver,
 *   refResolver: ManualGitHubRefResolver,
 *   fileClient: ManualGitHubFileClient
 * }}
 */
function createManualGitHubClientBundle({
    userAgent,
    defaultCacheRoot,
    defaultRawRoot
}) {
    const requestDispatcher = createManualGitHubRequestDispatcher({
        userAgent
    });
    const commitResolver = createManualGitHubCommitResolver({
        requestDispatcher
    });
    const refResolver = createManualGitHubRefResolver({
        requestDispatcher,
        commitResolver
    });
    const fileClient = createManualGitHubFileClient({
        requestDispatcher,
        defaultCacheRoot,
        defaultRawRoot
    });

    return Object.freeze({
        requestDispatcher,
        commitResolver,
        refResolver,
        fileClient
    });
}

export {
    DEFAULT_MANUAL_REPO,
    MANUAL_CACHE_ROOT_ENV_VAR,
    MANUAL_REPO_ENV_VAR,
    createManualVerboseState,
    buildManualRepositoryEndpoints,
    normalizeManualRepository,
    resolveManualRepoValue,
    resolveManualCacheRoot,
    createManualGitHubRequestDispatcher,
    createManualGitHubCommitResolver,
    createManualGitHubRefResolver,
    createManualGitHubFileClient,
    createManualGitHubClientBundle
};
