import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { CliUsageError, handleCliError } from "../shared/cli-errors.js";
import {
    assertSupportedNodeVersion,
    createManualGithubClient,
    ensureDir,
    formatDuration,
    renderProgressBar,
    timeSync
} from "./manual/manual-cli-helpers.js";
import {
    DEFAULT_PROGRESS_BAR_WIDTH,
    resolveProgressBarWidth
} from "./options/progress-bar.js";
import {
    MANUAL_CACHE_ROOT_ENV_VAR,
    resolveManualCacheRoot
} from "./options/manual-cache.js";
import {
    DEFAULT_MANUAL_REPO,
    MANUAL_REPO_ENV_VAR,
    buildManualRepositoryEndpoints,
    resolveManualRepoValue
} from "./options/manual-repo.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_CACHE_ROOT = resolveManualCacheRoot({ repoRoot: REPO_ROOT });
const OUTPUT_DEFAULT = path.join(
    REPO_ROOT,
    "resources",
    "gml-identifiers.json"
);

const manualClient = createManualGithubClient({
    userAgent: "prettier-plugin-gml identifier generator",
    defaultCacheRoot: DEFAULT_CACHE_ROOT
});

const { fetchManualFile, resolveManualRef } = manualClient;

function getUsage({
    cacheRoot = DEFAULT_CACHE_ROOT,
    manualRepo = DEFAULT_MANUAL_REPO,
    progressBarWidth = DEFAULT_PROGRESS_BAR_WIDTH
} = {}) {
    return [
        "Usage: node scripts/generate-gml-identifiers.mjs [options]",
        "",
        "Options:",
        "  --ref, -r <git-ref>       Manual git ref (tag, branch, or commit). Defaults to latest tag.",
        "  --output, -o <path>       Output JSON path. Defaults to resources/gml-identifiers.json.",
        "  --force-refresh           Ignore cached manual artefacts and re-download.",
        "  --quiet                   Suppress progress logging (for CI).",
        `  --progress-bar-width <n>  Width of the terminal progress bar (default: ${progressBarWidth}).`,
        `  --manual-repo <owner/name> GitHub repository hosting the manual (default: ${manualRepo}).`,
        `                             Can also be set via ${MANUAL_REPO_ENV_VAR}.`,
        `  --cache-root <path>       Directory to store cached manual artefacts (default: ${cacheRoot}).`,
        `                             Can also be set via ${MANUAL_CACHE_ROOT_ENV_VAR}.`,
        "  --help, -h                Show this help message."
    ].join("\n");
}

function parseArgs({
    argv = process.argv.slice(2),
    env = process.env,
    isTty = process.stdout.isTTY === true
} = {}) {
    let ref = env.GML_MANUAL_REF ?? null;
    let outputPath = OUTPUT_DEFAULT;
    let forceRefresh = false;
    let progressBarWidth = DEFAULT_PROGRESS_BAR_WIDTH;
    let cacheRoot = DEFAULT_CACHE_ROOT;
    let manualRepo = DEFAULT_MANUAL_REPO;

    const usage = () => getUsage({ cacheRoot, manualRepo, progressBarWidth });

    if (env.GML_PROGRESS_BAR_WIDTH !== undefined) {
        progressBarWidth = resolveProgressBarWidth(env.GML_PROGRESS_BAR_WIDTH, {
            usage: usage()
        });
    }
    if (env[MANUAL_REPO_ENV_VAR] !== undefined) {
        manualRepo = resolveManualRepoValue(env[MANUAL_REPO_ENV_VAR], {
            usage: usage(),
            source: "env"
        });
    }
    const verbose = {
        resolveRef: true,
        downloads: true,
        parsing: true,
        progressBar: isTty
    };

    const args = Array.from(argv);
    let showHelp = false;

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if ((arg === "--ref" || arg === "-r") && i + 1 < args.length) {
            ref = args[i + 1];
            i += 1;
        } else if (
            (arg === "--output" || arg === "-o") &&
            i + 1 < args.length
        ) {
            outputPath = path.resolve(args[i + 1]);
            i += 1;
        } else if (arg === "--force-refresh") {
            forceRefresh = true;
        } else if (arg === "--quiet") {
            verbose.resolveRef = false;
            verbose.downloads = false;
            verbose.parsing = false;
            verbose.progressBar = false;
        } else if (arg === "--progress-bar-width") {
            if (i + 1 >= args.length) {
                throw new CliUsageError(
                    "--progress-bar-width requires a numeric value.",
                    { usage: usage() }
                );
            }
            progressBarWidth = resolveProgressBarWidth(args[i + 1], {
                usage: usage()
            });
            i += 1;
        } else if (arg === "--manual-repo") {
            if (i + 1 >= args.length) {
                throw new CliUsageError(
                    "--manual-repo requires a repository value.",
                    { usage: usage() }
                );
            }
            manualRepo = resolveManualRepoValue(args[i + 1], {
                usage: usage()
            });
            i += 1;
        } else if (arg === "--cache-root") {
            if (i + 1 >= args.length) {
                throw new CliUsageError("--cache-root requires a path value.", {
                    usage: usage()
                });
            }
            cacheRoot = path.resolve(args[i + 1]);
            i += 1;
        } else if (arg === "--help" || arg === "-h") {
            showHelp = true;
            break;
        } else {
            throw new CliUsageError(`Unknown argument: ${arg}`, {
                usage: usage()
            });
        }
    }

    const usageText = usage();

    return {
        ref,
        outputPath,
        forceRefresh,
        verbose,
        progressBarWidth,
        cacheRoot,
        manualRepo,
        showHelp,
        usage: usageText
    };
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

async function main({ argv, env, isTty } = {}) {
    assertSupportedNodeVersion();

    const {
        ref,
        outputPath,
        forceRefresh,
        verbose,
        progressBarWidth,
        cacheRoot,
        manualRepo,
        showHelp,
        usage
    } = parseArgs({ argv, env, isTty });

    if (showHelp) {
        console.log(usage);
        return 0;
    }
    const { apiRoot, rawRoot } = buildManualRepositoryEndpoints(manualRepo);
    const startTime = Date.now();

    const manualRef = await resolveManualRef(ref, { verbose, apiRoot });
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
            { forceRefresh, verbose, cacheRoot, rawRoot }
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
            source: manualRepo
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
    return 0;
}

export async function runGenerateGmlIdentifiersCli({
    argv = process.argv.slice(2),
    env = process.env,
    isTty = process.stdout.isTTY === true
} = {}) {
    try {
        return await main({ argv, env, isTty });
    } catch (error) {
        handleCliError(error, {
            prefix: "Failed to generate GML identifiers."
        });
        return 1;
    }
}
