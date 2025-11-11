import vm from "node:vm";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Command, Option } from "commander";

import { assertSupportedNodeVersion } from "../shared/node-version.js";
import {
    createVerboseDurationLogger,
    describeValueWithArticle,
    getErrorMessageOrFallback,
    normalizeIdentifierMetadataEntries,
    timeSync,
    toMutableArray,
    toNormalizedLowerCaseSet,
    toPosixPath,
    compactArray
} from "../shared/dependencies.js";
import { writeManualJsonArtifact } from "../modules/manual/file-helpers.js";
import {
    resolveVmEvalTimeout,
    getDefaultVmEvalTimeoutMs
} from "../runtime-options/vm-eval-timeout.js";
import { applyStandardCommandOptions } from "../core/command-standard-options.js";
import { createCliCommandManager } from "../core/command-manager.js";
import { handleCliError } from "../core/errors.js";
import { wrapInvalidArgumentResolver } from "../core/command-parsing.js";
import {
    decodeManualKeywordsPayload,
    decodeManualTagsPayload
} from "../modules/manual/payload-validation.js";
import {
    describeManualSource,
    readManualText,
    resolveManualSource
} from "../modules/manual/source.js";
import {
    createWorkflowPathFilter,
    ensureManualWorkflowArtifactsAllowed
} from "../workflow/path-filter.js";
import { resolveFromRepoRoot } from "../shared/workspace-paths.js";

const DEFAULT_OUTPUT_PATH = resolveFromRepoRoot(
    "resources",
    "gml-identifiers.json"
);

const DEFAULT_GML_SOURCE_PATH = "Manual/contents/assets/scripts/gml.js";
const DEFAULT_KEYWORDS_PATH = "ZeusDocs_keywords.json";
const DEFAULT_TAGS_PATH = "ZeusDocs_tags.json";

const IDENTIFIER_VM_TIMEOUT_ENV_VAR = "GML_IDENTIFIER_VM_TIMEOUT_MS";

export function createGenerateIdentifiersCommand({ env = process.env } = {}) {
    const command = applyStandardCommandOptions(
        new Command()
            .name("generate-gml-identifiers")
            .usage("[options]")
            .description(
                "Generate the gml-identifiers.json artefact from the GameMaker manual."
            )
    );

    const defaultVmTimeout = getDefaultVmEvalTimeoutMs();
    const envVmTimeout = env?.[IDENTIFIER_VM_TIMEOUT_ENV_VAR];
    const resolvedVmTimeout =
        envVmTimeout === undefined
            ? defaultVmTimeout
            : resolveVmEvalTimeout(envVmTimeout);

    command
        .option(
            "--output <path>",
            "Path to write gml-identifiers.json.",
            DEFAULT_OUTPUT_PATH
        )
        .option(
            "--manual-root <path>",
            "Override the manual asset root (defaults to vendor/GameMaker-Manual)."
        )
        .option(
            "--manual-package <name>",
            "Manual npm package name used when neither --manual-root nor the vendor submodule is available."
        )
        .addOption(
            new Option(
                "--vm-eval-timeout-ms <ms>",
                "Maximum time in milliseconds to evaluate manual identifier arrays. Provide 0 to disable the timeout."
            )
                .argParser(wrapInvalidArgumentResolver(resolveVmEvalTimeout))
                .default(resolvedVmTimeout, String(resolvedVmTimeout))
        )
        .option("--quiet", "Suppress progress logging (useful in CI).")
        .option(
            "--manual-gml-path <path>",
            "Relative path to the manual gml.js source file.",
            DEFAULT_GML_SOURCE_PATH
        )
        .option(
            "--manual-keywords-path <path>",
            "Relative path to the manual keywords JSON file.",
            DEFAULT_KEYWORDS_PATH
        )
        .option(
            "--manual-tags-path <path>",
            "Relative path to the manual tags JSON file.",
            DEFAULT_TAGS_PATH
        );

    return command;
}

function resolveGenerateIdentifierOptions(command) {
    const options = command?.opts?.() ?? {};

    return {
        outputPath: options.output ?? DEFAULT_OUTPUT_PATH,
        manualRoot: options.manualRoot ?? null,
        manualPackage: options.manualPackage ?? null,
        manualGmlPath: options.manualGmlPath ?? DEFAULT_GML_SOURCE_PATH,
        manualKeywordsPath: options.manualKeywordsPath ?? DEFAULT_KEYWORDS_PATH,
        manualTagsPath: options.manualTagsPath ?? DEFAULT_TAGS_PATH,
        vmEvalTimeoutMs:
            options.vmEvalTimeoutMs === undefined
                ? getDefaultVmEvalTimeoutMs()
                : options.vmEvalTimeoutMs,
        quiet: Boolean(options.quiet)
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
        const message = getErrorMessageOrFallback(error);
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

    const matchesAny = (needles, matcher = () => false) =>
        (needles ?? []).some(matcher);
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
    const sourceList = data.sources ?? [];
    const tagList = data.tags ?? [];

    if (!current) {
        const sources = toMutableArray(sourceList);
        const tags = toMutableArray(tagList);

        map.set(identifier, {
            type: data.type ?? "unknown",
            sources: sources.length === 0 ? new Set() : new Set(sources),
            manualPath: data.manualPath,
            tags: tags.length === 0 ? new Set() : new Set(tags),
            deprecated: Boolean(data.deprecated)
        });
        return;
    }

    for (const source of sourceList) {
        current.sources.add(source);
    }
    for (const tag of tagList) {
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

function describeManualIdentifierArrayValue(value) {
    return describeValueWithArticle(value, {
        emptyStringLabel: "an empty string"
    });
}

function formatManualIdentifierArrayLabel({ identifier, source }) {
    const label = source || identifier;
    return label ? `'${label}'` : "manual identifier array";
}

function assertManualIdentifierArray(values, { identifier, source }) {
    const label = formatManualIdentifierArrayLabel({ identifier, source });

    if (!Array.isArray(values)) {
        const description = describeManualIdentifierArrayValue(values);
        throw new TypeError(
            `Manual identifier array ${label} must evaluate to an array of strings. Received ${description}.`
        );
    }

    values.forEach((value, index) => {
        if (typeof value !== "string") {
            const description = describeManualIdentifierArrayValue(value);
            throw new TypeError(
                `Manual identifier array ${label} must contain only strings. Entry at index ${index} was ${description}.`
            );
        }
    });

    return values;
}

function collectManualArrayIdentifiers(
    identifierMap,
    values,
    { type, source },
    { identifier } = {}
) {
    const normalizedValues = assertManualIdentifierArray(values, {
        identifier,
        source
    });

    const entry = { type, sources: [source] };

    for (const value of normalizedValues) {
        const identifierText = normalizeIdentifier(value);
        mergeEntry(identifierMap, identifierText, entry);
    }
}

const MANUAL_IDENTIFIER_ARRAYS = Object.freeze([
    {
        identifier: "KEYWORDS",
        parseLabel: "Parsing keyword array",
        collectLabel: "Collecting keywords",
        collectOptions: {
            type: "keyword",
            source: "manual:gml.js:KEYWORDS"
        }
    },
    {
        identifier: "LITERALS",
        parseLabel: "Parsing literal array",
        collectLabel: "Collecting literals",
        collectOptions: {
            type: "literal",
            source: "manual:gml.js:LITERALS"
        }
    },
    {
        identifier: "SYMBOLS",
        parseLabel: "Parsing symbol array",
        collectLabel: "Collecting symbols",
        collectOptions: {
            type: "symbol",
            source: "manual:gml.js:SYMBOLS"
        }
    }
]);

const MANUAL_KEYWORD_SOURCE = "manual:ZeusDocs_keywords.json";
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_$.]+$/;

function parseManualIdentifierArrays({ gmlSource, vmEvalTimeoutMs, verbose }) {
    return MANUAL_IDENTIFIER_ARRAYS.map((descriptor) => ({
        descriptor,
        values: timeSync(
            descriptor.parseLabel,
            () =>
                parseArrayLiteral(gmlSource, descriptor.identifier, {
                    timeoutMs: vmEvalTimeoutMs
                }),
            { verbose }
        )
    }));
}

/**
 * Merge parsed manual identifier arrays into the aggregate metadata map.
 *
 * Keeping the collection logic isolated ensures the orchestrator only sequences
 * high-level steps instead of performing Set/Map bookkeeping inline.
 */
function collectParsedManualIdentifierArrays({
    identifierMap,
    parsedArrays,
    verbose
}) {
    for (const { descriptor, values } of parsedArrays) {
        timeSync(
            descriptor.collectLabel,
            () =>
                collectManualArrayIdentifiers(
                    identifierMap,
                    values,
                    descriptor.collectOptions,
                    descriptor
                ),
            { verbose }
        );
    }
}

/**
 * Parse the manual identifier arrays embedded in gml.js and merge their
 * contents into a single identifier metadata map.
 *
 * Centralizing the parsing and collection steps keeps the main command flow
 * focused on orchestration while preserving the original timeSync reporting.
 */
function buildManualIdentifierMap({ gmlSource, vmEvalTimeoutMs, verbose }) {
    const identifierMap = new Map();
    const parsedArrays = parseManualIdentifierArrays({
        gmlSource,
        vmEvalTimeoutMs,
        verbose
    });

    collectParsedManualIdentifierArrays({
        identifierMap,
        parsedArrays,
        verbose
    });

    return identifierMap;
}

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

    return compactArray(entry.split(",").map((tag) => tag.trim()));
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

function buildIdentifierMapFromManualPayloads({
    payloads,
    vmEvalTimeoutMs,
    verbose
}) {
    return buildManualIdentifierMap({
        gmlSource: payloads?.gmlSource,
        vmEvalTimeoutMs,
        verbose
    });
}

function decodeManualKeywordAndTagPayloads({ payloads, verbose }) {
    if (verbose.parsing) {
        console.log("Merging manual keyword metadata…");
    }

    const manualKeywords = timeSync(
        "Decoding ZeusDocs keywords",
        () =>
            decodeManualKeywordsPayload(payloads?.keywords, {
                source: "ZeusDocs_keywords.json"
            }),
        { verbose }
    );
    const manualTags = timeSync(
        "Decoding ZeusDocs tags",
        () =>
            decodeManualTagsPayload(payloads?.tags, {
                source: "ZeusDocs_tags.json"
            }),
        { verbose }
    );

    return { manualKeywords, manualTags };
}

function classifyManualIdentifierMetadata({
    identifierMap,
    manualKeywords,
    manualTags,
    verbose
}) {
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
}

function createIdentifierArtifactPayload({
    identifierMap,
    manualSource,
    verbose
}) {
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

    const identifiers = Object.fromEntries(
        normalizedEntries.map(({ name, descriptor }) => [name, descriptor])
    );

    return {
        payload: {
            meta: {
                manualRoot: manualSource.root,
                packageName: manualSource.packageName,
                packageVersion: manualSource.packageJson?.version ?? null,
                generatedAt: new Date().toISOString(),
                source: describeManualSource(manualSource)
            },
            identifiers
        },
        entryCount: normalizedEntries.length
    };
}

/**
 * Transform the raw manual payloads into the final identifier artefact payload
 * while keeping {@link runGenerateGmlIdentifiers} free from map mutations and
 * tag bookkeeping.
 */
function buildIdentifierArtifact({
    payloads,
    manualSource,
    vmEvalTimeoutMs,
    verbose
}) {
    const identifierMap = buildIdentifierMapFromManualPayloads({
        payloads,
        vmEvalTimeoutMs,
        verbose
    });

    const { manualKeywords, manualTags } = decodeManualKeywordAndTagPayloads({
        payloads,
        verbose
    });

    classifyManualIdentifierMetadata({
        identifierMap,
        manualKeywords,
        manualTags,
        verbose
    });

    return createIdentifierArtifactPayload({
        identifierMap,
        manualSource,
        verbose
    });
}

async function writeIdentifierArtifact({
    outputPath,
    payload,
    entryCount,
    pathFilter
}) {
    await writeManualJsonArtifact({
        outputPath,
        payload,
        pathFilter,
        onAfterWrite: () => {
            console.log(`Wrote ${entryCount} identifiers to ${outputPath}`);
        }
    });
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

async function loadManualPayloads({
    manualSource,
    manualGmlPath,
    manualKeywordsPath,
    manualTagsPath
}) {
    const [gmlSource, keywords, tags] = await Promise.all([
        readManualText(manualSource.root, manualGmlPath),
        readManualText(manualSource.root, manualKeywordsPath),
        readManualText(manualSource.root, manualTagsPath)
    ]);

    return { gmlSource, keywords, tags };
}

/**
 * Execute the manual identifier generation workflow.
 *
 * @param {{
 *   command?: import("commander").Command,
 *   workflow?: {
 *       allowPaths?: Iterable<unknown>,
 *       denyPaths?: Iterable<unknown>,
 *       allowsPath?: (candidate: string) => boolean,
 *       allowsDirectory?: (candidate: string) => boolean
 *   }
 * }} [context]
 * @returns {Promise<number>}
 */
export async function runGenerateGmlIdentifiers({ command, workflow } = {}) {
    assertSupportedNodeVersion();

    const {
        outputPath,
        manualRoot,
        manualPackage,
        manualGmlPath,
        manualKeywordsPath,
        manualTagsPath,
        vmEvalTimeoutMs,
        quiet
    } = resolveGenerateIdentifierOptions(command);

    const verboseState = quiet ? {} : { parsing: true };
    const workflowPathFilter = createWorkflowPathFilter(workflow);

    ensureManualWorkflowArtifactsAllowed(workflowPathFilter, {
        outputPath
    });

    const manualSource = await resolveManualSource({
        manualRoot,
        manualPackage
    });

    if (!quiet) {
        console.log(
            `Using manual assets from ${describeManualSource(manualSource)}`
        );
    }

    const payloads = await loadManualPayloads({
        manualSource,
        manualGmlPath,
        manualKeywordsPath,
        manualTagsPath
    });

    const logCompletion = createVerboseDurationLogger({
        verbose: verboseState
    });

    const { payload, entryCount } = buildIdentifierArtifact({
        payloads,
        manualSource,
        vmEvalTimeoutMs,
        verbose: verboseState
    });

    await writeIdentifierArtifact({
        outputPath,
        payload,
        entryCount,
        pathFilter: workflowPathFilter
    });
    logCompletion();
    return 0;
}

export const __test__ = Object.freeze({
    parseArrayLiteral,
    collectManualArrayIdentifiers,
    assertManualIdentifierArray
});

const isMainModule = process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;

if (isMainModule) {
    const program = new Command().name("generate-gml-identifiers");
    const { registry, runner } = createCliCommandManager({ program });
    const handleError = (error) =>
        handleCliError(error, {
            prefix: "Failed to generate GML identifiers.",
            exitCode: typeof error?.exitCode === "number" ? error.exitCode : 1
        });

    registry.registerDefaultCommand({
        command: createGenerateIdentifiersCommand({ env: process.env }),
        run: ({ command }) => runGenerateGmlIdentifiers({ command }),
        onError: handleError
    });

    runner.run(process.argv.slice(2)).catch(handleError);
}
