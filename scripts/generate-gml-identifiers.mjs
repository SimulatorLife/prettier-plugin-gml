#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { CliUsageError, handleCliError } from "../src/shared/cli/cli-errors.js";
import {
    DEFAULT_PROGRESS_BAR_WIDTH,
    resolveProgressBarWidth
} from "./utils/progress-bar.js";

const MANUAL_REPO = "YoYoGames/GameMaker-Manual";
const API_ROOT = `https://api.github.com/repos/${MANUAL_REPO}`;
const RAW_ROOT = `https://raw.githubusercontent.com/${MANUAL_REPO}`;

const KB = 1024;
const MB = KB * 1024;

function assertSupportedNodeVersion() {
    const [major, minor] = process.versions.node
        .split(".")
        .map((part) => Number.parseInt(part, 10));
    if (Number.isNaN(major) || Number.isNaN(minor)) {
        throw new Error(
            `Unable to determine Node.js version from ${process.version}.`
        );
    }
    const minimum = { 18: 18, 20: 9 };
    if (major < 18) {
        throw new Error(
            `Node.js 18.18.0 or newer is required. Detected ${process.version}.`
        );
    }
    if (major === 18 && minor < minimum[18]) {
        throw new Error(
            `Node.js 18.18.0 or newer is required. Detected ${process.version}.`
        );
    }
    if (major === 20 && minor < minimum[20]) {
        throw new Error(
            `Node.js 20.9.0 or newer is required. Detected ${process.version}.`
        );
    }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const CACHE_ROOT = path.join(REPO_ROOT, "scripts", "cache", "manual");
const OUTPUT_DEFAULT = path.join(
    REPO_ROOT,
    "resources",
    "gml-identifiers.json"
);

const ARGUMENTS = process.argv.slice(2);

function getUsage() {
    return [
        "Usage: node scripts/generate-gml-identifiers.mjs [options]",
        "",
        "Options:",
        "  --ref, -r <git-ref>       Manual git ref (tag, branch, or commit). Defaults to latest tag.",
        "  --output, -o <path>       Output JSON path. Defaults to resources/gml-identifiers.json.",
        "  --force-refresh           Ignore cached manual artefacts and re-download.",
        "  --quiet                   Suppress progress logging (for CI).",
        "  --progress-bar-width <n>  Width of the terminal progress bar (default: 24).",
        "  --help, -h                Show this help message."
    ].join("\n");
}

function parseArgs() {
    let ref = process.env.GML_MANUAL_REF ?? null;
    let outputPath = OUTPUT_DEFAULT;
    let forceRefresh = false;
    let progressBarWidth = DEFAULT_PROGRESS_BAR_WIDTH;
    if (process.env.GML_PROGRESS_BAR_WIDTH !== undefined) {
        progressBarWidth = resolveProgressBarWidth(
            process.env.GML_PROGRESS_BAR_WIDTH,
            { usage: getUsage() }
        );
    }
    const verbose = {
        resolveRef: true,
        downloads: true,
        parsing: true,
        progressBar: process.stdout.isTTY === true
    };

    for (let i = 0; i < ARGUMENTS.length; i += 1) {
        const arg = ARGUMENTS[i];
        if ((arg === "--ref" || arg === "-r") && i + 1 < ARGUMENTS.length) {
            ref = ARGUMENTS[i + 1];
            i += 1;
        } else if (
            (arg === "--output" || arg === "-o") &&
            i + 1 < ARGUMENTS.length
        ) {
            outputPath = path.resolve(ARGUMENTS[i + 1]);
            i += 1;
        } else if (arg === "--force-refresh") {
            forceRefresh = true;
        } else if (arg === "--quiet") {
            verbose.resolveRef = false;
            verbose.downloads = false;
            verbose.parsing = false;
            verbose.progressBar = false;
        } else if (arg === "--progress-bar-width") {
            if (i + 1 >= ARGUMENTS.length) {
                throw new CliUsageError(
                    "--progress-bar-width requires a numeric value.",
                    { usage: getUsage() }
                );
            }
            progressBarWidth = resolveProgressBarWidth(ARGUMENTS[i + 1], {
                usage: getUsage()
            });
            i += 1;
        } else if (arg === "--help" || arg === "-h") {
            console.log(getUsage());
            process.exit(0);
        } else {
            throw new CliUsageError(`Unknown argument: ${arg}`, {
                usage: getUsage()
            });
        }
    }

    return { ref, outputPath, forceRefresh, verbose, progressBarWidth };
}

const BASE_HEADERS = {
    "User-Agent": "prettier-plugin-gml identifier generator"
};

if (process.env.GITHUB_TOKEN) {
    BASE_HEADERS.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

async function curlRequest(url, { headers = {}, acceptJson = false } = {}) {
    const finalHeaders = { ...BASE_HEADERS, ...headers };
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

async function ensureDir(dirPath) {
    await fs.mkdir(dirPath, { recursive: true });
}

async function resolveManualRef(ref, { verbose }) {
    if (verbose.resolveRef) {
        console.log(
            ref
                ? `Resolving manual reference '${ref}'…`
                : "Resolving latest manual tag…"
        );
    }
    if (ref) {
        return resolveCommitFromRef(ref);
    }

    const latestTagUrl = `${API_ROOT}/tags?per_page=1`;
    const body = await curlRequest(latestTagUrl, { acceptJson: true });
    const tags = JSON.parse(body);
    if (!Array.isArray(tags) || tags.length === 0) {
        console.warn("No manual tags found; defaulting to 'develop' branch.");
        return resolveCommitFromRef("develop");
    }
    const { name, commit } = tags[0];
    return {
        ref: name,
        sha: commit?.sha ?? null
    };
}

async function resolveCommitFromRef(ref) {
    const url = `${API_ROOT}/commits/${encodeURIComponent(ref)}`;
    const body = await curlRequest(url, { acceptJson: true });
    const payload = JSON.parse(body);
    if (!payload?.sha) {
        throw new Error(`Could not determine commit SHA for ref '${ref}'.`);
    }
    return { ref, sha: payload.sha };
}

function formatDuration(startTime) {
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

function renderProgressBar(
    label,
    current,
    total,
    width = DEFAULT_PROGRESS_BAR_WIDTH
) {
    if (!process.stdout.isTTY || width <= 0) {
        return;
    }
    const denominator = total > 0 ? total : 1;
    const ratio = Math.min(Math.max(current / denominator, 0), 1);
    const filled = Math.round(ratio * width);
    const bar = `${"#".repeat(filled)}${"-".repeat(Math.max(width - filled, 0))}`;
    const message = `${label} [${bar}] ${current}/${total}`;
    process.stdout.write(`\r${message}`);
    if (current >= total) {
        process.stdout.write("\n");
    }
}

function timeSync(label, fn, { verbose }) {
    if (verbose.parsing) {
        console.log(`→ ${label}`);
    }
    const start = Date.now();
    const result = fn();
    if (verbose.parsing) {
        console.log(`  ${label} completed in ${formatDuration(start)}.`);
    }
    return result;
}

async function fetchManualFile(
    sha,
    filePath,
    { forceRefresh = false, verbose }
) {
    const shouldLogDetails = verbose.downloads && !verbose.progressBar;
    const cachePath = path.join(CACHE_ROOT, sha, filePath);
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

    const start = Date.now();
    if (shouldLogDetails) {
        console.log(`[download] ${filePath}…`);
    }
    const url = `${RAW_ROOT}/${sha}/${filePath}`;
    const content = await curlRequest(url);
    await ensureDir(path.dirname(cachePath));
    await fs.writeFile(cachePath, content, "utf8");
    if (shouldLogDetails) {
        console.log(
            `[done] ${filePath} (${formatBytes(content)} in ${formatDuration(start)})`
        );
    }
    return content;
}

function parseArrayLiteral(source, identifier) {
    const declaration = `const ${identifier} = [`;
    const start = source.indexOf(declaration);
    if (start === -1) {
        throw new Error(
            `Could not locate declaration for ${identifier} in gml.js`
        );
    }
    const bracketStart = source.indexOf("[", start);
    if (bracketStart === -1) {
        throw new Error(`Malformed array literal for ${identifier}`);
    }

    let index = bracketStart;
    let depth = 0;
    let inString = null;
    let escaped = false;
    while (index < source.length) {
        const char = source[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === "\\") {
                escaped = true;
            } else if (char === inString) {
                inString = null;
            }
        } else {
            if (char === '"' || char === "'" || char === "`") {
                inString = char;
            } else if (char === "[") {
                depth += 1;
            } else if (char === "]") {
                depth -= 1;
                if (depth === 0) {
                    index += 1;
                    break;
                }
            }
        }
        index += 1;
    }

    const literal = source.slice(bracketStart, index);
    try {
        return vm.runInNewContext(literal, {}, { timeout: 5000 });
    } catch (error) {
        throw new Error(
            `Failed to evaluate array literal for ${identifier}: ${error.message}`
        );
    }
}

function classifyFromPath(manualPath, tagList) {
    const normalizedTags = new Set(tagList.map((tag) => tag.toLowerCase()));
    const segments = manualPath.split("/").map((part) => part.toLowerCase());
    const hasSegment = (needles) =>
        segments.some((segment) =>
            needles.some((needle) => segment.includes(needle))
        );

    const tagHas = (needles) =>
        needles.some((needle) => normalizedTags.has(needle));

    if (hasSegment(["functions"]) || tagHas(["function", "functions"])) {
        return "function";
    }
    if (hasSegment(["methods"]) || tagHas(["method", "methods"])) {
        return "method";
    }
    if (hasSegment(["events"]) || tagHas(["event", "events"])) {
        return "event";
    }
    if (hasSegment(["variables"]) || tagHas(["variable", "variables"])) {
        return "variable";
    }
    if (hasSegment(["accessors"]) || tagHas(["accessor", "accessors"])) {
        return "accessor";
    }
    if (hasSegment(["properties"]) || tagHas(["property", "properties"])) {
        return "property";
    }
    if (hasSegment(["macros"]) || tagHas(["macro", "macros"])) {
        return "macro";
    }
    if (hasSegment(["constants"]) || tagHas(["constant", "constants"])) {
        return "constant";
    }
    if (hasSegment(["enums"]) || tagHas(["enum", "enums"])) {
        return "enum";
    }
    if (hasSegment(["structs"]) || tagHas(["struct", "structs"])) {
        return "struct";
    }
    if (hasSegment(["layers"]) && hasSegment(["functions"])) {
        return "function";
    }
    if (hasSegment(["shaders"]) && hasSegment(["constants"])) {
        return "constant";
    }
    return "unknown";
}

const TYPE_PRIORITY = new Map([
    ["unknown", 0],
    ["guide", 1],
    ["reference", 1],
    ["keyword", 10],
    ["literal", 20],
    ["symbol", 30],
    ["macro", 40],
    ["constant", 50],
    ["enum", 60],
    ["variable", 70],
    ["property", 72],
    ["accessor", 75],
    ["event", 80],
    ["struct", 82],
    ["method", 85],
    ["function", 90]
]);

function mergeEntry(map, identifier, data) {
    const current = map.get(identifier);
    if (!current) {
        map.set(identifier, {
            type: data.type ?? "unknown",
            sources: new Set(data.sources ?? []),
            manualPath: data.manualPath ?? null,
            tags: new Set(data.tags ?? []),
            deprecated: Boolean(data.deprecated)
        });
        return;
    }

    for (const source of data.sources ?? []) {
        current.sources.add(source);
    }
    for (const tag of data.tags ?? []) {
        current.tags.add(tag);
    }
    if (data.manualPath && !current.manualPath) {
        current.manualPath = data.manualPath;
    }
    if (data.deprecated) {
        current.deprecated = true;
    }

    const incomingType = data.type ?? "unknown";
    const currentPriority = TYPE_PRIORITY.get(current.type) ?? 0;
    const incomingPriority = TYPE_PRIORITY.get(incomingType) ?? 0;
    if (incomingPriority > currentPriority) {
        current.type = incomingType;
    }
}

function normaliseIdentifier(name) {
    return name.trim();
}

async function main() {
    assertSupportedNodeVersion();

    const { ref, outputPath, forceRefresh, verbose, progressBarWidth } =
        parseArgs();
    const startTime = Date.now();

    const manualRef = await resolveManualRef(ref, { verbose });
    if (!manualRef.sha) {
        throw new Error(
            `Unable to resolve manual commit SHA for ref '${manualRef.ref}'.`
        );
    }

    console.log(`Using manual ref '${manualRef.ref}' (${manualRef.sha}).`);

    const manualAssets = [
        {
            key: "gmlSource",
            path: "Manual/contents/assets/scripts/gml.js",
            label: "gml.js"
        },
        { key: "keywords", path: "ZeusDocs_keywords.json", label: "keywords" },
        { key: "tags", path: "ZeusDocs_tags.json", label: "tags" }
    ];
    const downloadsTotal = manualAssets.length;
    if (verbose.downloads) {
        console.log(
            `Fetching ${downloadsTotal} manual asset${
                downloadsTotal === 1 ? "" : "s"
            }…`
        );
    }

    const fetchedPayloads = {};
    let fetchedCount = 0;
    for (const asset of manualAssets) {
        fetchedPayloads[asset.key] = await fetchManualFile(
            manualRef.sha,
            asset.path,
            { forceRefresh, verbose }
        );
        fetchedCount += 1;
        if (verbose.progressBar && verbose.downloads) {
            renderProgressBar(
                "Downloading manual assets",
                fetchedCount,
                downloadsTotal,
                progressBarWidth
            );
        } else if (verbose.downloads) {
            console.log(`✓ ${asset.path}`);
        }
    }

    const gmlSource = fetchedPayloads.gmlSource;
    const keywordsArray = timeSync(
        "Parsing keyword array",
        () => parseArrayLiteral(gmlSource, "KEYWORDS"),
        { verbose }
    );
    const literalsArray = timeSync(
        "Parsing literal array",
        () => parseArrayLiteral(gmlSource, "LITERALS"),
        { verbose }
    );
    const symbolsArray = timeSync(
        "Parsing symbol array",
        () => parseArrayLiteral(gmlSource, "SYMBOLS"),
        { verbose }
    );

    const identifierMap = new Map();

    timeSync(
        "Collecting keywords",
        () => {
            for (const keyword of keywordsArray) {
                const identifier = normaliseIdentifier(keyword);
                mergeEntry(identifierMap, identifier, {
                    type: "keyword",
                    sources: ["manual:gml.js:KEYWORDS"]
                });
            }
        },
        { verbose }
    );

    timeSync(
        "Collecting literals",
        () => {
            for (const literal of literalsArray) {
                const identifier = normaliseIdentifier(literal);
                mergeEntry(identifierMap, identifier, {
                    type: "literal",
                    sources: ["manual:gml.js:LITERALS"]
                });
            }
        },
        { verbose }
    );

    timeSync(
        "Collecting symbols",
        () => {
            for (const symbol of symbolsArray) {
                const identifier = normaliseIdentifier(symbol);
                mergeEntry(identifierMap, identifier, {
                    type: "symbol",
                    sources: ["manual:gml.js:SYMBOLS"]
                });
            }
        },
        { verbose }
    );

    if (verbose.parsing) {
        console.log("Merging manual keyword metadata…");
    }

    const keywordsJson = fetchedPayloads.keywords;
    const tagsJsonText = fetchedPayloads.tags;

    const manualKeywords = timeSync(
        "Decoding ZeusDocs keywords",
        () => JSON.parse(keywordsJson),
        { verbose }
    );
    const manualTags = timeSync(
        "Decoding ZeusDocs tags",
        () => JSON.parse(tagsJsonText),
        { verbose }
    );

    const IDENTIFIER_PATTERN = /^[A-Za-z0-9_$.]+$/;

    timeSync(
        "Classifying manual identifiers",
        () => {
            for (const [rawIdentifier, manualPath] of Object.entries(
                manualKeywords
            )) {
                const identifier = normaliseIdentifier(rawIdentifier);
                if (!IDENTIFIER_PATTERN.test(identifier)) {
                    continue;
                }

                if (typeof manualPath !== "string" || manualPath.length === 0) {
                    continue;
                }

                const normalisedPath = manualPath.replace(/\\/g, "/");
                if (
                    !normalisedPath.startsWith("3_Scripting") ||
                    !normalisedPath.includes("4_GML_Reference")
                ) {
                    continue;
                }

                const tagKeyCandidates = [
                    `${normalisedPath}.html`,
                    `${normalisedPath}/index.html`
                ];
                let tagEntry;
                for (const key of tagKeyCandidates) {
                    if (manualTags[key]) {
                        tagEntry = manualTags[key];
                        break;
                    }
                }
                const tags = tagEntry
                    ? tagEntry
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                    : [];

                const type = classifyFromPath(normalisedPath, tags);
                const deprecated =
                    tags.some((tag) =>
                        tag.toLowerCase().includes("deprecated")
                    ) || normalisedPath.toLowerCase().includes("deprecated");

                mergeEntry(identifierMap, identifier, {
                    type,
                    sources: ["manual:ZeusDocs_keywords.json"],
                    manualPath: normalisedPath,
                    tags,
                    deprecated
                });
            }
        },
        { verbose }
    );

    const sortedIdentifiers = timeSync(
        "Sorting identifiers",
        () =>
            Array.from(identifierMap.entries())
                .map(([identifier, data]) => [
                    identifier,
                    {
                        type: data.type,
                        sources: Array.from(data.sources).sort(),
                        manualPath: data.manualPath,
                        tags: Array.from(data.tags).sort(),
                        deprecated: data.deprecated
                    }
                ])
                .sort(([a], [b]) => a.localeCompare(b)),
        { verbose }
    );

    const payload = {
        meta: {
            manualRef: manualRef.ref,
            commitSha: manualRef.sha,
            generatedAt: new Date().toISOString(),
            source: MANUAL_REPO
        },
        identifiers: Object.fromEntries(sortedIdentifiers)
    };

    await ensureDir(path.dirname(outputPath));
    await fs.writeFile(
        outputPath,
        `${JSON.stringify(payload, null, 2)}\n`,
        "utf8"
    );

    console.log(
        `Wrote ${sortedIdentifiers.length} identifiers to ${outputPath}`
    );
    if (verbose.parsing) {
        console.log(`Completed in ${formatDuration(startTime)}.`);
    }
}

async function run() {
    await main();
}

run().catch((error) => {
    handleCliError(error, {
        prefix: "Failed to generate GML identifiers."
    });
});
