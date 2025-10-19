import fs from "node:fs";
import path from "node:path";
import {
    assertNonEmptyString,
    parseJsonWithContext,
    toTrimmedString
} from "./shared-deps.js";
import { ensureDir } from "./file-system.js";
import { formatDuration } from "./time-utils.js";
import { formatBytes } from "./byte-format.js";
import { isNonEmptyArray } from "../../shared/array-utils.js";

const MANUAL_REPO_ENV_VAR = "GML_MANUAL_REPO";
const DEFAULT_MANUAL_REPO = "YoYoGames/GameMaker-Manual";
const REPO_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;
const MANUAL_CACHE_ROOT_ENV_VAR = "GML_MANUAL_CACHE_ROOT";

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
 * The original `ManualGitHubClientSurfaces` interface forced manual commands to
 * depend on request dispatching, reference resolution, and file fetching in one
 * bundle. By splitting the contract we let call sites wire up only the
 * collaborators they actually use, preserving interface segregation.
 */

/**
 * @typedef {object} ManualGitHubReferencesClient
 * @property {(ref: string | null | undefined, options: ManualGitHubResolveOptions) => Promise<{ ref: string, sha: string }>}
 *   resolveManualRef
 * @property {(ref: string, options: { apiRoot: string }) => Promise<{ ref: string, sha: string }>}
 *   resolveCommitFromRef
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
 * @typedef {object} ManualGitHubClient
 * @property {ManualGitHubRequestDispatcher} requestDispatcher
 * @property {ManualGitHubReferencesClient} references
 * @property {ManualGitHubFileClient} fileFetcher
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

    return Object.entries(overrides).reduce(
        (state, [key, value]) => {
            if (value !== undefined) {
                state[key] = value;
            }
            return state;
        },
        { ...baseState }
    );
}

function assertPlainObject(value, message) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(message);
    }

    return value;
}

function validateManualCommitPayload(payload, { ref }) {
    const payloadRecord = assertPlainObject(
        payload,
        `Unexpected payload while resolving manual ref '${ref}'. Expected an object.`
    );

    const sha = assertNonEmptyString(payloadRecord.sha, {
        name: "Manual ref commit SHA",
        errorMessage: `Manual ref '${ref}' response did not include a commit SHA.`
    });

    return sha;
}

function normalizeManualTagEntry(entry) {
    const { name: rawName, commit } = assertPlainObject(
        entry,
        "Manual tags response must contain objects with tag metadata."
    );

    const name = assertNonEmptyString(rawName, {
        name: "Manual tag entry name",
        errorMessage: "Manual tag entry is missing a tag name."
    });

    if (commit == null) {
        return { name, sha: null };
    }

    const { sha } = assertPlainObject(
        commit,
        "Manual tag entry commit must be an object when provided."
    );

    if (sha == null) {
        return { name, sha: null };
    }

    const normalizedSha = assertNonEmptyString(sha, {
        name: "Manual tag entry commit SHA",
        errorMessage:
            "Manual tag entry commit SHA must be a non-empty string when provided."
    });

    return { name, sha: normalizedSha };
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

function buildManualRepositoryEndpoints(manualRepo = DEFAULT_MANUAL_REPO) {
    const isDefaultCandidate =
        manualRepo === undefined || manualRepo === null || manualRepo === "";

    const repoToUse = isDefaultCandidate
        ? DEFAULT_MANUAL_REPO
        : toTrimmedString(manualRepo);

    const normalized = normalizeManualRepository(repoToUse);
    if (!normalized) {
        const received = isDefaultCandidate ? DEFAULT_MANUAL_REPO : manualRepo;
        throw new Error(`Invalid manual repository provided: ${received}`);
    }

    return {
        manualRepo: normalized,
        apiRoot: `https://api.github.com/repos/${normalized}`,
        rawRoot: `https://raw.githubusercontent.com/${normalized}`
    };
}

function resolveManualRepoValue(rawValue, { source = "cli" } = {}) {
    const normalized = normalizeManualRepository(rawValue);
    if (normalized) {
        return normalized;
    }

    let received;
    if (rawValue === undefined) {
        received = "undefined";
    } else if (rawValue === null) {
        received = "null";
    } else {
        received = `'${rawValue}'`;
    }

    const requirement =
        source === "env"
            ? `${MANUAL_REPO_ENV_VAR} must specify a GitHub repository in 'owner/name' format`
            : "Manual repository must be provided in 'owner/name' format";

    throw new TypeError(`${requirement} (received ${received}).`);
}

/**
 * Provide specialised GitHub helpers for manual fetching without forcing
 * consumers to depend on unrelated operations.
 *
 * @returns {ManualGitHubClient}
 */
function createManualGitHubClient({
    userAgent,
    defaultCacheRoot,
    defaultRawRoot
} = {}) {
    if (typeof userAgent !== "string" || userAgent.length === 0) {
        throw new Error("A userAgent string is required.");
    }

    if (typeof defaultRawRoot !== "string" || defaultRawRoot.length === 0) {
        throw new Error(
            "A defaultRawRoot string is required to create the manual client."
        );
    }

    const baseHeaders = { "User-Agent": userAgent };
    if (process.env.GITHUB_TOKEN) {
        baseHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    async function curlRequest(url, { headers = {}, acceptJson = false } = {}) {
        const finalHeaders = { ...baseHeaders, ...headers };
        if (acceptJson) {
            finalHeaders.Accept = "application/vnd.github+json";
        }

        const response = await fetch(url, {
            headers: finalHeaders,
            redirect: "follow"
        });

        const bodyText = await response.text();
        if (!response.ok) {
            const errorMessage = bodyText || response.statusText;
            throw new Error(`Request failed for ${url}: ${errorMessage}`);
        }

        return bodyText;
    }

    const requestDispatcher = {
        /** @type {ManualGitHubRequestDispatcher} */
        execute: curlRequest
    };

    const references = createManualGitHubReferencesClient({
        request: requestDispatcher.execute
    });

    const fileFetcher = createManualGitHubFileClient({
        request: requestDispatcher.execute,
        defaultCacheRoot,
        defaultRawRoot
    });

    return {
        requestDispatcher,
        references,
        fileFetcher
    };
}

/**
 * @param {{ request: ManualGitHubRequestDispatcher["execute"] }} options
 * @returns {ManualGitHubReferencesClient}
 */
function createManualGitHubReferencesClient({ request }) {
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

    async function resolveManualRef(ref, { verbose, apiRoot }) {
        if (verbose.resolveRef) {
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

    return {
        resolveManualRef,
        resolveCommitFromRef
    };
}

/**
 * @param {{
 *   request: ManualGitHubRequestDispatcher["execute"],
 *   defaultCacheRoot?: string,
 *   defaultRawRoot: string
 * }} options
 * @returns {ManualGitHubFileClient}
 */
function createManualGitHubFileClient({
    request,
    defaultCacheRoot,
    defaultRawRoot
}) {
    async function fetchManualFile(
        sha,
        filePath,
        {
            forceRefresh = false,
            verbose = {},
            cacheRoot = defaultCacheRoot,
            rawRoot = defaultRawRoot
        } = {}
    ) {
        const shouldLogDetails = verbose.downloads && !verbose.progressBar;
        const cachePath = path.join(cacheRoot, sha, filePath);

        if (!forceRefresh) {
            try {
                const cached = await fs.readFile(cachePath, "utf8");
                if (shouldLogDetails) {
                    console.log(`[cache] ${filePath}`);
                }

                return cached;
            } catch (error) {
                if (error.code !== "ENOENT") {
                    throw error;
                }
            }
        }

        const startTime = Date.now();
        if (shouldLogDetails) {
            console.log(`[download] ${filePath}…`);
        }

        const url = `${rawRoot}/${sha}/${filePath}`;
        const content = await request(url);

        await ensureDir(path.dirname(cachePath));
        await fs.writeFile(cachePath, content, "utf8");

        if (shouldLogDetails) {
            console.log(
                `[done] ${filePath} (${formatBytes(content)} in ${formatDuration(
                    startTime
                )})`
            );
        }

        return content;
    }

    return {
        fetchManualFile
    };
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
    createManualGitHubClient
};
