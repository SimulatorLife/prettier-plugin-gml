import vm from "node:vm";

import { Command } from "commander";

import { CliUsageError } from "../core/errors.js";
import { assertSupportedNodeVersion } from "../shared/node-version.js";
import {
    getErrorMessage,
    normalizeIdentifierMetadataEntries,
    toNormalizedLowerCaseSet,
    toPosixPath
} from "../shared/dependencies.js";
import { writeManualJsonArtifact } from "../features/manual/file-helpers.js";
import {
    DEFAULT_MANUAL_REPO,
    buildManualRepositoryEndpoints
} from "../features/manual/utils.js";
import { timeSync, createVerboseDurationLogger } from "../shared/time-utils.js";
import {
    renderProgressBar,
    disposeProgressBars,
    withProgressBarCleanup
} from "../shared/progress-bar.js";
import {
    resolveVmEvalTimeout,
    getDefaultVmEvalTimeoutMs
} from "../shared/vm-eval-timeout.js";
import {
    applyManualEnvOptionOverrides,
    IDENTIFIER_VM_TIMEOUT_ENV_VAR
} from "../features/manual/env.js";
import { applyStandardCommandOptions } from "../core/command-standard-options.js";
import {
    applySharedManualCommandOptions,
    resolveManualCommandOptions
} from "../features/manual/command-options.js";
import { wrapInvalidArgumentResolver } from "../core/command-parsing.js";
import { createManualManualAccessContext } from "../features/manual/command-context.js";
import {
    decodeManualKeywordsPayload,
    decodeManualTagsPayload
} from "../features/manual/payload-validation.js";

const {
    environment: {
        repoRoot: REPO_ROOT,
        defaultCacheRoot: DEFAULT_CACHE_ROOT,
        defaultOutputPath: OUTPUT_DEFAULT
    },
    files: { fetchManualFile },
    refs: { resolveManualRef }
} = createManualManualAccessContext({
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
    ).option("-r, --ref <git-ref>", "Manual git ref (tag, branch, or commit).");

    const defaultVmTimeout = getDefaultVmEvalTimeoutMs();

    applySharedManualCommandOptions(command, {
        outputPath: { defaultValue: OUTPUT_DEFAULT },
        cacheRoot: { defaultValue: DEFAULT_CACHE_ROOT },
        manualRepo: { defaultValue: DEFAULT_MANUAL_REPO },
        quietDescription: "Suppress progress logging (useful in CI).",
        optionOrder: [
            "outputPath",
            "forceRefresh",
            "quiet",
            "vmEvalTimeout",
            "progressBarWidth",
            "manualRepo",
            "cacheRoot"
        ],
        customOptions: {
            vmEvalTimeout(cmd) {
                cmd.option(
                    "--vm-eval-timeout-ms <ms>",
                    `Maximum time in milliseconds to evaluate manual identifier arrays (default: ${defaultVmTimeout}). Set to 0 to disable the timeout.`,
                    wrapInvalidArgumentResolver(resolveVmEvalTimeout),
                    defaultVmTimeout
                );
            }
        }
    });

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
        const message =
            getErrorMessage(error, { fallback: "" }) || "Unknown error";
        throw new Error(
            `Failed to evaluate array literal for ${identifier}: ${message}`,
            { cause: error }
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

function normalizeIdentifier(name) {
    return name.trim();
}

function collectManualArrayIdentifiers(
    identifierMap,
    values,
    { type, source }
) {
    const entry = { type, sources: [source] };

    for (const value of values) {
        const identifier = normalizeIdentifier(value);
        mergeEntry(identifierMap, identifier, entry);
    }
}

const MANUAL_KEYWORD_SOURCE = "manual:ZeusDocs_keywords.json";
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_$.]+$/;

function shouldIncludeManualReference(normalizedPath) {
    return (
        normalizedPath.startsWith("3_Scripting") &&
        normalizedPath.includes("4_GML_Reference")
    );
}

function findManualTagEntry(manualTags, normalizedPath) {
    const tagKeyCandidates = [
        `${normalizedPath}.html`,
        `${normalizedPath}/index.html`
    ];

    for (const key of tagKeyCandidates) {
        if (manualTags[key]) {
            return manualTags[key];
        }
    }

    return null;
}

function resolveManualTagsForPath(manualTags, normalizedPath) {
    const entry = findManualTagEntry(manualTags, normalizedPath);
    if (!entry) {
        return [];
    }

    return entry
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
}

function isManualEntryDeprecated(normalizedPath, tags) {
    const lowercasePath = normalizedPath.toLowerCase();
    return (
        tags.some((tag) => tag.toLowerCase().includes("deprecated")) ||
        lowercasePath.includes("deprecated")
    );
}

function classifyManualIdentifiers(identifierMap, manualKeywords, manualTags) {
    for (const [rawIdentifier, manualPath] of Object.entries(manualKeywords)) {
        const identifier = normalizeIdentifier(rawIdentifier);
        if (!IDENTIFIER_PATTERN.test(identifier)) {
            continue;
        }

        if (typeof manualPath !== "string" || manualPath.length === 0) {
            continue;
        }

        const normalizedPath = toPosixPath(manualPath);
        if (!shouldIncludeManualReference(normalizedPath)) {
            continue;
        }

        const tags = resolveManualTagsForPath(manualTags, normalizedPath);
        const type = classifyFromPath(normalizedPath, tags);
        const deprecated = isManualEntryDeprecated(normalizedPath, tags);

        mergeEntry(identifierMap, identifier, {
            type,
            sources: [MANUAL_KEYWORD_SOURCE],
            manualPath: normalizedPath,
            tags,
            deprecated
        });
    }
}

function sortIdentifierEntries(identifierMap) {
    return [...identifierMap.entries()]
        .map(([identifier, data]) => [
            identifier,
            {
                type: data.type,
                sources: data.sources ? [...data.sources].sort() : [],
                manualPath: data.manualPath,
                tags: data.tags ? [...data.tags].sort() : [],
                deprecated: data.deprecated
            }
        ])
        .sort(([a], [b]) => a.localeCompare(b));
}

const DOWNLOAD_PROGRESS_LABEL = "Downloading manual assets";

/**
 * Render download progress updates using the configured verbosity options.
 * The helper centralizes console/progress-bar branching so callers can simply
 * forward status snapshots.
 */
function reportManualAssetFetchProgress({
    asset,
    fetchedCount,
    totalAssets,
    verbose,
    progressBarWidth
}) {
    if (!verbose.downloads) {
        return;
    }

    if (verbose.progressBar) {
        renderProgressBar(
            DOWNLOAD_PROGRESS_LABEL,
            fetchedCount,
            totalAssets,
            progressBarWidth
        );
        return;
    }

    console.log(`✓ ${asset.path}`);
}

/**
 * Download each manual asset and return a map of payloads keyed by the asset
 * descriptor's {@link key}. Progress callbacks receive the raw asset metadata
 * along with the running totals so orchestrators can surface meaningful status
 * updates without duplicating counter bookkeeping.
 */
async function downloadManualAssetPayloads({
    manualRefSha,
    manualAssets,
    requestOptions,
    onProgress
}) {
    const payloads = {};
    let fetchedCount = 0;
    const totalAssets = manualAssets.length;

    for (const asset of manualAssets) {
        payloads[asset.key] = await fetchManualFile(
            manualRefSha,
            asset.path,
            requestOptions
        );

        fetchedCount += 1;
        onProgress?.({ asset, fetchedCount, totalAssets });
    }

    return payloads;
}

async function fetchManualAssets(
    manualRefSha,
    manualAssets,
    { forceRefresh, verbose, cacheRoot, rawRoot, progressBarWidth }
) {
    return withProgressBarCleanup(async () => {
        return downloadManualAssetPayloads({
            manualRefSha,
            manualAssets,
            requestOptions: {
                forceRefresh,
                verbose,
                cacheRoot,
                rawRoot
            },
            onProgress: ({ asset, fetchedCount, totalAssets }) =>
                reportManualAssetFetchProgress({
                    asset,
                    fetchedCount,
                    totalAssets,
                    verbose,
                    progressBarWidth
                })
        });
    });
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
            () =>
                decodeManualKeywordsPayload(keywordsJson, {
                    source: "ZeusDocs_keywords.json"
                }),
            { verbose }
        );
        const manualTags = timeSync(
            "Decoding ZeusDocs tags",
            () =>
                decodeManualTagsPayload(tagsJsonText, {
                    source: "ZeusDocs_tags.json"
                }),
            { verbose }
        );

        timeSync(
            "Classifying manual identifiers",
            () =>
                classifyManualIdentifiers(
                    identifierMap,
                    manualKeywords,
                    manualTags
                ),
            { verbose }
        );

        const sortedIdentifiers = timeSync(
            "Sorting identifiers",
            () => sortIdentifierEntries(identifierMap),
            { verbose }
        );

        const identifiersObject = Object.fromEntries(sortedIdentifiers);
        const normalizedEntries = normalizeIdentifierMetadataEntries({
            identifiers: identifiersObject
        });

        if (normalizedEntries.length !== sortedIdentifiers.length) {
            throw new Error(
                "Generated manual identifier metadata contained invalid entries."
            );
        }

        const normalizedIdentifiers = Object.fromEntries(
            normalizedEntries.map(({ name, descriptor }) => [name, descriptor])
        );

        const payload = {
            meta: {
                manualRef: manualRef.ref,
                commitSha: manualRef.sha,
                generatedAt: new Date().toISOString(),
                source: manualRepo
            },
            identifiers: normalizedIdentifiers
        };

        await writeManualJsonArtifact({
            outputPath,
            payload,
            onAfterWrite: () => {
                console.log(
                    `Wrote ${normalizedEntries.length} identifiers to ${outputPath}`
                );
            }
        });
        logCompletion();
        return 0;
    } finally {
        disposeProgressBars();
    }
}

export const __test__ = Object.freeze({
    parseArrayLiteral
});
