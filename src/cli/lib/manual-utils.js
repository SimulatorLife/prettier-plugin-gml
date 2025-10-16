import path from "node:path";
import fs from "node:fs";
import { toTrimmedString } from "../../shared/string-utils.js";
import { isPlainObject } from "../../shared/object-utils.js";
import { formatBytes, formatDuration } from "../../shared/number-utils.js";
import { ensureDir } from "./file-system.js";

const MANUAL_REPO_ENV_VAR = "GML_MANUAL_REPO";
const DEFAULT_MANUAL_REPO = "YoYoGames/GameMaker-Manual";
const REPO_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;
const MANUAL_CACHE_ROOT_ENV_VAR = "GML_MANUAL_CACHE_ROOT";

function parseJsonOrThrow(text, description) {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new SyntaxError(
            `Failed to parse ${description} as JSON: ${error.message}`
        );
    }
}

function validateManualCommitPayload(payload, { ref }) {
    if (!isPlainObject(payload)) {
        throw new TypeError(
            `Unexpected payload while resolving manual ref '${ref}'. Expected an object.`
        );
    }

    if (typeof payload.sha !== "string" || payload.sha.length === 0) {
        throw new TypeError(
            `Manual ref '${ref}' response did not include a commit SHA.`
        );
    }

    return payload.sha;
}

function normalizeManualTagEntry(entry) {
    if (!isPlainObject(entry)) {
        throw new TypeError(
            "Manual tags response must contain objects with tag metadata."
        );
    }

    const { name, commit } = entry;
    if (typeof name !== "string" || name.length === 0) {
        throw new TypeError("Manual tag entry is missing a tag name.");
    }

    if (commit === undefined || commit === null) {
        return { name, sha: null };
    }

    if (!isPlainObject(commit)) {
        throw new TypeError(
            "Manual tag entry commit must be an object when provided."
        );
    }

    if (commit.sha === undefined || commit.sha === null) {
        return { name, sha: null };
    }

    if (typeof commit.sha !== "string" || commit.sha.length === 0) {
        throw new TypeError(
            "Manual tag entry commit SHA must be a non-empty string when provided."
        );
    }

    return { name, sha: commit.sha };
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

    async function resolveCommitFromRef(ref, { apiRoot }) {
        const url = `${apiRoot}/commits/${encodeURIComponent(ref)}`;
        const body = await curlRequest(url, { acceptJson: true });
        const payload = parseJsonOrThrow(body, "manual commit response");
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
        const body = await curlRequest(latestTagUrl, { acceptJson: true });
        const tags = parseJsonOrThrow(body, "manual tags response");

        if (!Array.isArray(tags) || tags.length === 0) {
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
        const content = await curlRequest(url);

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
        curlRequest,
        resolveManualRef,
        resolveCommitFromRef,
        fetchManualFile
    };
}

export {
    DEFAULT_MANUAL_REPO,
    MANUAL_CACHE_ROOT_ENV_VAR,
    MANUAL_REPO_ENV_VAR,
    buildManualRepositoryEndpoints,
    normalizeManualRepository,
    resolveManualRepoValue,
    resolveManualCacheRoot,
    createManualGitHubClient
};
