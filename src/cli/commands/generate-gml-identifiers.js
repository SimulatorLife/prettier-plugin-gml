import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { Command, InvalidArgumentError } from "commander";

import { handleCliError } from "../lib/cli-errors.js";
import { assertSupportedNodeVersion } from "../lib/node-version.js";
import { toPosixPath } from "../../shared/path-utils.js";
import { toNormalizedLowerCaseSet } from "../../shared/string-utils.js";
import { ensureDir } from "../lib/file-system.js";
import {
    createManualGitHubClient,
    DEFAULT_MANUAL_REPO,
    buildManualRepositoryEndpoints,
    resolveManualRepoValue,
    resolveManualCacheRoot
} from "../lib/manual-utils.js";
import { formatDuration, timeSync } from "../../shared/number-utils.js";
import {
    renderProgressBar,
    disposeProgressBars,
    resolveProgressBarWidth,
    getDefaultProgressBarWidth
} from "../lib/progress-bar.js";
import {
    DEFAULT_VM_EVAL_TIMEOUT_MS,
    resolveVmEvalTimeout
} from "../lib/vm-eval-timeout.js";
import { parseCommandLine } from "./command-parsing.js";
import { applyManualEnvOptionOverrides } from "../lib/manual-env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_CACHE_ROOT = resolveManualCacheRoot({ repoRoot: REPO_ROOT });
const OUTPUT_DEFAULT = path.join(
    REPO_ROOT,
    "resources",
    "gml-identifiers.json"
);

const { rawRoot: DEFAULT_MANUAL_RAW_ROOT } = buildManualRepositoryEndpoints();

const manualClient = createManualGitHubClient({
    userAgent: "prettier-plugin-gml identifier generator",
    defaultCacheRoot: DEFAULT_CACHE_ROOT,
    defaultRawRoot: DEFAULT_MANUAL_RAW_ROOT
});

const { fetchManualFile, resolveManualRef } = manualClient;

function createGenerateIdentifiersCommand() {
    const command = new Command()
        .name("generate-gml-identifiers")
        .usage("[options]")
        .description(
            "Generate the gml-identifiers.json artefact from the GameMaker manual."
        )
        .exitOverride()
        .allowExcessArguments(false)
        .helpOption("-h, --help", "Show this help message.")
        .showHelpAfterError("(add --help for usage information)")
        .option(
            "-r, --ref <git-ref>",
            "Manual git ref (tag, branch, or commit)."
        )
        .option(
            "-o, --output <path>",
            `Output JSON path (default: ${OUTPUT_DEFAULT}).`,
            (value) => path.resolve(value),
            OUTPUT_DEFAULT
        )
        .option(
            "--force-refresh",
            "Ignore cached manual artefacts and re-download."
        )
        .option("--quiet", "Suppress progress logging (useful in CI).")
        .option(
            "--vm-eval-timeout-ms <ms>",
            `Maximum time in milliseconds to evaluate manual identifier arrays (default: ${DEFAULT_VM_EVAL_TIMEOUT_MS}). Set to 0 to disable the timeout.`,
            (value) => {
                try {
                    return resolveVmEvalTimeout(value);
                } catch (error) {
                    throw new InvalidArgumentError(error.message);
                }
            },
            DEFAULT_VM_EVAL_TIMEOUT_MS
        )
        .option(
            "--progress-bar-width <columns>",
            `Width of progress bars rendered in the terminal (default: ${getDefaultProgressBarWidth()}).`,
            (value) => {
                try {
                    return resolveProgressBarWidth(value);
                } catch (error) {
                    throw new InvalidArgumentError(error.message);
                }
            },
            getDefaultProgressBarWidth()
        )
        .option(
            "--manual-repo <owner/name>",
            `GitHub repository hosting the manual (default: ${DEFAULT_MANUAL_REPO}).`,
            (value) => {
                try {
                    return resolveManualRepoValue(value);
                } catch (error) {
                    throw new InvalidArgumentError(error.message);
                }
            },
            DEFAULT_MANUAL_REPO
        )
        .option(
            "--cache-root <path>",
            `Directory to store cached manual artefacts (default: ${DEFAULT_CACHE_ROOT}).`,
            (value) => path.resolve(value),
            DEFAULT_CACHE_ROOT
        );

    return command;
}

function parseArgs({
    argv = process.argv.slice(2),
    env = process.env,
    isTty = process.stdout.isTTY === true
} = {}) {
    const command = createGenerateIdentifiersCommand();

    applyManualEnvOptionOverrides({ command, env });

    const verbose = {
        resolveRef: true,
        downloads: true,
        parsing: true,
        progressBar: isTty
    };

    const { helpRequested, usage } = parseCommandLine(command, argv);
    if (helpRequested) {
        return {
            helpRequested: true,
            usage
        };
    }

    const options = command.opts();

    if (options.quiet) {
        verbose.resolveRef = false;
        verbose.downloads = false;
        verbose.parsing = false;
        verbose.progressBar = false;
    }

    return {
        ref: options.ref,
        outputPath: options.output ?? OUTPUT_DEFAULT,
        forceRefresh: Boolean(options.forceRefresh),
        verbose,
        vmEvalTimeoutMs:
            options.vmEvalTimeoutMs === undefined
                ? DEFAULT_VM_EVAL_TIMEOUT_MS
                : options.vmEvalTimeoutMs,
        progressBarWidth:
            options.progressBarWidth ?? getDefaultProgressBarWidth(),
        cacheRoot: options.cacheRoot ?? DEFAULT_CACHE_ROOT,
        manualRepo: options.manualRepo ?? DEFAULT_MANUAL_REPO,
        helpRequested: false,
        usage
    };
}

function parseArrayLiteral(source, identifier, { timeoutMs } = {}) {
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
    let inString;
    let escaped = false;
    while (index < source.length) {
        const char = source[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === "\\") {
                escaped = true;
            } else if (char === inString) {
                inString = undefined;
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
    const vmOptions = {};
    if (typeof timeoutMs === "number" && timeoutMs > 0) {
        vmOptions.timeout = timeoutMs;
    }

    try {
        return vm.runInNewContext(literal, {}, vmOptions);
    } catch (error) {
        throw new Error(
            `Failed to evaluate array literal for ${identifier}: ${error.message}`
        );
    }
}

function classifyFromPath(manualPath, tagList) {
    const normalizedTags = toNormalizedLowerCaseSet(tagList);
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
            manualPath: data.manualPath,
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
    try {
        assertSupportedNodeVersion();

        const {
            ref,
            outputPath,
            forceRefresh,
            verbose,
            vmEvalTimeoutMs,
            progressBarWidth,
            cacheRoot,
            manualRepo,
            helpRequested
        } = parseArgs({ argv, env, isTty });

        if (helpRequested) {
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
            {
                key: "keywords",
                path: "ZeusDocs_keywords.json",
                label: "keywords"
            },
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
            () =>
                parseArrayLiteral(gmlSource, "KEYWORDS", {
                    timeoutMs: vmEvalTimeoutMs
                }),
            { verbose }
        );
        const literalsArray = timeSync(
            "Parsing literal array",
            () =>
                parseArrayLiteral(gmlSource, "LITERALS", {
                    timeoutMs: vmEvalTimeoutMs
                }),
            { verbose }
        );
        const symbolsArray = timeSync(
            "Parsing symbol array",
            () =>
                parseArrayLiteral(gmlSource, "SYMBOLS", {
                    timeoutMs: vmEvalTimeoutMs
                }),
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

                    if (
                        typeof manualPath !== "string" ||
                        manualPath.length === 0
                    ) {
                        continue;
                    }

                    const normalisedPath = toPosixPath(manualPath);
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
                        ) ||
                        normalisedPath.toLowerCase().includes("deprecated");

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
                [...identifierMap.entries()]
                    .map(([identifier, data]) => [
                        identifier,
                        {
                            type: data.type,
                            sources: [...data.sources].sort(),
                            manualPath: data.manualPath,
                            tags: [...data.tags].sort(),
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
            `${JSON.stringify(payload, undefined, 2)}\n`,
            "utf8"
        );

        console.log(
            `Wrote ${sortedIdentifiers.length} identifiers to ${outputPath}`
        );
        if (verbose.parsing) {
            console.log(`Completed in ${formatDuration(startTime)}.`);
        }
        return 0;
    } finally {
        disposeProgressBars();
    }
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
