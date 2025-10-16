import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloneLocation } from "../../../shared/ast-locations.js";
import { hasOwn } from "../../../shared/object-utils.js";
import {
    buildLocationKey,
    buildFileLocationKey
} from "../../../shared/location-keys.js";
import { getDefaultProjectIndexParser } from "./gml-parser-facade.js";
import { PROJECT_MANIFEST_EXTENSION } from "./constants.js";
import { defaultFsFacade } from "./fs-facade.js";
import { isFsErrorCode, listDirectory, getFileMtime } from "./fs-utils.js";
import {
    DEFAULT_MAX_PROJECT_INDEX_CACHE_SIZE,
    loadProjectIndexCache,
    saveProjectIndexCache
} from "./cache.js";
import {
    createProjectIndexMetrics,
    finalizeProjectIndexMetrics
} from "./metrics.js";
import {
    analyseResourceFiles,
    createFileScopeDescriptor,
    scanProjectTree
} from "./resource-discovery.js";

const defaultProjectIndexParser = getDefaultProjectIndexParser();
const DEFAULT_PROJECT_INDEX_GML_CONCURRENCY = 4;

function isParserFacade(candidate) {
    return (
        !!candidate &&
        typeof candidate === "object" &&
        typeof candidate.parse === "function"
    );
}

function createFacadeParser(facade) {
    return (sourceText, context) => facade.parse(sourceText, context);
}

function getProjectIndexParserOverride(options) {
    if (!options || typeof options !== "object") {
        return null;
    }

    const identifierCaseParser = options.identifierCaseProjectIndexParserFacade;
    if (isParserFacade(identifierCaseParser)) {
        return {
            facade: identifierCaseParser,
            parse: createFacadeParser(identifierCaseParser)
        };
    }

    const gmlParserFacade = options.gmlParserFacade;
    if (isParserFacade(gmlParserFacade)) {
        return {
            facade: gmlParserFacade,
            parse: createFacadeParser(gmlParserFacade)
        };
    }

    const parserFacade = options.parserFacade;
    if (isParserFacade(parserFacade)) {
        return {
            facade: parserFacade,
            parse: createFacadeParser(parserFacade)
        };
    }

    const { parseGml } = options;
    if (typeof parseGml === "function") {
        return { facade: null, parse: parseGml };
    }

    return null;
}

function resolveProjectIndexParser(options) {
    const override = getProjectIndexParserOverride(options);
    if (!override) {
        return defaultProjectIndexParser;
    }

    return override.parse;
}

function isManifestEntry(entry) {
    return (
        typeof entry === "string" &&
        entry.toLowerCase().endsWith(PROJECT_MANIFEST_EXTENSION)
    );
}

export async function findProjectRoot(options, fsFacade = defaultFsFacade) {
    const filepath = options?.filepath;
    if (!filepath) {
        return null;
    }

    let current = path.dirname(path.resolve(filepath));
    const visited = new Set();

    while (!visited.has(current)) {
        visited.add(current);
        const entries = await listDirectory(fsFacade, current);
        const hasManifest = entries.some(isManifestEntry);
        if (hasManifest) {
            return current;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
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
            ? DEFAULT_MAX_PROJECT_INDEX_CACHE_SIZE
            : rawCacheMaxSizeBytes;

    const inFlight = new Map();
    let disposed = false;

    function ensureNotDisposed() {
        if (disposed) {
            throw new Error("ProjectIndexCoordinator has been disposed");
        }
    }

    async function ensureReady(descriptor) {
        ensureNotDisposed();
        const { projectRoot } = descriptor ?? {};
        if (!projectRoot) {
            throw new Error("projectRoot must be provided to ensureReady");
        }
        const resolvedRoot = path.resolve(projectRoot);
        const key = resolvedRoot;

        if (inFlight.has(key)) {
            return inFlight.get(key);
        }

        const operation = (async () => {
            const loadResult = await loadCache(
                { ...descriptor, projectRoot: resolvedRoot },
                fsFacade
            );

            if (loadResult.status === "hit") {
                return {
                    source: "cache",
                    projectIndex: loadResult.projectIndex,
                    cache: loadResult
                };
            }

            const projectIndex = await buildIndex(
                resolvedRoot,
                fsFacade,
                descriptor?.buildOptions ?? {}
            );

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
                fsFacade
            ).catch((error) => {
                return {
                    status: "failed",
                    error,
                    cacheFilePath: loadResult.cacheFilePath
                };
            });

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
        disposed = true;
        inFlight.clear();
    }

    return {
        ensureReady,
        dispose
    };
}

export { PROJECT_MANIFEST_EXTENSION } from "./constants.js";
export {
    PROJECT_INDEX_CACHE_SCHEMA_VERSION,
    PROJECT_INDEX_CACHE_DIRECTORY,
    PROJECT_INDEX_CACHE_FILENAME,
    DEFAULT_MAX_PROJECT_INDEX_CACHE_SIZE,
    ProjectIndexCacheMissReason,
    loadProjectIndexCache,
    saveProjectIndexCache,
    deriveCacheKey
} from "./cache.js";

export { DEFAULT_PROJECT_INDEX_GML_CONCURRENCY };

const GML_IDENTIFIER_FILE_PATH = fileURLToPath(
    new URL("../../../../resources/gml-identifiers.json", import.meta.url)
);

let cachedBuiltInIdentifiers = null;

async function loadBuiltInIdentifiers(
    fsFacade = defaultFsFacade,
    metrics = null
) {
    const currentMtime = await getFileMtime(fsFacade, GML_IDENTIFIER_FILE_PATH);

    if (cachedBuiltInIdentifiers) {
        const cachedMtime = cachedBuiltInIdentifiers.metadata?.mtimeMs ?? null;
        if (cachedMtime === currentMtime) {
            metrics?.recordCacheHit("builtInIdentifiers");
            return cachedBuiltInIdentifiers;
        }

        metrics?.recordCacheStale("builtInIdentifiers");
    } else {
        metrics?.recordCacheMiss("builtInIdentifiers");
    }

    try {
        const rawContents = await fsFacade.readFile(
            GML_IDENTIFIER_FILE_PATH,
            "utf8"
        );
        const parsed = JSON.parse(rawContents);
        const identifiers = parsed?.identifiers ?? {};

        const names = new Set();
        for (const name of Object.keys(identifiers)) {
            names.add(name);
        }

        cachedBuiltInIdentifiers = {
            metadata: { mtimeMs: currentMtime },
            names
        };
    } catch {
        cachedBuiltInIdentifiers = {
            metadata: { mtimeMs: currentMtime },
            names: new Set()
        };
    }

    return cachedBuiltInIdentifiers;
}

function pushUnique(array, value) {
    if (!array.includes(value)) {
        array.push(value);
    }
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
        classifications: Array.isArray(node?.classifications)
            ? [...node.classifications]
            : [],
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
        classifications: Array.isArray(record?.classifications)
            ? [...record.classifications]
            : [],
        declaration: record?.declaration ? { ...record.declaration } : null,
        isBuiltIn: record?.isBuiltIn ?? false,
        reason: record?.reason ?? null,
        isSynthetic: record?.isSynthetic ?? false,
        isGlobalIdentifier: record?.isGlobalIdentifier ?? false
    };
}

function ensureCollectionEntry(map, key, initializer) {
    if (!map.has(key)) {
        map.set(key, initializer());
    }
    return map.get(key);
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

                const members = Array.isArray(node.members) ? node.members : [];
                for (const member of members) {
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

    const declarationTags = Array.isArray(clone.classifications)
        ? clone.classifications
        : [];
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

function mapToObject(map, transform) {
    const entries = [...map.entries()].sort(([a], [b]) =>
        typeof a === "string" && typeof b === "string" ? a.localeCompare(b) : 0
    );
    return Object.fromEntries(
        entries.map(([key, value]) => [key, transform(value)])
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

    const classifications = Array.isArray(identifierRecord.classifications)
        ? identifierRecord.classifications
        : [];

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

    const classifications = Array.isArray(identifierRecord.classifications)
        ? identifierRecord.classifications
        : [];

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
    let scopeRecord = scopeMap.get(descriptor.id);
    if (!scopeRecord) {
        scopeRecord = {
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
        };
        scopeMap.set(descriptor.id, scopeRecord);
    }
    return scopeRecord;
}

function ensureFileRecord(filesMap, relativePath, scopeId) {
    let fileRecord = filesMap.get(relativePath);
    if (!fileRecord) {
        fileRecord = {
            filePath: relativePath,
            scopeId,
            declarations: [],
            references: [],
            ignoredIdentifiers: [],
            scriptCalls: []
        };
        filesMap.set(relativePath, fileRecord);
    }
    return fileRecord;
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
        if (
            scopeDescriptor?.kind === "script" &&
            (node?.type === "FunctionDeclaration" ||
                node?.type === "ConstructorDeclaration")
        ) {
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

            if (declarationRecord) {
                removeSyntheticScriptDeclarations(fileRecord.declarations, {
                    name: declarationRecord.name,
                    scopeId: scopeRecord.id
                });
                removeSyntheticScriptDeclarations(scopeRecord.declarations, {
                    name: declarationRecord.name,
                    scopeId: scopeRecord.id
                });

                const declarationKey = buildLocationKey(
                    declarationRecord.start
                );
                const fileHasExisting = fileRecord.declarations.some(
                    (existing) =>
                        buildLocationKey(existing.start) === declarationKey
                );
                if (!fileHasExisting) {
                    fileRecord.declarations.push({ ...declarationRecord });
                }

                const scopeHasExisting = scopeRecord.declarations.some(
                    (existing) =>
                        buildLocationKey(existing.start) === declarationKey
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
        }

        if (
            node?.type === "Identifier" &&
            Array.isArray(node.classifications)
        ) {
            const identifierRecord = createIdentifierRecord(node);
            const isBuiltIn = builtInNames.has(identifierRecord.name);
            identifierRecord.isBuiltIn = isBuiltIn;

            metrics?.incrementCounter("identifiers.encountered");

            if (isBuiltIn) {
                metrics?.incrementCounter("identifiers.builtInSkipped");
                identifierRecord.reason = "built-in";
                fileRecord.ignoredIdentifiers.push(identifierRecord);
                scopeRecord.ignoredIdentifiers.push(identifierRecord);
                return;
            }

            const isDeclaration =
                identifierRecord.classifications.includes("declaration");
            const isReference =
                identifierRecord.classifications.includes("reference");

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
        }

        if (
            node?.type === "CallExpression" &&
            node.object?.type === "Identifier"
        ) {
            const callee = node.object;
            const calleeName = callee.name;
            if (typeof calleeName !== "string") {
                return;
            }

            if (builtInNames.has(calleeName)) {
                return;
            }

            const targetScopeId = scriptNameToScopeId.get(calleeName) ?? null;
            const targetResourcePath = targetScopeId
                ? (scriptNameToResourcePath.get(calleeName) ?? null)
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

        if (
            node?.type === "NewExpression" &&
            node.expression?.type === "Identifier"
        ) {
            const callee = node.expression;
            const calleeName = callee.name;
            if (typeof calleeName === "string") {
                const targetScopeId =
                    scriptNameToScopeId.get(calleeName) ?? null;
                const targetResourcePath = targetScopeId
                    ? (scriptNameToResourcePath.get(calleeName) ?? null)
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
        }

        if (
            node?.type === "AssignmentExpression" &&
            node.left?.type === "Identifier" &&
            scopeDescriptor?.kind === "objectEvent"
        ) {
            const leftRecord = createIdentifierRecord(node.left);
            const classifications = Array.isArray(leftRecord.classifications)
                ? leftRecord.classifications
                : [];

            const isGlobalAssignment =
                classifications.includes("global") ||
                leftRecord.isGlobalIdentifier;
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

function clampConcurrency(
    value,
    { min = 1, max = 16, fallback = DEFAULT_PROJECT_INDEX_GML_CONCURRENCY } = {}
) {
    const numeric = Number(value ?? fallback);
    if (!Number.isFinite(numeric) || numeric < min) {
        return min;
    }
    if (numeric > max) {
        return max;
    }
    return numeric;
}

async function processWithConcurrency(items, limit, worker) {
    if (!Array.isArray(items) || items.length === 0) {
        return;
    }

    if (typeof worker !== "function") {
        throw new TypeError("worker must be a function");
    }

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
        let currentIndex;
        while ((currentIndex = nextIndex++) < items.length) {
            await worker(items[currentIndex], currentIndex);
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

    const builtInIdentifiers = await metrics.timeAsync("loadBuiltIns", () =>
        loadBuiltInIdentifiers(fsFacade, metrics)
    );
    const builtInNames = builtInIdentifiers.names ?? new Set();

    const { yyFiles, gmlFiles } = await metrics.timeAsync(
        "scanProjectTree",
        () => scanProjectTree(resolvedRoot, fsFacade, metrics)
    );
    metrics.setMetadata("yyFileCount", yyFiles.length);
    metrics.setMetadata("gmlFileCount", gmlFiles.length);

    const resourceAnalysis = await metrics.timeAsync(
        "analyseResourceFiles",
        () =>
            analyseResourceFiles({
                projectRoot: resolvedRoot,
                yyFiles,
                fsFacade
            })
    );

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
        concurrencySettings.gml ??
            concurrencySettings.gmlParsing ??
            DEFAULT_PROJECT_INDEX_GML_CONCURRENCY
    );
    metrics.setMetadata("gmlParseConcurrency", gmlConcurrency);
    const parseProjectSource = resolveProjectIndexParser(options);

    await processWithConcurrency(gmlFiles, gmlConcurrency, async (file) => {
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

        metrics.incrementCounter("io.gmlBytes", Buffer.byteLength(contents));
        const lineOffsets = computeLineOffsets(contents);

        const scopeDescriptor =
            resourceAnalysis.gmlScopeMap.get(file.relativePath) ??
            createFileScopeDescriptor(file.relativePath);

        const scopeRecord = ensureScopeRecord(scopeMap, scopeDescriptor);
        pushUnique(scopeRecord.filePaths, file.relativePath);
        ensureScriptEntry(identifierCollections, scopeDescriptor);

        const fileRecord = ensureFileRecord(
            filesMap,
            file.relativePath,
            scopeRecord.id
        );

        if (
            scopeDescriptor.kind === "script" &&
            !fileRecord.hasSyntheticDeclaration
        ) {
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
                filePath: file.relativePath
            });
        }

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
    });

    for (const callRecord of relationships.scriptCalls) {
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

    const resources = Object.fromEntries(
        [...resourceAnalysis.resourcesMap.entries()].map(
            ([resourcePath, record]) => [
                resourcePath,
                {
                    path: record.path,
                    name: record.name,
                    resourceType: record.resourceType,
                    scopes: [...record.scopes],
                    gmlFiles: [...record.gmlFiles],
                    assetReferences: record.assetReferences.map((reference) =>
                        cloneAssetReference(reference)
                    )
                }
            ]
        )
    );

    const scopes = Object.fromEntries(
        [...scopeMap.entries()].map(([scopeId, record]) => [
            scopeId,
            {
                id: record.id,
                kind: record.kind,
                name: record.name,
                displayName: record.displayName,
                resourcePath: record.resourcePath,
                event: record.event ? { ...record.event } : null,
                filePaths: [...record.filePaths],
                declarations: record.declarations.map((item) => ({ ...item })),
                references: record.references.map((item) => ({ ...item })),
                ignoredIdentifiers: record.ignoredIdentifiers.map((item) => ({
                    ...item
                })),
                scriptCalls: record.scriptCalls.map((call) => ({ ...call }))
            }
        ])
    );

    const files = Object.fromEntries(
        [...filesMap.entries()].map(([filePath, record]) => [
            filePath,
            {
                filePath: record.filePath,
                scopeId: record.scopeId,
                declarations: record.declarations.map((item) => ({ ...item })),
                references: record.references.map((item) => ({ ...item })),
                ignoredIdentifiers: record.ignoredIdentifiers.map((item) => ({
                    ...item
                })),
                scriptCalls: record.scriptCalls.map((call) => ({ ...call }))
            }
        ])
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
            declarationKinds: Array.isArray(entry.declarationKinds)
                ? [...entry.declarationKinds]
                : [],
            declarations: entry.declarations.map((item) => ({ ...item })),
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
            declarations: entry.declarations.map((item) => ({ ...item })),
            references: entry.references.map((item) => ({ ...item }))
        })),
        enums: mapToObject(identifierCollections.enums, (entry) => ({
            identifierId:
                entry.identifierId ??
                buildIdentifierId("enum", entry.key ?? entry.name ?? ""),
            key: entry.key,
            name: entry.name ?? null,
            filePath: entry.filePath ?? null,
            declarations: entry.declarations.map((item) => ({ ...item })),
            references: entry.references.map((item) => ({ ...item }))
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
                declarations: entry.declarations.map((item) => ({ ...item })),
                references: entry.references.map((item) => ({ ...item }))
            })
        ),
        globalVariables: mapToObject(
            identifierCollections.globalVariables,
            (entry) => ({
                identifierId:
                    entry.identifierId ??
                    buildIdentifierId("global", entry.name ?? ""),
                name: entry.name,
                declarations: entry.declarations.map((item) => ({ ...item })),
                references: entry.references.map((item) => ({ ...item }))
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
                declarations: entry.declarations.map((item) => ({ ...item })),
                references: entry.references.map((item) => ({ ...item }))
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
