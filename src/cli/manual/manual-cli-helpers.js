import fs from "node:fs/promises";
import path from "node:path";

import { SingleBar, Presets } from "cli-progress";

import { buildManualRepositoryEndpoints } from "../options/manual-repo.js";
import { DEFAULT_PROGRESS_BAR_WIDTH } from "../options/progress-bar.js";

const KB = 1024;
const MB = KB * 1024;

export function formatDuration(startTime) {
    const deltaMs = Date.now() - startTime;
    if (deltaMs < 1000) {
        return `${deltaMs}ms`;
    }

    return `${(deltaMs / 1000).toFixed(1)}s`;
}

function formatBytes(text) {
    const size = Buffer.byteLength(text, "utf8");
    if (size >= MB) {
        return `${(size / MB).toFixed(1)}MB`;
    }
    if (size >= KB) {
        return `${(size / KB).toFixed(1)}KB`;
    }

    return `${size}B`;
}

const activeProgressBars = new Map();

function createDefaultProgressBar(label, width) {
    return new SingleBar(
        {
            format: `${label} [{bar}] {value}/{total}`,
            barsize: width,
            hideCursor: true,
            clearOnComplete: true,
            linewrap: true
        },
        Presets.shades_classic
    );
}

let progressBarFactory = createDefaultProgressBar;

export function setProgressBarFactoryForTesting(factory) {
    progressBarFactory =
        typeof factory === "function" ? factory : createDefaultProgressBar;
}

export function disposeProgressBars() {
    for (const [, bar] of activeProgressBars) {
        try {
            bar.stop();
        } catch {
            // Ignore cleanup failures so disposal continues for remaining bars.
        }
    }
    activeProgressBars.clear();
}

export function renderProgressBar(
    label,
    current,
    total,
    width = DEFAULT_PROGRESS_BAR_WIDTH
) {
    if (!process.stdout.isTTY || width <= 0) {
        return;
    }

    const normalizedTotal = total > 0 ? total : 1;
    let bar = activeProgressBars.get(label);

    if (!bar) {
        bar = progressBarFactory(label, width);
        bar.start(normalizedTotal, Math.min(current, normalizedTotal));
        activeProgressBars.set(label, bar);
    } else {
        bar.setTotal(normalizedTotal);
        bar.update(Math.min(current, normalizedTotal));
    }

    if (current >= normalizedTotal) {
        bar.stop();
        activeProgressBars.delete(label);
    }
}

export function timeSync(label, fn, { verbose }) {
    if (verbose.parsing) {
        console.log(`→ ${label}`);
    }

    const startTime = Date.now();
    const result = fn();

    if (verbose.parsing) {
        console.log(`  ${label} completed in ${formatDuration(startTime)}.`);
    }

    return result;
}

export async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

export function createManualGitHubClient({
    userAgent,
    defaultCacheRoot,
    defaultRawRoot = buildManualRepositoryEndpoints().rawRoot
} = {}) {
    if (typeof userAgent !== "string" || userAgent.length === 0) {
        throw new Error("A userAgent string is required.");
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
        const payload = JSON.parse(body);

        if (!payload?.sha) {
            throw new Error(`Could not determine commit SHA for ref '${ref}'.`);
        }

        return { ref, sha: payload.sha };
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
        const tags = JSON.parse(body);

        if (!Array.isArray(tags) || tags.length === 0) {
            console.warn(
                "No manual tags found; defaulting to 'develop' branch."
            );
            return resolveCommitFromRef("develop", { apiRoot });
        }

        const { name, commit } = tags[0];
        return {
            ref: name,
            sha: commit?.sha ?? null
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
