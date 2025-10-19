import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloneLocation } from "../../../shared/ast-locations.js";
import { getCallExpressionIdentifier } from "../../../shared/ast-node-helpers.js";
import {
    toPosixPath,
    walkAncestorDirectories
} from "../../../shared/path-utils.js";
import {
    asArray,
    cloneObjectEntries,
    isNonEmptyArray
} from "../../../shared/array-utils.js";
import {
    assertFunction,
    getOrCreateMapEntry,
    hasOwn
} from "../../../shared/object-utils.js";
import {
    buildLocationKey,
    buildFileLocationKey
} from "../../../shared/location-keys.js";
import { getDefaultProjectIndexParser } from "./gml-parser-facade.js";
import { clampConcurrency } from "./concurrency.js";
import {
    PROJECT_MANIFEST_EXTENSION,
    isProjectManifestPath
} from "./constants.js";
import { defaultFsFacade } from "./fs-facade.js";
import { isFsErrorCode, listDirectory, getFileMtime } from "./fs-utils.js";
import {
    getDefaultProjectIndexCacheMaxSize,
    loadProjectIndexCache,
    saveProjectIndexCache
} from "./cache.js";
import {
    createProjectIndexMetrics,
    finalizeProjectIndexMetrics
} from "./metrics.js";
import {
    resolveAbortSignalFromOptions,
    throwIfAborted
} from "../../../shared/abort-utils.js";
import {
    analyseResourceFiles,
    createFileScopeDescriptor
} from "./resource-analysis.js";

const defaultProjectIndexParser = getDefaultProjectIndexParser();

const PARSER_FACADE_OPTION_KEYS = [
    "identifierCaseProjectIndexParserFacade",
    "gmlParserFacade",
    "parserFacade"
];

const PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE =
    "Project root discovery was aborted.";
const PROJECT_INDEX_BUILD_ABORT_MESSAGE =
    "Project index build was aborted.";

/**
 * Create shallow clones of common entry collections stored on project index
 * records (for example declaration/reference lists). Guarding against
 * non-object input keeps the helper resilient when callers forward values
 * sourced from partially populated caches.
 */
function cloneEntryCollections(entry, ...keys) {
    const source = entry && typeof entry === "object" ? entry : {};
    const clones = {};

    for (const key of keys) {
        clones[key] = cloneObjectEntries(source[key]);
    }

    return clones;
}

function getProjectIndexParserOverride(options) {
    if (!options || typeof options !== "object") {
        return null;
    }

    for (const key of PARSER_FACADE_OPTION_KEYS) {
        const facade = options[key];
        if (typeof facade?.parse === "function") {
            return {
                facade,
                parse: facade.parse.bind(facade)
            };
        }
    }

    const parse = options.parseGml;
    return typeof parse === "function" ? { facade: null, parse } : null;
}

function resolveProjectIndexParser(options) {
    return (
        getProjectIndexParserOverride(options)?.parse ??
        defaultProjectIndexParser
    );
}

export async function findProjectRoot(options, fsFacade = defaultFsFacade) {
    const filepath = options?.filepath;
    const signal = resolveAbortSignalFromOptions(options, {
        fallbackMessage: PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE
    });

    if (!filepath) {
        return null;
    }

    const startDirectory = path.dirname(path.resolve(filepath));

    for (const directory of walkAncestorDirectories(startDirectory)) {
        throwIfAborted(signal, PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE);

        const entries = await listDirectory(fsFacade, directory, { signal });
        throwIfAborted(signal, PROJECT_ROOT_DISCOVERY_ABORT_MESSAGE);

        if (entries.some(isProjectManifestPath)) {
            return directory;
        }
    }

    return null;
}

export function createProjectIndexCoordinator(options = {}) {
    const {
        fsFacade = defaultFsFacade,
        loadCache = loadProjectIndexCache,
        saveCache = saveProjectIndexCache,
        buildIndex = buildProjectIndex,
        cacheMaxSizeBytes: rawCacheMaxSizeBytes
    } = options;

    const cacheMaxSizeBytes =
        rawCacheMaxSizeBytes === undefined
            ? getDefaultProjectIndexCacheMaxSize()
            : rawCacheMaxSizeBytes;

    const inFlight = new Map();
    let disposed = false;
    const abortController = new AbortController();
    const DISPOSED_MESSAGE = "ProjectIndexCoordinator has been disposed";

    function createDisposedError() {
        return new Error(DISPOSED_MESSAGE);
    }

    function ensureNotDisposed() {
        if (disposed) {
            throw createDisposedError();
        }
        throwIfAborted(abortController.signal, DISPOSED_MESSAGE);
    }

    async function ensureReady(descriptor) {
        ensureNotDisposed();
        const { projectRoot } = descriptor ?? {};
        if (!projectRoot) {
            throw new Error("projectRoot must be provided to ensureReady");
        }
        const resolvedRoot = path.resolve(projectRoot);
        const key = resolvedRoot;
        const signal = abortController.signal;
        throwIfAborted(signal, DISPOSED_MESSAGE);

        if (inFlight.has(key)) {
            return inFlight.get(key);
        }

        const operation = (async () => {
            const loadResult = await loadCache(
                { ...descriptor, projectRoot: resolvedRoot },
                fsFacade,
                { signal }
            );
            throwIfAborted(signal, DISPOSED_MESSAGE);

            if (loadResult.status === "hit") {
                throwIfAborted(signal, DISPOSED_MESSAGE);
                return {
                    source: "cache",
                    projectIndex: loadResult.projectIndex,
                    cache: loadResult
                };
            }

            const projectIndex = await buildIndex(resolvedRoot, fsFacade, {
                ...descriptor?.buildOptions,
                signal
            });
            throwIfAborted(signal, DISPOSED_MESSAGE);

            const descriptorMaxSizeBytes =
                descriptor?.maxSizeBytes === undefined
                    ? cacheMaxSizeBytes
                    : descriptor.maxSizeBytes;

            const saveResult = await saveCache(
                {
                    ...descriptor,
                    projectRoot: resolvedRoot,
                    projectIndex,
                    metricsSummary: projectIndex.metrics,
                    maxSizeBytes: descriptorMaxSizeBytes
                },
                fsFacade,
                { signal }
            ).catch((error) => {
                return {
                    status: "failed",
                    error,
                    cacheFilePath: loadResult.cacheFilePath
                };
            });
            throwIfAborted(signal, DISPOSED_MESSAGE);

            return {
                source: "build",
                projectIndex,
                cache: {
                    ...loadResult,
                    saveResult
                }
            };
        })().finally(() => {
            inFlight.delete(key);
        });

        inFlight.set(key, operation);
        return operation;
    }

    function dispose() {
        if (disposed) {
            return;
        }

        disposed = true;
        if (!abortController.signal.aborted) {
            abortController.abort(createDisposedError());
        }
        inFlight.clear();
    }

    return {
        ensureReady,
        dispose
    };
}

export {
    PROJECT_MANIFEST_EXTENSION,
    isProjectManifestPath
} from "./constants.js";
export {
    PROJECT_INDEX_CACHE_SCHEMA_VERSION,
    PROJECT_INDEX_CACHE_DIRECTORY,
    PROJECT_INDEX_CACHE_FILENAME,
    DEFAULT_MAX_PROJECT_INDEX_CACHE_SIZE,
    PROJECT_INDEX_CACHE_MAX_SIZE_BASELINE,
    PROJECT_INDEX_CACHE_MAX_SIZE_ENV_VAR,
    getDefaultProjectIndexCacheMaxSize,
    setDefaultProjectIndexCacheMaxSize,
    applyProjectIndexCacheEnvOverride,
    ProjectIndexCacheMissReason,
    loadProjectIndexCache,
    saveProjectIndexCache,
    deriveCacheKey
} from "./cache.js";

export {
    DEFAULT_PROJECT_INDEX_GML_CONCURRENCY,
    getDefaultProjectIndexGmlConcurrency,
    setDefaultProjectIndexGmlConcurrency,
    PROJECT_INDEX_GML_CONCURRENCY_ENV_VAR,
    PROJECT_INDEX_GML_CONCURRENCY_BASELINE
} from "./concurrency.js";

const GML_IDENTIFIER_FILE_PATH = fileURLToPath(
    new URL("../../../../resources/gml-identifiers.json", import.meta.url)
);

let cachedBuiltInIdentifiers = null;

async function loadBuiltInIdentifiers(
    fsFacade = defaultFsFacade,
    metrics = null,
    options = {}
) {
    const signal = resolveAbortSignalFromOptions(options, {
        fallbackMessage: PROJECT_INDEX_BUILD_ABORT_MESSAGE
    });
    throwIfAborted(signal, PROJECT_INDEX_BUILD_ABORT_MESSAGE);

    const currentMtime = await getFileMtime(
        fsFacade,
        GML_IDENTIFIER_FILE_PATH,
        { signal }
    );
    throwIfAborted(signal, PROJECT_INDEX_BUILD_ABORT_MESSAGE);
    const cached = cachedBuiltInIdentifiers;

    if (cached) {
        const cachedMtime = cached.metadata?.mtimeMs ?? null;
        if (cachedMtime === currentMtime) {
            metrics?.recordCacheHit("builtInIdentifiers");
            return cached;
        }

        metrics?.recordCacheStale("builtInIdentifiers");
    } else {
        metrics?.recordCacheMiss("builtInIdentifiers");
    }

    let names = new Set();

    try {
        const rawContents = await fsFacade.readFile(
            GML_IDENTIFIER_FILE_PATH,
            "utf8"
        );
        throwIfAborted(signal, PROJECT_INDEX_BUILD_ABORT_MESSAGE);
        const parsed = JSON.parse(rawContents);
        const identifiers = parsed?.identifiers ?? {};

        names = new Set(Object.keys(identifiers));
    } catch {
        // Built-in identifier metadata ships with the formatter bundle; if the
        // file is missing or unreadable we intentionally degrade to an empty
        // set rather than aborting project indexing. That keeps the CLI usable
        // when installations are partially upgraded or when read permissions
        // are restricted, and the metrics recorder above still notes the cache
        // miss for observability.
    }

    cachedBuiltInIdentifiers = {
        metadata: { mtimeMs: currentMtime },
        names
    };

    return cachedBuiltInIdentifiers;
}

async function scanProjectTree(
    projectRoot,
    fsFacade,
    metrics = null,
    options = {}
) {
    const signal = resolveAbortSignalFromOptions(options, {
        fallbackMessage: PROJECT_INDEX_BUILD_ABORT_MESSAGE
    });
    const yyFiles = [];
    const gmlFiles = [];
    const pending = ["."];

    while (pending.length > 0) {
        const relativeDir = pending.pop();
        const absoluteDir = path.join(projectRoot, relativeDir);
        throwIfAborted(signal, PROJECT_INDEX_BUILD_ABORT_MESSAGE);
        const entries = await listDirectory(fsFacade, absoluteDir, {
            signal
        });
        throwIfAborted(signal, PROJECT_INDEX_BUILD_ABORT_MESSAGE);
        metrics?.incrementCounter("io.directoriesScanned");

        for (const entry of entries) {
            const relativePath = path.join(relativeDir, entry);
            const absolutePath = path.join(projectRoot, relativePath);
            let stats;
            try {
                stats = await fsFacade.stat(absolutePath);
                throwIfAborted(signal, PROJECT_INDEX_BUILD_ABORT_MESSAGE);
            } catch (error) {
                if (isFsErrorCode(error, "ENOENT")) {
                    metrics?.incrementCounter("io.skippedMissingEntries");
                    continue;
                }
                throw error;
            }

            if (
                typeof stats?.isDirectory === "function" &&
                stats.isDirectory()
            ) {
                pending.push(relativePath);
                continue;
            }

            const relativePosix = toPosixPath(relativePath);
            const lowerPath = relativePosix.toLowerCase();
            if (
                lowerPath.endsWith(".yy") ||
                isProjectManifestPath(relativePosix)
            ) {
                yyFiles.push({
                    absolutePath,
                    relativePath: relativePosix
                });
                metrics?.incrementCounter("files.yyDiscovered");
            } else if (lowerPath.endsWith(".gml")) {
                gmlFiles.push({
                    absolutePath,
                    relativePath: relativePosix
                });
                metrics?.incrementCounter("files.gmlDiscovered");
            }
        }
    }

    yyFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    gmlFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    return { yyFiles, gmlFiles };
}







function cloneIdentifierDeclaration(declaration) {
    if (!declaration || typeof declaration !== "object") {
        return null;
    }

    return {
        start: cloneLocation(declaration.start),
        end: cloneLocation(declaration.end),
        scopeId: declaration.scopeId ?? null
    };
}

function createIdentifierRecord(node) {
    return {
        name: node?.name ?? null,
        start: cloneLocation(node?.start),
        end: cloneLocation(node?.end),
        scopeId: node?.scopeId ?? null,
        classifications: [...asArray(node?.classifications)],
        declaration: cloneIdentifierDeclaration(node?.declaration),
        isGlobalIdentifier: node?.isGlobalIdentifier === true
    };
}

function cloneIdentifierForCollections(record, filePath) {
    return {
        name: record?.name ?? null,
        filePath: filePath ?? null,
        scopeId: record?.scopeId ?? null,
        start: cloneLocation(record?.start),
        end: cloneLocation(record?.end),
        classifications: [...asArray(record?.classifications)],
        declaration: record?.declaration ? { ...record.declaration } : null,
        isBuiltIn: record?.isBuiltIn ?? false,
        reason: record?.reason ?? null,
        isSynthetic: record?.isSynthetic ?? false,
        isGlobalIdentifier: record?.isGlobalIdentifier ?? false
    };
}

function ensureCollectionEntry(map, key, initializer) {
    return getOrCreateMapEntry(map, key, initializer);
}

function createIdentifierCollections() {
    return {
        scripts: new Map(),
        macros: new Map(),
        enums: new Map(),
        enumMembers: new Map(),
        globalVariables: new Map(),
        instanceVariables: new Map()
    };
}

function buildIdentifierId(scope, value) {
    if (!scope || typeof scope !== "string") {
        return null;
    }

    if (typeof value !== "string" || value.length === 0) {
        return null;
    }

    return `${scope}:${value}`;
}

const LINE_BREAK_PATTERN = /\r\n?|\n|\u2028|\u2029/g;

function computeLineOffsets(source) {
    const offsets = [0];

    if (typeof source !== "string" || source.length === 0) {
        return offsets;
    }

    for (const match of source.matchAll(LINE_BREAK_PATTERN)) {
        const startIndex = match.index ?? 0;
        offsets.push(startIndex + match[0].length);
    }

    return offsets;
}

function buildLocationFromIndex(index, lineOffsets) {
    if (typeof index !== "number" || index < 0) {
        return null;
    }

    const offsets = Array.isArray(lineOffsets) ? lineOffsets : [0];

    let low = 0;
    let high = offsets.length - 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const value = offsets[mid];
        if (value <= index) {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    const resolvedLineIndex = Math.max(0, Math.min(offsets.length - 1, high));
    const lineStart = offsets[resolvedLineIndex] ?? 0;
    const lineNumber = resolvedLineIndex + 1;
    const column = index - lineStart;

    return {
        line: lineNumber,
        column,
        index
    };
}

function isIdentifierBoundary(character) {
    if (!character) {
        return true;
    }

    return !/[0-9A-Za-z_]/.test(character);
}

function findIdentifierLocation({
    source,
    name,
    searchStart,
    searchEnd,
    lineOffsets
}) {
    if (typeof source !== "string" || typeof name !== "string") {
        return null;
    }

    const effectiveStart = Math.max(0, searchStart ?? 0);
    const effectiveEnd = Math.min(
        source.length,
        searchEnd == undefined ? source.length : searchEnd
    );

    let index = source.indexOf(name, effectiveStart);
    while (index !== -1 && index < effectiveEnd) {
        const before = index > 0 ? source[index - 1] : "";
        const after =
            index + name.length < source.length
                ? source[index + name.length]
                : "";

        if (isIdentifierBoundary(before) && isIdentifierBoundary(after)) {
            const start = buildLocationFromIndex(index, lineOffsets);
            const end = buildLocationFromIndex(
                index + Math.max(0, name.length - 1),
                lineOffsets
            );

            if (start && end) {
                return { start, end };
            }
        }

        index = source.indexOf(name, index + 1);
    }

    return null;
}

function removeSyntheticScriptDeclarations(collection, { name, scopeId }) {
    if (!Array.isArray(collection)) {
        return;
    }

    for (let index = collection.length - 1; index >= 0; index -= 1) {
        const entry = collection[index];
        if (!entry || !entry.isSynthetic) {
            continue;
        }
        if (name && entry.name && entry.name !== name) {
            continue;
        }
        if (scopeId && entry.scopeId && entry.scopeId !== scopeId) {
            continue;
        }
        collection.splice(index, 1);
    }
}

function createFunctionLikeIdentifierRecord({
    node,
    scopeRecord,
    fileRecord,
    classification,
    source,
    lineOffsets
}) {
    if (!node || !scopeRecord || !fileRecord) {
        return null;
    }

    const rawName =
        typeof node.id === "string"
            ? node.id
            : typeof node.id?.name === "string"
              ? node.id.name
              : null;

    if (!rawName) {
        return null;
    }

    const headerStart = node.start?.index ?? 0;
    const headerEnd =
        node.body?.start?.index ?? node.end?.index ?? source?.length ?? 0;

    const location = findIdentifierLocation({
        source,
        name: rawName,
        searchStart: headerStart,
        searchEnd: headerEnd,
        lineOffsets
    });

    if (!location) {
        return null;
    }

    const classificationArray = Array.isArray(classification)
        ? classification
        : [classification];
    const classificationTags = ["identifier", "declaration"];
    for (const tag of classificationArray) {
        if (tag && !classificationTags.includes(tag)) {
            classificationTags.push(tag);
        }
    }

    const start = cloneLocation(location.start);
    const end = cloneLocation(location.end);

    return {
        name: rawName,
        start,
        end,
        scopeId: scopeRecord.id,
        classifications: classificationTags,
        declaration: {
            start: cloneLocation(start),
            end: cloneLocation(end),
            scopeId: scopeRecord.id
        },
        isBuiltIn: false,
        isSynthetic: false,
        filePath: fileRecord.filePath
    };
}

function createEnumLookup(ast, filePath) {
    const enumDeclarations = new Map();
    const memberDeclarations = new Map();

    const visitStack = [ast];
    const seen = new Set();

    while (visitStack.length > 0) {
        const node = visitStack.pop();
        if (!node || typeof node !== "object") {
            continue;
        }

        if (seen.has(node)) {
            continue;
        }
        seen.add(node);

        if (node.type === "EnumDeclaration") {
            const enumIdentifier = node.name;
            const enumKey = buildFileLocationKey(
                filePath,
                enumIdentifier?.start
            );
            if (enumKey) {
                enumDeclarations.set(enumKey, {
                    key: enumKey,
                    name: enumIdentifier?.name ?? null,
                    filePath: filePath ?? null
                });

                for (const member of asArray(node.members)) {
                    const memberIdentifier = member?.name ?? null;
                    if (!memberIdentifier) {
                        continue;
                    }
                    const memberKey = buildFileLocationKey(
                        filePath,
                        memberIdentifier.start
                    );
                    if (!memberKey) {
                        continue;
                    }

                    memberDeclarations.set(memberKey, {
                        key: memberKey,
                        name: memberIdentifier.name ?? null,
                        enumKey,
                        filePath: filePath ?? null
                    });
                }
            }
        }

        const values = Object.values(node);
        for (const value of values) {
            if (Array.isArray(value)) {
                for (let index = value.length - 1; index >= 0; index -= 1) {
                    const child = value[index];
                    if (child && typeof child === "object") {
                        visitStack.push(child);
                    }
                }
            } else if (value && typeof value === "object") {
                visitStack.push(value);
            }
        }
    }

    return { enumDeclarations, memberDeclarations };
}

function ensureScriptEntry(identifierCollections, descriptor) {
    if (!descriptor || !descriptor.id || descriptor.kind !== "script") {
        return null;
    }

    const identifierId = buildIdentifierId("script", descriptor.id);

    return ensureCollectionEntry(
        identifierCollections.scripts,
        descriptor.id,
        () => ({
            identifierId,
            id: descriptor.id,
            name: descriptor.name ?? null,
            displayName:
                descriptor.displayName ?? descriptor.name ?? descriptor.id,
            resourcePath: descriptor.resourcePath ?? null,
            declarations: [],
            references: [],
            declarationKinds: []
        })
    );
}

function registerScriptDeclaration({
    identifierCollections,
    descriptor,
    declarationRecord,
    filePath
}) {
    const entry = ensureScriptEntry(identifierCollections, descriptor);
    if (!entry) {
        return;
    }

    if (!entry.identifierId) {
        entry.identifierId = buildIdentifierId("script", descriptor?.id ?? "");
    }

    if (descriptor.name && !entry.name) {
        entry.name = descriptor.name;
    }
    if (descriptor.displayName && !entry.displayName) {
        entry.displayName = descriptor.displayName;
    }
    if (descriptor.resourcePath && !entry.resourcePath) {
        entry.resourcePath = descriptor.resourcePath;
    }

    if (!declarationRecord) {
        return;
    }

    const clone = cloneIdentifierForCollections(declarationRecord, filePath);
    if (clone && clone.isSynthetic !== true) {
        entry.declarations = entry.declarations.filter(
            (existing) => existing && existing.isSynthetic !== true
        );
    }
    const locationKey = buildLocationKey(clone.start);
    const hasExisting = entry.declarations.some((existing) => {
        const existingKey = buildLocationKey(existing.start);
        return existingKey && locationKey && existingKey === locationKey;
    });

    if (!hasExisting) {
        entry.declarations.push(clone);
    }

    const declarationTags = asArray(clone?.classifications);
    for (const tag of declarationTags) {
        if (
            tag &&
            tag !== "identifier" &&
            tag !== "declaration" &&
            !entry.declarationKinds.includes(tag)
        ) {
            entry.declarationKinds.push(tag);
        }
    }
}

/**
 * Ensures script scopes have a declaration even when the backing GML file
 * omits an explicit declaration. Keeps the project index builder focused on
 * orchestration by handling the bookkeeping here.
 */
function ensureSyntheticScriptDeclaration({
    scopeDescriptor,
    scopeRecord,
    fileRecord,
    identifierCollections,
    filePath
}) {
    if (
        !scopeDescriptor ||
        scopeDescriptor.kind !== "script" ||
        !fileRecord ||
        fileRecord.hasSyntheticDeclaration
    ) {
        return;
    }

    const syntheticDeclaration = {
        name: scopeDescriptor.name,
        start: null,
        end: null,
        scopeId: scopeRecord.id,
        classifications: ["identifier", "declaration", "script"],
        isBuiltIn: false,
        isSynthetic: true
    };

    fileRecord.declarations.push({ ...syntheticDeclaration });
    scopeRecord.declarations.push({ ...syntheticDeclaration });
    fileRecord.hasSyntheticDeclaration = true;

    registerScriptDeclaration({
        identifierCollections,
        descriptor: scopeDescriptor,
        declarationRecord: syntheticDeclaration,
        filePath
    });
}

function cloneScriptReference(callRecord) {
    if (!callRecord) {
        return null;
    }

    return {
        filePath: callRecord.from?.filePath ?? null,
        scopeId: callRecord.from?.scopeId ?? null,
        targetName: callRecord.target?.name ?? null,
        targetResourcePath: callRecord.target?.resourcePath ?? null,
        location: {
            start: cloneLocation(callRecord.location?.start),
            end: cloneLocation(callRecord.location?.end)
        },
        isResolved: Boolean(callRecord.isResolved)
    };
}

function registerScriptReference({ identifierCollections, callRecord }) {
    const targetScopeId = callRecord?.target?.scopeId;
    if (!targetScopeId) {
        return;
    }

    const identifierId = buildIdentifierId("script", targetScopeId);

    const entry = ensureCollectionEntry(
        identifierCollections.scripts,
        targetScopeId,
        () => ({
            identifierId,
            id: targetScopeId,
            name: callRecord.target?.name ?? null,
            displayName: callRecord.target?.name
                ? `script.${callRecord.target.name}`
                : targetScopeId,
            resourcePath: callRecord.target?.resourcePath ?? null,
            declarations: [],
            references: []
        })
    );

    if (!entry.identifierId) {
        entry.identifierId = identifierId;
    }

    if (callRecord.target?.name && !entry.name) {
        entry.name = callRecord.target.name;
    }
    if (callRecord.target?.resourcePath && !entry.resourcePath) {
        entry.resourcePath = callRecord.target.resourcePath;
    }

    const reference = cloneScriptReference(callRecord);
    if (reference) {
        entry.references.push(reference);
    }
}

function recordScriptCallMetricsAndReferences({
    relationships,
    metrics,
    identifierCollections
}) {
    const scriptCalls = relationships?.scriptCalls ?? [];
    for (const callRecord of scriptCalls) {
        metrics.incrementCounter("scriptCalls.total");
        if (callRecord.isResolved) {
            metrics.incrementCounter("scriptCalls.resolved");
        } else {
            metrics.incrementCounter("scriptCalls.unresolved");
        }

        registerScriptReference({
            identifierCollections,
            callRecord
        });
    }
}

function mapToObject(map, transform, { sortEntries = true } = {}) {
    const entries = [...map.entries()];

    if (sortEntries) {
        entries.sort(([a], [b]) =>
            typeof a === "string" && typeof b === "string"
                ? a.localeCompare(b)
                : 0
        );
    }

    return Object.fromEntries(
        entries.map(([key, value]) => [key, transform(value, key)])
    );
}

function registerMacroOccurrence({
    identifierCollections,
    identifierRecord,
    filePath,
    role
}) {
    if (!identifierRecord?.name) {
        return;
    }

    const identifierId = buildIdentifierId("macro", identifierRecord.name);

    const entry = ensureCollectionEntry(
        identifierCollections.macros,
        identifierRecord.name,
        () => ({
            identifierId,
            name: identifierRecord.name,
            declarations: [],
            references: []
        })
    );

    if (!entry.identifierId) {
        entry.identifierId = identifierId;
    }

    const clone = cloneIdentifierForCollections(identifierRecord, filePath);
    if (role === "declaration") {
        entry.declarations.push(clone);
    } else if (role === "reference") {
        entry.references.push(clone);
    }
}

function registerEnumOccurrence({
    identifierCollections,
    identifierRecord,
    filePath,
    role,
    enumLookup
}) {
    const targetLocation =
        role === "reference"
            ? identifierRecord?.declaration?.start
            : identifierRecord?.start;

    const enumKey = buildFileLocationKey(filePath, targetLocation);
    if (!enumKey) {
        return;
    }

    const enumInfo = enumLookup?.enumDeclarations?.get(enumKey) ?? null;
    const identifierId = buildIdentifierId("enum", enumKey);
    const entry = ensureCollectionEntry(
        identifierCollections.enums,
        enumKey,
        () => ({
            identifierId,
            key: enumKey,
            name: enumInfo?.name ?? identifierRecord?.name ?? null,
            filePath: enumInfo?.filePath ?? filePath ?? null,
            declarations: [],
            references: []
        })
    );

    if (!entry.identifierId) {
        entry.identifierId = identifierId;
    }

    if (enumInfo && !entry.name) {
        entry.name =
            enumInfo.name ?? entry.name ?? identifierRecord?.name ?? null;
    }

    const clone = cloneIdentifierForCollections(identifierRecord, filePath);
    if (role === "declaration") {
        entry.declarations.push(clone);
    } else if (role === "reference") {
        entry.references.push(clone);
    }
}

function registerEnumMemberOccurrence({
    identifierCollections,
    identifierRecord,
    filePath,
    role,
    enumLookup
}) {
    const targetLocation =
        role === "reference"
            ? identifierRecord?.declaration?.start
            : identifierRecord?.start;

    const memberKey = buildFileLocationKey(filePath, targetLocation);
    if (!memberKey) {
        return;
    }

    const memberInfo = enumLookup?.memberDeclarations?.get(memberKey) ?? null;
    const enumKey = memberInfo?.enumKey ?? null;
    const identifierId = buildIdentifierId("enum-member", memberKey);

    const entry = ensureCollectionEntry(
        identifierCollections.enumMembers,
        memberKey,
        () => ({
            identifierId,
            key: memberKey,
            name: memberInfo?.name ?? identifierRecord?.name ?? null,
            enumKey,
            enumName: memberInfo?.enumKey
                ? (enumLookup?.enumDeclarations?.get(memberInfo.enumKey)
                      ?.name ?? null)
                : null,
            filePath: memberInfo?.filePath ?? filePath ?? null,
            declarations: [],
            references: []
        })
    );

    if (!entry.identifierId) {
        entry.identifierId = identifierId;
    }

    if (memberInfo?.enumKey && !entry.enumName) {
        entry.enumName =
            enumLookup?.enumDeclarations?.get(memberInfo.enumKey)?.name ??
            entry.enumName;
    }

    const clone = cloneIdentifierForCollections(identifierRecord, filePath);
    if (role === "declaration") {
        entry.declarations.push(clone);
    } else if (role === "reference") {
        entry.references.push(clone);
    }
}

function registerGlobalOccurrence({
    identifierCollections,
    identifierRecord,
    filePath,
    role
}) {
    if (!identifierRecord?.name) {
        return;
    }

    const identifierId = buildIdentifierId("global", identifierRecord.name);

    const entry = ensureCollectionEntry(
        identifierCollections.globalVariables,
        identifierRecord.name,
        () => ({
            identifierId,
            name: identifierRecord.name,
            declarations: [],
            references: []
        })
    );

    if (!entry.identifierId) {
        entry.identifierId = identifierId;
    }

    const clone = cloneIdentifierForCollections(identifierRecord, filePath);
    if (role === "declaration") {
        entry.declarations.push(clone);
    } else if (role === "reference") {
        entry.references.push(clone);
    }
}

function registerInstanceOccurrence({
    identifierCollections,
    identifierRecord,
    filePath,
    role,
    scopeDescriptor
}) {
    if (!identifierRecord?.name) {
        return;
    }

    const key = `${scopeDescriptor?.id ?? "instance"}:${identifierRecord.name}`;
    const identifierId = buildIdentifierId("instance", key);
    const entry = ensureCollectionEntry(
        identifierCollections.instanceVariables,
        key,
        () => ({
            identifierId,
            key,
            name: identifierRecord.name,
            scopeId: scopeDescriptor?.id ?? null,
            scopeKind: scopeDescriptor?.kind ?? null,
            declarations: [],
            references: []
        })
    );

    if (!entry.identifierId) {
        entry.identifierId = identifierId;
    }

    const clone = cloneIdentifierForCollections(identifierRecord, filePath);
    if (role === "declaration") {
        entry.declarations.push(clone);
    } else if (role === "reference") {
        entry.references.push(clone);
    }
}

function shouldTreatAsInstance({ identifierRecord, role, scopeDescriptor }) {
    if (!identifierRecord || role !== "reference") {
        return false;
    }

    if (!scopeDescriptor || scopeDescriptor.kind !== "objectEvent") {
        return false;
    }

    const classifications = asArray(identifierRecord?.classifications);

    if (classifications.includes("global")) {
        return false;
    }

    if (identifierRecord.declaration && identifierRecord.declaration.scopeId) {
        return false;
    }

    if (identifierRecord.isBuiltIn) {
        return false;
    }

    if (!classifications.includes("reference")) {
        return false;
    }

    return true;
}

function registerIdentifierOccurrence({
    identifierCollections,
    identifierRecord,
    filePath,
    role,
    enumLookup,
    scopeDescriptor
}) {
    if (!identifierRecord || !identifierCollections) {
        return;
    }

    const classifications = asArray(identifierRecord?.classifications);

    if (role === "declaration" && classifications.includes("script")) {
        registerScriptDeclaration({
            identifierCollections,
            descriptor: scopeDescriptor,
            declarationRecord: identifierRecord,
            filePath
        });
    }

    if (classifications.includes("macro")) {
        registerMacroOccurrence({
            identifierCollections,
            identifierRecord,
            filePath,
            role
        });
    }

    if (classifications.includes("enum")) {
        registerEnumOccurrence({
            identifierCollections,
            identifierRecord,
            filePath,
            role,
            enumLookup
        });
    }

    if (classifications.includes("enum-member")) {
        registerEnumMemberOccurrence({
            identifierCollections,
            identifierRecord,
            filePath,
            role,
            enumLookup
        });
    }

    if (
        classifications.includes("variable") &&
        classifications.includes("global")
    ) {
        registerGlobalOccurrence({
            identifierCollections,
            identifierRecord,
            filePath,
            role
        });
    }

    if (shouldTreatAsInstance({ identifierRecord, role, scopeDescriptor })) {
        registerInstanceOccurrence({
            identifierCollections,
            identifierRecord,
            filePath,
            role: "reference",
            scopeDescriptor
        });
    }
}

function registerInstanceAssignment({
    identifierCollections,
    identifierRecord,
    filePath,
    scopeDescriptor
}) {
    if (!identifierCollections || !identifierRecord || !identifierRecord.name) {
        return;
    }

    const identifierKey = `${
        scopeDescriptor?.id ?? "instance"
    }:${identifierRecord.name}`;
    const identifierId = buildIdentifierId("instance", identifierKey);
    const entry = ensureCollectionEntry(
        identifierCollections.instanceVariables,
        identifierKey,
        () => ({
            identifierId,
            key: identifierKey,
            name: identifierRecord.name,
            scopeId: scopeDescriptor?.id ?? null,
            scopeKind: scopeDescriptor?.kind ?? null,
            declarations: [],
            references: []
        })
    );

    if (!entry.identifierId) {
        entry.identifierId = identifierId;
    }

    const clone = cloneIdentifierForCollections(identifierRecord, filePath);

    const hasExisting = entry.declarations.some((existing) => {
        const existingKey = buildLocationKey(existing.start);
        const currentKey = buildLocationKey(clone.start);
        return existingKey && currentKey && existingKey === currentKey;
    });

    if (!hasExisting) {
        entry.declarations.push(clone);
    }
}

function ensureScopeRecord(scopeMap, descriptor) {
    return getOrCreateMapEntry(scopeMap, descriptor.id, () => ({
        id: descriptor.id,
        kind: descriptor.kind,
        name: descriptor.name,
        displayName: descriptor.displayName,
        resourcePath: descriptor.resourcePath,
        event: descriptor.event ?? null,
        filePaths: [],
        declarations: [],
        references: [],
        ignoredIdentifiers: [],
        scriptCalls: []
    }));
}

function ensureFileRecord(filesMap, relativePath, scopeId) {
    return getOrCreateMapEntry(filesMap, relativePath, () => ({
        filePath: relativePath,
        scopeId,
        declarations: [],
        references: [],
        ignoredIdentifiers: [],
        scriptCalls: []
    }));
}

function traverseAst(root, visitor) {
    if (!root || typeof root !== "object") {
        return;
    }

    const stack = [root];
    const seen = new WeakSet();

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== "object") {
            continue;
        }

        if (seen.has(node)) {
            continue;
        }
        seen.add(node);

        visitor(node);

        for (const key in node) {
            if (!hasOwn(node, key)) {
                continue;
            }

            const value = node[key];
            if (Array.isArray(value)) {
                for (let i = value.length - 1; i >= 0; i -= 1) {
                    const child = value[i];
                    if (child && typeof child === "object") {
                        stack.push(child);
                    }
                }
            } else if (value && typeof value === "object") {
                stack.push(value);
            }
        }
    }
}

function handleScriptScopeFunctionDeclarationNode({
    node,
    scopeDescriptor,
    scopeRecord,
    fileRecord,
    identifierCollections,
    sourceContents,
    lineOffsets
}) {
    if (
        scopeDescriptor?.kind !== "script" ||
        (node?.type !== "FunctionDeclaration" &&
            node?.type !== "ConstructorDeclaration")
    ) {
        return;
    }

    const classificationTags =
        node.type === "ConstructorDeclaration"
            ? ["constructor", "struct", "script"]
            : ["script"];
    const declarationRecord = createFunctionLikeIdentifierRecord({
        node,
        scopeRecord,
        fileRecord,
        classification: classificationTags,
        source: sourceContents,
        lineOffsets
    });

    if (!declarationRecord) {
        return;
    }

    const removalDescriptor = {
        name: declarationRecord.name,
        scopeId: scopeRecord.id
    };
    removeSyntheticScriptDeclarations(
        fileRecord.declarations,
        removalDescriptor
    );
    removeSyntheticScriptDeclarations(
        scopeRecord.declarations,
        removalDescriptor
    );

    const declarationKey = buildLocationKey(declarationRecord.start);
    const fileHasExisting = fileRecord.declarations.some(
        (existing) => buildLocationKey(existing.start) === declarationKey
    );
    if (!fileHasExisting) {
        fileRecord.declarations.push({ ...declarationRecord });
    }

    const scopeHasExisting = scopeRecord.declarations.some(
        (existing) => buildLocationKey(existing.start) === declarationKey
    );
    if (!scopeHasExisting) {
        scopeRecord.declarations.push({ ...declarationRecord });
    }

    registerScriptDeclaration({
        identifierCollections,
        descriptor: scopeDescriptor,
        declarationRecord,
        filePath: fileRecord?.filePath ?? null
    });
}

function handleIdentifierNode({
    node,
    builtInNames,
    fileRecord,
    scopeRecord,
    identifierCollections,
    enumLookup,
    scopeDescriptor,
    metrics
}) {
    if (node?.type !== "Identifier" || !Array.isArray(node.classifications)) {
        return false;
    }

    const identifierRecord = createIdentifierRecord(node);
    const isBuiltIn = builtInNames.has(identifierRecord.name);
    identifierRecord.isBuiltIn = isBuiltIn;

    metrics?.incrementCounter("identifiers.encountered");

    if (isBuiltIn) {
        metrics?.incrementCounter("identifiers.builtInSkipped");
        identifierRecord.reason = "built-in";
        fileRecord.ignoredIdentifiers.push(identifierRecord);
        scopeRecord.ignoredIdentifiers.push(identifierRecord);
        return true;
    }

    const isDeclaration = identifierRecord.classifications.includes(
        "declaration"
    );
    const isReference = identifierRecord.classifications.includes("reference");

    if (isDeclaration) {
        metrics?.incrementCounter("identifiers.declarations");
        fileRecord.declarations.push(identifierRecord);
        scopeRecord.declarations.push(identifierRecord);

        registerIdentifierOccurrence({
            identifierCollections,
            identifierRecord,
            filePath: fileRecord?.filePath ?? null,
            role: "declaration",
            enumLookup,
            scopeDescriptor: scopeDescriptor ?? scopeRecord
        });
    }

    if (isReference) {
        metrics?.incrementCounter("identifiers.references");
        fileRecord.references.push(identifierRecord);
        scopeRecord.references.push(identifierRecord);

        registerIdentifierOccurrence({
            identifierCollections,
            identifierRecord,
            filePath: fileRecord?.filePath ?? null,
            role: "reference",
            enumLookup,
            scopeDescriptor: scopeDescriptor ?? scopeRecord
        });
    }

    return false;
}

function handleCallExpressionNode({
    node,
    builtInNames,
    fileRecord,
    scopeRecord,
    relationships,
    scriptNameToScopeId,
    scriptNameToResourcePath,
    metrics
}) {
    if (node?.type !== "CallExpression") {
        return;
    }

    const callee = getCallExpressionIdentifier(node);
    const calleeName = callee?.name ?? null;
    if (!calleeName || builtInNames.has(calleeName)) {
        return;
    }

    const targetScopeId = scriptNameToScopeId.get(calleeName) ?? null;
    const targetResourcePath = targetScopeId
        ? scriptNameToResourcePath.get(calleeName) ?? null
        : null;

    const callRecord = {
        kind: "script",
        from: {
            filePath: fileRecord.filePath,
            scopeId: scopeRecord.id
        },
        target: {
            name: calleeName,
            scopeId: targetScopeId,
            resourcePath: targetResourcePath
        },
        isResolved: Boolean(targetScopeId),
        location: {
            start: cloneLocation(callee?.start),
            end: cloneLocation(callee?.end)
        }
    };

    fileRecord.scriptCalls.push(callRecord);
    scopeRecord.scriptCalls.push(callRecord);
    relationships.scriptCalls.push(callRecord);
    metrics?.incrementCounter("scriptCalls.discovered");
}

function handleNewExpressionScriptCall({
    node,
    builtInNames,
    fileRecord,
    scopeRecord,
    relationships,
    scriptNameToScopeId,
    scriptNameToResourcePath,
    metrics
}) {
    if (node?.type !== "NewExpression" || node.expression?.type !== "Identifier") {
        return;
    }

    const callee = node.expression;
    const calleeName = callee.name;
    if (typeof calleeName !== "string" || builtInNames.has(calleeName)) {
        return;
    }

    const targetScopeId = scriptNameToScopeId.get(calleeName) ?? null;
    const targetResourcePath = targetScopeId
        ? scriptNameToResourcePath.get(calleeName) ?? null
        : null;

    const callRecord = {
        kind: "script",
        from: {
            filePath: fileRecord.filePath,
            scopeId: scopeRecord.id
        },
        target: {
            name: calleeName,
            scopeId: targetScopeId,
            resourcePath: targetResourcePath
        },
        isResolved: Boolean(targetScopeId),
        location: {
            start: cloneLocation(callee.start),
            end: cloneLocation(callee.end)
        }
    };

    fileRecord.scriptCalls.push(callRecord);
    scopeRecord.scriptCalls.push(callRecord);
    relationships.scriptCalls.push(callRecord);
    metrics?.incrementCounter("scriptCalls.discovered");
}

function handleObjectEventAssignmentNode({
    node,
    scopeDescriptor,
    identifierCollections,
    builtInNames,
    fileRecord,
    scopeRecord,
    metrics
}) {
    if (
        node?.type !== "AssignmentExpression" ||
        node.left?.type !== "Identifier" ||
        scopeDescriptor?.kind !== "objectEvent"
    ) {
        return;
    }

    const leftRecord = createIdentifierRecord(node.left);
    const classifications = asArray(leftRecord?.classifications);

    const isGlobalAssignment =
        classifications.includes("global") || leftRecord.isGlobalIdentifier;
    const hasDeclaration = Boolean(
        leftRecord.declaration && leftRecord.declaration.scopeId
    );

    if (
        identifierCollections &&
        !isGlobalAssignment &&
        !hasDeclaration &&
        leftRecord.name &&
        !builtInNames.has(leftRecord.name)
    ) {
        registerInstanceAssignment({
            identifierCollections,
            identifierRecord: leftRecord,
            filePath: fileRecord?.filePath ?? null,
            scopeDescriptor: scopeDescriptor ?? scopeRecord
        });
        metrics?.incrementCounter("identifiers.instanceAssignments");
    }
}




function analyseGmlAst({
    ast,
    builtInNames,
    scopeRecord,
    fileRecord,
    relationships,
    scriptNameToScopeId,
    scriptNameToResourcePath,
    identifierCollections,
    scopeDescriptor,
    metrics = null,
    sourceContents = "",
    lineOffsets = null
}) {
    const enumLookup = createEnumLookup(ast, fileRecord?.filePath ?? null);

    traverseAst(ast, (node) => {
        handleScriptScopeFunctionDeclarationNode({
            node,
            scopeDescriptor,
            scopeRecord,
            fileRecord,
            identifierCollections,
            sourceContents,
            lineOffsets
        });

        const identifierHandled = handleIdentifierNode({
            node,
            builtInNames,
            fileRecord,
            scopeRecord,
            identifierCollections,
            enumLookup,
            scopeDescriptor,
            metrics
        });
        if (identifierHandled) {
            return;
        }

        handleCallExpressionNode({
            node,
            builtInNames,
            fileRecord,
            scopeRecord,
            relationships,
            scriptNameToScopeId,
            scriptNameToResourcePath,
            metrics
        });

        handleNewExpressionScriptCall({
            node,
            builtInNames,
            fileRecord,
            scopeRecord,
            relationships,
            scriptNameToScopeId,
            scriptNameToResourcePath,
            metrics
        });

        handleObjectEventAssignmentNode({
            node,
            scopeDescriptor,
            identifierCollections,
            builtInNames,
            fileRecord,
            scopeRecord,
            metrics
        });
    });
}

function cloneAssetReference(reference) {
    return {
        fromResourcePath: reference.fromResourcePath,
        fromResourceName: reference.fromResourceName,
        propertyPath: reference.propertyPath,
        targetPath: reference.targetPath,
        targetName: reference.targetName ?? null,
        targetResourceType: reference.targetResourceType ?? null
    };
}

async function processWithConcurrency(items, limit, worker, options = {}) {
    if (!isNonEmptyArray(items)) {
        return;
    }

    assertFunction(worker, "worker");

    const signal = resolveAbortSignalFromOptions(options, {
        fallbackMessage: PROJECT_INDEX_BUILD_ABORT_MESSAGE
    });
    const ensureNotAborted = () =>
        throwIfAborted(signal, PROJECT_INDEX_BUILD_ABORT_MESSAGE);

    const limitValue = Number(limit);
    const effectiveLimit =
        Number.isFinite(limitValue) && limitValue > 0
            ? limitValue
            : items.length;
    const workerCount = Math.min(
        items.length,
        Math.max(1, Math.ceil(effectiveLimit))
    );

    let nextIndex = 0;
    const runWorker = async () => {
        ensureNotAborted();
        let currentIndex;
        while ((currentIndex = nextIndex++) < items.length) {
            ensureNotAborted();
            await worker(items[currentIndex], currentIndex);
            ensureNotAborted();
        }
    };

    await Promise.all(Array.from({ length: workerCount }, runWorker));
}

export async function buildProjectIndex(
    projectRoot,
    fsFacade = defaultFsFacade,
    options = {}
) {
    if (!projectRoot) {
        throw new Error("projectRoot must be provided to buildProjectIndex");
    }

    const resolvedRoot = path.resolve(projectRoot);
    const logger = options?.logger ?? null;
    const metrics = createProjectIndexMetrics({
        metrics: options?.metrics,
        logger,
        logMetrics: options?.logMetrics
    });

    const stopTotal = metrics.startTimer("total");

    const signal = resolveAbortSignalFromOptions(options, {
        fallbackMessage: PROJECT_INDEX_BUILD_ABORT_MESSAGE
    });
    const ensureNotAborted = () =>
        throwIfAborted(signal, PROJECT_INDEX_BUILD_ABORT_MESSAGE);
    ensureNotAborted();

    const builtInIdentifiers = await metrics.timeAsync("loadBuiltIns", () =>
        loadBuiltInIdentifiers(fsFacade, metrics, { signal })
    );
    ensureNotAborted();
    const builtInNames = builtInIdentifiers.names ?? new Set();

    const { yyFiles, gmlFiles } = await metrics.timeAsync(
        "scanProjectTree",
        () => scanProjectTree(resolvedRoot, fsFacade, metrics, { signal })
    );
    ensureNotAborted();
    metrics.setMetadata("yyFileCount", yyFiles.length);
    metrics.setMetadata("gmlFileCount", gmlFiles.length);

    const resourceAnalysis = await metrics.timeAsync(
        "analyseResourceFiles",
        () =>
            analyseResourceFiles({
                projectRoot: resolvedRoot,
                yyFiles,
                fsFacade,
                signal
            })
    );
    ensureNotAborted();

    metrics.incrementCounter(
        "resources.total",
        resourceAnalysis.resourcesMap.size
    );

    const scopeMap = new Map();
    const filesMap = new Map();
    const relationships = {
        scriptCalls: [],
        assetReferences: resourceAnalysis.assetReferences.map((reference) =>
            cloneAssetReference(reference)
        )
    };
    const identifierCollections = createIdentifierCollections();

    const concurrencySettings = options?.concurrency ?? {};
    const gmlConcurrency = clampConcurrency(
        concurrencySettings.gml ?? concurrencySettings.gmlParsing
    );
    metrics.setMetadata("gmlParseConcurrency", gmlConcurrency);
    const parseProjectSource = resolveProjectIndexParser(options);

    await processWithConcurrency(
        gmlFiles,
        gmlConcurrency,
        async (file) => {
            ensureNotAborted();
            metrics.incrementCounter("files.gmlProcessed");
            let contents;
            try {
                contents = await metrics.timeAsync("fs.readGml", () =>
                    fsFacade.readFile(file.absolutePath, "utf8")
                );
            } catch (error) {
                if (isFsErrorCode(error, "ENOENT")) {
                    metrics.incrementCounter("files.missingDuringRead");
                    return;
                }
                throw error;
            }

            ensureNotAborted();

            metrics.incrementCounter(
                "io.gmlBytes",
                Buffer.byteLength(contents)
            );
            const lineOffsets = computeLineOffsets(contents);

            const scopeDescriptor =
                resourceAnalysis.gmlScopeMap.get(file.relativePath) ??
                createFileScopeDescriptor(file.relativePath);

            const scopeRecord = ensureScopeRecord(scopeMap, scopeDescriptor);
            if (!scopeRecord.filePaths.includes(file.relativePath)) {
                scopeRecord.filePaths.push(file.relativePath);
            }
            ensureScriptEntry(identifierCollections, scopeDescriptor);

            const fileRecord = ensureFileRecord(
                filesMap,
                file.relativePath,
                scopeRecord.id
            );

            ensureSyntheticScriptDeclaration({
                scopeDescriptor,
                scopeRecord,
                fileRecord,
                identifierCollections,
                filePath: file.relativePath
            });
            const ast = metrics.timeSync("gml.parse", () =>
                parseProjectSource(contents, {
                    filePath: file.relativePath,
                    projectRoot: resolvedRoot
                })
            );

            metrics.timeSync("gml.analyse", () =>
                analyseGmlAst({
                    ast,
                    builtInNames,
                    scopeRecord,
                    fileRecord,
                    relationships,
                    scriptNameToScopeId: resourceAnalysis.scriptNameToScopeId,
                    scriptNameToResourcePath:
                        resourceAnalysis.scriptNameToResourcePath,
                    identifierCollections,
                    scopeDescriptor,
                    metrics,
                    sourceContents: contents,
                    lineOffsets
                })
            );
        },
        { signal }
    );
    ensureNotAborted();

    recordScriptCallMetricsAndReferences({
        relationships,
        metrics,
        identifierCollections
    });

    const resources = mapToObject(
        resourceAnalysis.resourcesMap,
        (record) => ({
            path: record.path,
            name: record.name,
            resourceType: record.resourceType,
            scopes: [...record.scopes],
            gmlFiles: [...record.gmlFiles],
            assetReferences: record.assetReferences.map((reference) =>
                cloneAssetReference(reference)
            )
        }),
        { sortEntries: false }
    );

    const scopes = mapToObject(
        scopeMap,
        (record) => ({
            id: record.id,
            kind: record.kind,
            name: record.name,
            displayName: record.displayName,
            resourcePath: record.resourcePath,
            event: record.event ? { ...record.event } : null,
            filePaths: [...record.filePaths],
            ...cloneEntryCollections(
                record,
                "declarations",
                "references",
                "ignoredIdentifiers",
                "scriptCalls"
            )
        }),
        { sortEntries: false }
    );

    const files = mapToObject(
        filesMap,
        (record) => ({
            filePath: record.filePath,
            scopeId: record.scopeId,
            ...cloneEntryCollections(
                record,
                "declarations",
                "references",
                "ignoredIdentifiers",
                "scriptCalls"
            )
        }),
        { sortEntries: false }
    );

    const identifiers = {
        scripts: mapToObject(identifierCollections.scripts, (entry) => ({
            identifierId:
                entry.identifierId ??
                buildIdentifierId("script", entry.id ?? entry.name ?? ""),
            id: entry.id,
            name: entry.name ?? null,
            displayName: entry.displayName ?? entry.name ?? entry.id,
            resourcePath: entry.resourcePath ?? null,
            declarationKinds: [...asArray(entry.declarationKinds)],
            ...cloneEntryCollections(entry, "declarations"),
            references: entry.references.map((reference) => ({
                filePath: reference.filePath ?? null,
                scopeId: reference.scopeId ?? null,
                targetName: reference.targetName ?? null,
                targetResourcePath: reference.targetResourcePath ?? null,
                location: reference.location
                    ? {
                          start: cloneLocation(reference.location.start),
                          end: cloneLocation(reference.location.end)
                      }
                    : null,
                isResolved: reference.isResolved ?? false
            }))
        })),
        macros: mapToObject(identifierCollections.macros, (entry) => ({
            identifierId:
                entry.identifierId ??
                buildIdentifierId("macro", entry.name ?? ""),
            name: entry.name,
            ...cloneEntryCollections(entry, "declarations", "references")
        })),
        enums: mapToObject(identifierCollections.enums, (entry) => ({
            identifierId:
                entry.identifierId ??
                buildIdentifierId("enum", entry.key ?? entry.name ?? ""),
            key: entry.key,
            name: entry.name ?? null,
            filePath: entry.filePath ?? null,
            ...cloneEntryCollections(entry, "declarations", "references")
        })),
        enumMembers: mapToObject(
            identifierCollections.enumMembers,
            (entry) => ({
                identifierId:
                    entry.identifierId ??
                    buildIdentifierId("enum-member", entry.key ?? ""),
                key: entry.key,
                name: entry.name ?? null,
                enumKey: entry.enumKey ?? null,
                enumName: entry.enumName ?? null,
                filePath: entry.filePath ?? null,
                ...cloneEntryCollections(entry, "declarations", "references")
            })
        ),
        globalVariables: mapToObject(
            identifierCollections.globalVariables,
            (entry) => ({
                identifierId:
                    entry.identifierId ??
                    buildIdentifierId("global", entry.name ?? ""),
                name: entry.name,
                ...cloneEntryCollections(entry, "declarations", "references")
            })
        ),
        instanceVariables: mapToObject(
            identifierCollections.instanceVariables,
            (entry) => ({
                identifierId:
                    entry.identifierId ??
                    buildIdentifierId("instance", entry.key ?? ""),
                key: entry.key,
                name: entry.name ?? null,
                scopeId: entry.scopeId ?? null,
                scopeKind: entry.scopeKind ?? null,
                ...cloneEntryCollections(entry, "declarations", "references")
            })
        )
    };

    stopTotal();
    const projectIndex = {
        projectRoot: resolvedRoot,
        resources,
        scopes,
        files,
        relationships,
        identifiers
    };

    const metricsReport = finalizeProjectIndexMetrics(metrics);
    if (metricsReport) {
        projectIndex.metrics = metricsReport;
        options?.onMetrics?.(metricsReport, projectIndex);
    }

    return projectIndex;
}
export { getDefaultFsFacade } from "./fs-facade.js";
export { getProjectIndexParserOverride };
