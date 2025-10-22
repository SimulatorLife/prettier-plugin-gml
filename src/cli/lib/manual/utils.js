import fs from "node:fs/promises";
import path from "node:path";
import {
    assertPlainObject,
    assertNonEmptyString,
    parseJsonWithContext,
    toTrimmedString
} from "../shared-deps.js";
import { formatDuration } from "../time-utils.js";
import { formatBytes } from "../byte-format.js";
import { isNonEmptyArray } from "../../../shared/utils.js";
import { writeManualFile } from "../manual-file-helpers.js";

const MANUAL_REPO_ENV_VAR = "GML_MANUAL_REPO";
const DEFAULT_MANUAL_REPO = "YoYoGames/GameMaker-Manual";
const REPO_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;
const MANUAL_CACHE_ROOT_ENV_VAR = "GML_MANUAL_CACHE_ROOT";

export const MANUAL_REPO_REQUIREMENT_SOURCE = Object.freeze({
    CLI: "cli",
    ENV: "env"
});

const MANUAL_REPO_REQUIREMENT_MESSAGES = Object.freeze({
    [MANUAL_REPO_REQUIREMENT_SOURCE.ENV]: `${MANUAL_REPO_ENV_VAR} must specify a GitHub repository in 'owner/name' format`,
    [MANUAL_REPO_REQUIREMENT_SOURCE.CLI]:
        "Manual repository must be provided in 'owner/name' format"
});

/**
 * @typedef {typeof MANUAL_REPO_REQUIREMENT_SOURCE[keyof typeof MANUAL_REPO_REQUIREMENT_SOURCE]} ManualRepoRequirementSource
 */

const MANUAL_REPO_REQUIREMENT_SOURCE_VALUES = Object.freeze(
    Object.values(MANUAL_REPO_REQUIREMENT_SOURCE)
);

function describeManualRepoInput(value) {
    if (value == null) {
        return String(value);
    }

    return `'${String(value)}'`;
}

/**
 * @param {ManualRepoRequirementSource | string | undefined} source
 * @returns {string}
 */
function getManualRepoRequirementMessage(source) {
    const requirement = MANUAL_REPO_REQUIREMENT_MESSAGES[source];
    if (requirement) {
        return requirement;
    }

    const allowedValues = MANUAL_REPO_REQUIREMENT_SOURCE_VALUES.join(", ");
    const received = source === undefined ? "undefined" : `'${String(source)}'`;

    throw new TypeError(
        `Manual repository requirement source must be one of: ${allowedValues}. Received ${received}.`
    );
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
 * @typedef {object} ManualGitHubCommitResolver
 * @property {(ref: string, options: { apiRoot: string }) => Promise<{ ref: string, sha: string }>}
 *   resolveCommitFromRef
 */

/**
 * @typedef {object} ManualGitHubRefResolver
 * @property {(ref: string | null | undefined, options: ManualGitHubResolveOptions) => Promise<{ ref: string, sha: string }>}
 *   resolveManualRef
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
 * collaborators that only needed one behaviour to depend on all of them. The
 * helpers below expose each concern behind its own focused facade so call sites
 * can compose only what they require.
 */

function createManualVerboseState({
    quiet = false,
    isTerminal = false,
    overrides
} = {}) {
    const state = {
        resolveRef: !quiet,
        downloads: !quiet,
        parsing: !quiet,
        progressBar: !quiet && isTerminal
    };

    if (!overrides || typeof overrides !== "object") {
        return state;
    }

    for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined) {
            state[key] = value;
        }
    }

    return state;
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

    const commitRecord =
        commit == null
            ? null
            : assertPlainObject(commit, {
                  errorMessage:
                      "Manual tag entry commit must be an object when provided."
              });

    const sha =
        commitRecord?.sha == null
            ? null
            : assertNonEmptyString(commitRecord.sha, {
                  name: "Manual tag entry commit SHA",
                  errorMessage:
                      "Manual tag entry commit SHA must be a non-empty string when provided."
              });

    return {
        name,
        sha
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

function resolveManualRepoValue(
    rawValue,
    { source = MANUAL_REPO_REQUIREMENT_SOURCE.CLI } = {}
) {
    const requirement = getManualRepoRequirementMessage(source);
    const normalized = normalizeManualRepository(rawValue);
    if (normalized) {
        return normalized;
    }

    const received = describeManualRepoInput(rawValue);

    throw new TypeError(`${requirement} (received ${received}).`);
}

/**
 * Provide specialised GitHub helpers for manual fetching without forcing
 * consumers to depend on unrelated operations.
 */
/**
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

    async function execute(url, { headers, acceptJson } = {}) {
        const finalHeaders = {
            ...baseHeaders,
            ...headers,
            ...(acceptJson ? { Accept: "application/vnd.github+json" } : {})
        };

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

    return Object.freeze({ execute });
}

/**
 * @param {{ requestDispatcher: ManualGitHubRequestDispatcher }} options
 * @returns {ManualGitHubCommitResolver}
 */
function createManualGitHubCommitResolver({ requestDispatcher }) {
    const request = requestDispatcher?.execute;
    if (typeof request !== "function") {
        throw new TypeError(
            "ManualGitHubCommitResolver requires a request dispatcher with an execute function."
        );
    }

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
    const request = requestDispatcher?.execute;
    if (typeof request !== "function") {
        throw new TypeError(
            "ManualGitHubRefResolver requires a request dispatcher with an execute function."
        );
    }

    const commitResolution =
        typeof commitResolver?.resolveCommitFromRef === "function"
            ? commitResolver
            : createManualGitHubCommitResolver({ requestDispatcher });
    const resolveCommitFromRef = commitResolution.resolveCommitFromRef;

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

    return Object.freeze({ resolveManualRef });
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
    const request = requestDispatcher?.execute;
    if (typeof request !== "function") {
        throw new TypeError(
            "ManualGitHubFileClient requires a request dispatcher with an execute function."
        );
    }

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

        await writeManualFile({
            outputPath: cachePath,
            contents: content,
            encoding: "utf8",
            onAfterWrite: () => {
                if (!shouldLogDetails) {
                    return;
                }

                console.log(
                    `[done] ${filePath} (${formatBytes(content)} in ${formatDuration(
                        startTime
                    )})`
                );
            }
        });

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
    createManualGitHubRequestDispatcher,
    createManualGitHubCommitResolver,
    createManualGitHubRefResolver,
    createManualGitHubFileClient
};
