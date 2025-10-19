import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import { Command, InvalidArgumentError } from "commander";

import { CliUsageError } from "../lib/cli-errors.js";
import { assertSupportedNodeVersion } from "../lib/node-version.js";
import { toNormalizedLowerCaseSet, toPosixPath } from "../lib/shared-deps.js";
import { ensureDir } from "../lib/file-system.js";
import {
    DEFAULT_MANUAL_REPO,
    resolveManualRepoValue
} from "../lib/manual-utils.js";
import { timeSync, createVerboseDurationLogger } from "../lib/time-utils.js";
import {
    renderProgressBar,
    disposeProgressBars,
    resolveProgressBarWidth,
    getDefaultProgressBarWidth
} from "../lib/progress-bar.js";
import {
    resolveVmEvalTimeout,
    getDefaultVmEvalTimeoutMs
} from "../lib/vm-eval-timeout.js";
import {
    applyManualEnvOptionOverrides,
    IDENTIFIER_VM_TIMEOUT_ENV_VAR
} from "../lib/manual-env.js";
import { applyStandardCommandOptions } from "../lib/command-standard-options.js";
import { resolveManualCommandOptions } from "../lib/manual-command-options.js";
import { createManualCommandContext } from "../lib/manual-command-context.js";

const {
    repoRoot: REPO_ROOT,
    defaultCacheRoot: DEFAULT_CACHE_ROOT,
    defaultOutputPath: OUTPUT_DEFAULT,
    fetchManualFile,
    resolveManualRef
} = createManualCommandContext({
    importMetaUrl: import.meta.url,
    userAgent: "prettier-plugin-gml identifier generator",
    outputFileName: "gml-identifiers.json"
});

export function createGenerateIdentifiersCommand({ env = process.env } = {}) {
    const command = applyStandardCommandOptions(
        new Command()
            .name("generate-gml-identifiers")
            .usage("[options]")
            .description(
                "Generate the gml-identifiers.json artefact from the GameMaker manual."
            )
    )
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
            `Maximum time in milliseconds to evaluate manual identifier arrays (default: ${getDefaultVmEvalTimeoutMs()}). Set to 0 to disable the timeout.`,
            (value) => {
                try {
                    return resolveVmEvalTimeout(value);
                } catch (error) {
                    throw new InvalidArgumentError(error.message);
                }
            },
            getDefaultVmEvalTimeoutMs()
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

    applyManualEnvOptionOverrides({
        command,
        env,
        additionalOverrides: [
            {
                envVar: IDENTIFIER_VM_TIMEOUT_ENV_VAR,
                optionName: "vmEvalTimeoutMs",
                resolveValue: resolveVmEvalTimeout
            }
        ]
    });

    return command;
}

function resolveGenerateIdentifierOptions(command) {
    return resolveManualCommandOptions(command, {
        defaults: {
            outputPath: OUTPUT_DEFAULT,
            cacheRoot: DEFAULT_CACHE_ROOT,
            manualRepo: DEFAULT_MANUAL_REPO
        },
        mapExtras: ({ options }) => ({
            vmEvalTimeoutMs:
                options.vmEvalTimeoutMs === undefined
                    ? getDefaultVmEvalTimeoutMs()
                    : options.vmEvalTimeoutMs
        })
    });
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

const CLASSIFICATION_RULES = [
    {
        type: "function",
        segments: ["functions"],
        tags: ["function", "functions"]
    },
    { type: "method", segments: ["methods"], tags: ["method", "methods"] },
    { type: "event", segments: ["events"], tags: ["event", "events"] },
    {
        type: "variable",
        segments: ["variables"],
        tags: ["variable", "variables"]
    },
    {
        type: "accessor",
        segments: ["accessors"],
        tags: ["accessor", "accessors"]
    },
    {
        type: "property",
        segments: ["properties"],
        tags: ["property", "properties"]
    },
    { type: "macro", segments: ["macros"], tags: ["macro", "macros"] },
    {
        type: "constant",
        segments: ["constants"],
        tags: ["constant", "constants"]
    },
    { type: "enum", segments: ["enums"], tags: ["enum", "enums"] },
    { type: "struct", segments: ["structs"], tags: ["struct", "structs"] }
];

const CO_OCCURRENCE_RULES = [
    { type: "function", requiredSegments: [["layers"], ["functions"]] },
    { type: "constant", requiredSegments: [["shaders"], ["constants"]] }
];

function classifyFromPath(manualPath, tagList) {
    const normalizedTags = toNormalizedLowerCaseSet(tagList);
    const segments = manualPath.split("/").map((part) => part.toLowerCase());

    const segmentMatches = (needle) =>
        segments.some((segment) => segment.includes(needle));
    const tagMatches = (needle) => normalizedTags.has(needle);

    const matchesAny = (needles = [], matcher) => needles.some(matcher);
    const matchesAllGroups = (groups = []) =>
        groups.length > 0 &&
        groups.every((needles) => matchesAny(needles, segmentMatches));

    for (const {
        type,
        segments: segmentNeedles = [],
        tags: tagNeedles = []
    } of CLASSIFICATION_RULES) {
        if (
            matchesAny(segmentNeedles, segmentMatches) ||
            matchesAny(tagNeedles, tagMatches)
        ) {
            return type;
        }
    }

    for (const { type, requiredSegments = [] } of CO_OCCURRENCE_RULES) {
        if (matchesAllGroups(requiredSegments)) {
            return type;
        }
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

function collectManualArrayIdentifiers(
    identifierMap,
    values,
    { type, source }
) {
    const entry = { type, sources: [source] };

    for (const value of values) {
        const identifier = normaliseIdentifier(value);
        mergeEntry(identifierMap, identifier, entry);
    }
}

const DOWNLOAD_PROGRESS_LABEL = "Downloading manual assets";

async function fetchManualAssets(
    manualRefSha,
    manualAssets,
    { forceRefresh, verbose, cacheRoot, rawRoot, progressBarWidth }
) {
    const payloads = {};
    let fetchedCount = 0;
    const downloadsTotal = manualAssets.length;

    for (const asset of manualAssets) {
        payloads[asset.key] = await fetchManualFile(manualRefSha, asset.path, {
            forceRefresh,
            verbose,
            cacheRoot,
            rawRoot
        });

        fetchedCount += 1;
        if (verbose.progressBar && verbose.downloads) {
            renderProgressBar(
                DOWNLOAD_PROGRESS_LABEL,
                fetchedCount,
                downloadsTotal,
                progressBarWidth
            );
        } else if (verbose.downloads) {
            console.log(`✓ ${asset.path}`);
        }
    }

    return payloads;
}

export async function runGenerateGmlIdentifiers({ command } = {}) {
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
            usage
        } = resolveGenerateIdentifierOptions(command);

        const { apiRoot, rawRoot } = buildManualRepositoryEndpoints(manualRepo);
        const logCompletion = createVerboseDurationLogger({ verbose });

        const manualRef = await resolveManualRef(ref, { verbose, apiRoot });
        if (!manualRef.sha) {
            throw new CliUsageError(
                `Unable to resolve manual commit SHA for ref '${manualRef.ref}'.`,
                { usage }
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

        const fetchedPayloads = await fetchManualAssets(
            manualRef.sha,
            manualAssets,
            { forceRefresh, verbose, cacheRoot, rawRoot, progressBarWidth }
        );

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
                collectManualArrayIdentifiers(identifierMap, keywordsArray, {
                    type: "keyword",
                    source: "manual:gml.js:KEYWORDS"
                });
            },
            { verbose }
        );

        timeSync(
            "Collecting literals",
            () => {
                collectManualArrayIdentifiers(identifierMap, literalsArray, {
                    type: "literal",
                    source: "manual:gml.js:LITERALS"
                });
            },
            { verbose }
        );

        timeSync(
            "Collecting symbols",
            () => {
                collectManualArrayIdentifiers(identifierMap, symbolsArray, {
                    type: "symbol",
                    source: "manual:gml.js:SYMBOLS"
                });
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
        logCompletion();
        return 0;
    } finally {
        disposeProgressBars();
    }
}
