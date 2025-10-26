import path from "node:path";
import {
    asArray,
    assertFunction,
    buildFileLocationKey,
    buildLocationKey,
    cloneLocation,
    getCallExpressionIdentifier,
    getOrCreateMapEntry,
    hasOwn,
    isFsErrorCode,
    isNonEmptyArray,
    isObjectLike,
    pushUnique
} from "../../../shared/index.js";
import { defaultFsFacade } from "./fs-facade.js";
import { clampConcurrency } from "./concurrency.js";
import { resolveProjectIndexParser } from "./parser-override.js";
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
    analyseResourceFiles,
    createFileScopeDescriptor
} from "./resource-analysis.js";
import { scanProjectTree } from "./project-tree.js";
import {
    PROJECT_INDEX_BUILD_ABORT_MESSAGE,
    createProjectIndexAbortGuard
} from "./abort-guard.js";
import { loadBuiltInIdentifiers } from "./built-in-identifiers.js";
import { createProjectIndexCoordinator as createProjectIndexCoordinatorCore } from "./coordinator.js";
import { cloneObjectEntries } from "./clone-object-entries.js";
import {
    IdentifierRole,
    assertValidIdentifierRole
} from "./identifier-roles.js";

/**
 * Create shallow clones of common entry collections stored on project index
 * records (for example declaration/reference lists). Guarding against
 * non-object input keeps the helper resilient when callers forward values
 * sourced from partially populated caches.
 */
function cloneEntryCollections(entry, ...keys) {
    const source = isObjectLike(entry) ? entry : {};
    return Object.fromEntries(
        keys.map((key) => [key, cloneObjectEntries(source[key])])
    );
}

export function createProjectIndexCoordinator(options = {}) {
    const {
        fsFacade = defaultFsFacade,
        loadCache = loadProjectIndexCache,
        saveCache = saveProjectIndexCache,
        buildIndex = buildProjectIndex,
        cacheMaxSizeBytes,
        getDefaultCacheMaxSize = getDefaultProjectIndexCacheMaxSize
    } = options;

    return createProjectIndexCoordinatorCore({
        fsFacade,
        loadCache,
        saveCache,
        buildIndex,
        cacheMaxSizeBytes,
        getDefaultCacheMaxSize
    });
}

export { findProjectRoot } from "./project-root.js";

export {
    createProjectIndexBuildOptions,
    createProjectIndexDescriptor
} from "./bootstrap-descriptor.js";

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
    PROJECT_INDEX_GML_CONCURRENCY_BASELINE,
    clampConcurrency
} from "./concurrency.js";

function cloneIdentifierDeclaration(declaration) {
    if (!isObjectLike(declaration)) {
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

function ensureIdentifierCollectionEntry({
    collection,
    key,
    identifierId,
    initializer
}) {
    return ensureCollectionEntry(collection, key, () => {
        const initializerValue =
            typeof initializer === "function" ? initializer() : initializer;
        const {
            declarations: initialDeclarations,
            references: initialReferences,
            ...rest
        } = isObjectLike(initializerValue) ? initializerValue : {};

        const declarations = Array.isArray(initialDeclarations)
            ? [...initialDeclarations]
            : [];
        const references = Array.isArray(initialReferences)
            ? [...initialReferences]
            : [];

        return {
            identifierId,
            declarations,
            references,
            ...rest
        };
    });
}

function recordIdentifierCollectionRole(
    entry,
    identifierRecord,
    filePath,
    role
) {
    if (!entry || !identifierRecord) {
        return;
    }

    const validatedRole = assertValidIdentifierRole(role);

    const clone = cloneIdentifierForCollections(identifierRecord, filePath);

    if (validatedRole === IdentifierRole.DECLARATION) {
        entry.declarations?.push?.(clone);
    } else if (validatedRole === IdentifierRole.REFERENCE) {
        entry.references?.push?.(clone);
    }
}

function assignIdentifierEntryMetadata(entry, metadata) {
    if (!entry || typeof entry !== "object") {
        return entry;
    }

    const {
        identifierId,
        name,
        displayName,
        resourcePath,
        enumName,
        scopeId,
        scopeKind
    } = metadata ?? {};

    if (identifierId !== undefined && !entry.identifierId) {
        entry.identifierId = identifierId;
    }

    if (name && !entry.name) {
        entry.name = name;
    }

    if (displayName && !entry.displayName) {
        entry.displayName = displayName;
    }

    if (resourcePath && !entry.resourcePath) {
        entry.resourcePath = resourcePath;
    }

    if (enumName && !entry.enumName) {
        entry.enumName = enumName;
    }

    if (scopeId !== undefined && !entry.scopeId) {
        entry.scopeId = scopeId;
    }

    if (scopeKind !== undefined && !entry.scopeKind) {
        entry.scopeKind = scopeKind;
    }

    return entry;
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
        if (tag) {
            pushUnique(classificationTags, tag);
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
        if (!isObjectLike(node)) {
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
                    if (isObjectLike(child)) {
                        visitStack.push(child);
                    }
                }
            } else if (isObjectLike(value)) {
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

    return ensureIdentifierCollectionEntry({
        collection: identifierCollections.scripts,
        key: descriptor.id,
        identifierId,
        initializer: () => ({
            id: descriptor.id,
            name: descriptor.name ?? null,
            displayName:
                descriptor.displayName ?? descriptor.name ?? descriptor.id,
            resourcePath: descriptor.resourcePath ?? null,
            declarationKinds: []
        })
    });
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

    const identifierId = buildIdentifierId("script", descriptor?.id ?? "");
    assignIdentifierEntryMetadata(entry, {
        identifierId,
        name: descriptor?.name ?? null,
        displayName: descriptor?.displayName ?? null,
        resourcePath: descriptor?.resourcePath ?? null
    });

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

    const entry = ensureIdentifierCollectionEntry({
        collection: identifierCollections.scripts,
        key: targetScopeId,
        identifierId,
        initializer: () => ({
            id: targetScopeId,
            name: callRecord.target?.name ?? null,
            displayName: callRecord.target?.name
                ? `script.${callRecord.target.name}`
                : targetScopeId,
            resourcePath: callRecord.target?.resourcePath ?? null
        })
    });

    assignIdentifierEntryMetadata(entry, {
        identifierId,
        name: callRecord.target?.name ?? null,
        resourcePath: callRecord.target?.resourcePath ?? null
    });

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
        metrics.counters.increment("scriptCalls.total");
        if (callRecord.isResolved) {
            metrics.counters.increment("scriptCalls.resolved");
        } else {
            metrics.counters.increment("scriptCalls.unresolved");
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

    const validatedRole = assertValidIdentifierRole(role);

    const identifierId = buildIdentifierId("macro", identifierRecord.name);

    const entry = ensureIdentifierCollectionEntry({
        collection: identifierCollections.macros,
        key: identifierRecord.name,
        identifierId,
        initializer: () => ({
            name: identifierRecord.name
        })
    });

    assignIdentifierEntryMetadata(entry, { identifierId });

    recordIdentifierCollectionRole(
        entry,
        identifierRecord,
        filePath,
        validatedRole
    );
}

function registerEnumOccurrence({
    identifierCollections,
    identifierRecord,
    filePath,
    role,
    enumLookup
}) {
    const validatedRole = assertValidIdentifierRole(role);

    const targetLocation =
        validatedRole === IdentifierRole.REFERENCE
            ? identifierRecord?.declaration?.start
            : identifierRecord?.start;

    const enumKey = buildFileLocationKey(filePath, targetLocation);
    if (!enumKey) {
        return;
    }

    const enumInfo = enumLookup?.enumDeclarations?.get(enumKey) ?? null;
    const identifierId = buildIdentifierId("enum", enumKey);
    const entry = ensureIdentifierCollectionEntry({
        collection: identifierCollections.enums,
        key: enumKey,
        identifierId,
        initializer: () => ({
            key: enumKey,
            name: enumInfo?.name ?? identifierRecord?.name ?? null,
            filePath: enumInfo?.filePath ?? filePath ?? null
        })
    });

    const enumName = enumInfo
        ? (enumInfo.name ?? identifierRecord?.name ?? null)
        : null;
    assignIdentifierEntryMetadata(entry, {
        identifierId,
        name: enumName
    });

    recordIdentifierCollectionRole(
        entry,
        identifierRecord,
        filePath,
        validatedRole
    );
}

function registerEnumMemberOccurrence({
    identifierCollections,
    identifierRecord,
    filePath,
    role,
    enumLookup
}) {
    const validatedRole = assertValidIdentifierRole(role);

    const targetLocation =
        validatedRole === IdentifierRole.REFERENCE
            ? identifierRecord?.declaration?.start
            : identifierRecord?.start;

    const memberKey = buildFileLocationKey(filePath, targetLocation);
    if (!memberKey) {
        return;
    }

    const memberInfo = enumLookup?.memberDeclarations?.get(memberKey) ?? null;
    const enumKey = memberInfo?.enumKey ?? null;
    const identifierId = buildIdentifierId("enum-member", memberKey);

    const entry = ensureIdentifierCollectionEntry({
        collection: identifierCollections.enumMembers,
        key: memberKey,
        identifierId,
        initializer: () => ({
            key: memberKey,
            name: memberInfo?.name ?? identifierRecord?.name ?? null,
            enumKey,
            enumName: memberInfo?.enumKey
                ? (enumLookup?.enumDeclarations?.get(memberInfo.enumKey)
                      ?.name ?? null)
                : null,
            filePath: memberInfo?.filePath ?? filePath ?? null
        })
    });

    const enumName = memberInfo?.enumKey
        ? (enumLookup?.enumDeclarations?.get(memberInfo.enumKey)?.name ?? null)
        : null;
    assignIdentifierEntryMetadata(entry, {
        identifierId,
        enumName
    });

    recordIdentifierCollectionRole(
        entry,
        identifierRecord,
        filePath,
        validatedRole
    );
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

    const validatedRole = assertValidIdentifierRole(role);

    const identifierId = buildIdentifierId("global", identifierRecord.name);

    const entry = ensureIdentifierCollectionEntry({
        collection: identifierCollections.globalVariables,
        key: identifierRecord.name,
        identifierId,
        initializer: () => ({
            name: identifierRecord.name
        })
    });

    assignIdentifierEntryMetadata(entry, { identifierId });

    recordIdentifierCollectionRole(
        entry,
        identifierRecord,
        filePath,
        validatedRole
    );
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

    const validatedRole = assertValidIdentifierRole(role);

    const key = `${scopeDescriptor?.id ?? "instance"}:${identifierRecord.name}`;
    const identifierId = buildIdentifierId("instance", key);
    const entry = ensureIdentifierCollectionEntry({
        collection: identifierCollections.instanceVariables,
        key,
        identifierId,
        initializer: () => ({
            key,
            name: identifierRecord.name,
            scopeId: scopeDescriptor?.id ?? null,
            scopeKind: scopeDescriptor?.kind ?? null
        })
    });

    assignIdentifierEntryMetadata(entry, {
        identifierId,
        scopeId: scopeDescriptor?.id ?? null,
        scopeKind: scopeDescriptor?.kind ?? null
    });

    recordIdentifierCollectionRole(
        entry,
        identifierRecord,
        filePath,
        validatedRole
    );
}

function shouldTreatAsInstance({ identifierRecord, role, scopeDescriptor }) {
    if (!identifierRecord) {
        return false;
    }

    const validatedRole = assertValidIdentifierRole(role);

    if (validatedRole !== IdentifierRole.REFERENCE) {
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

    const validatedRole = assertValidIdentifierRole(role);

    const classifications = asArray(identifierRecord?.classifications);

    if (
        validatedRole === IdentifierRole.DECLARATION &&
        classifications.includes("script")
    ) {
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
            role: validatedRole
        });
    }

    if (classifications.includes("enum")) {
        registerEnumOccurrence({
            identifierCollections,
            identifierRecord,
            filePath,
            role: validatedRole,
            enumLookup
        });
    }

    if (classifications.includes("enum-member")) {
        registerEnumMemberOccurrence({
            identifierCollections,
            identifierRecord,
            filePath,
            role: validatedRole,
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
            role: validatedRole
        });
    }

    if (
        shouldTreatAsInstance({
            identifierRecord,
            role: validatedRole,
            scopeDescriptor
        })
    ) {
        registerInstanceOccurrence({
            identifierCollections,
            identifierRecord,
            filePath,
            role: IdentifierRole.REFERENCE,
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
    const entry = ensureIdentifierCollectionEntry({
        collection: identifierCollections.instanceVariables,
        key: identifierKey,
        identifierId,
        initializer: () => ({
            key: identifierKey,
            name: identifierRecord.name,
            scopeId: scopeDescriptor?.id ?? null,
            scopeKind: scopeDescriptor?.kind ?? null
        })
    });

    assignIdentifierEntryMetadata(entry, {
        identifierId,
        scopeId: scopeDescriptor?.id ?? null,
        scopeKind: scopeDescriptor?.kind ?? null
    });

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
    if (!isObjectLike(root)) {
        return;
    }

    const stack = [root];
    const seen = new WeakSet();

    while (stack.length > 0) {
        const node = stack.pop();
        if (!isObjectLike(node)) {
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
                    if (isObjectLike(child)) {
                        stack.push(child);
                    }
                }
            } else if (isObjectLike(value)) {
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

    metrics?.counters?.increment("identifiers.encountered");

    if (isBuiltIn) {
        metrics?.counters?.increment("identifiers.builtInSkipped");
        identifierRecord.reason = "built-in";
        fileRecord.ignoredIdentifiers.push(identifierRecord);
        scopeRecord.ignoredIdentifiers.push(identifierRecord);
        return true;
    }

    const isDeclaration =
        identifierRecord.classifications.includes("declaration");
    const isReference = identifierRecord.classifications.includes("reference");

    if (isDeclaration) {
        metrics?.counters?.increment("identifiers.declarations");
        fileRecord.declarations.push(identifierRecord);
        scopeRecord.declarations.push(identifierRecord);

        registerIdentifierOccurrence({
            identifierCollections,
            identifierRecord,
            filePath: fileRecord?.filePath ?? null,
            role: IdentifierRole.DECLARATION,
            enumLookup,
            scopeDescriptor: scopeDescriptor ?? scopeRecord
        });
    }

    if (isReference) {
        metrics?.counters?.increment("identifiers.references");
        fileRecord.references.push(identifierRecord);
        scopeRecord.references.push(identifierRecord);

        registerIdentifierOccurrence({
            identifierCollections,
            identifierRecord,
            filePath: fileRecord?.filePath ?? null,
            role: IdentifierRole.REFERENCE,
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
            start: cloneLocation(callee?.start),
            end: cloneLocation(callee?.end)
        }
    };

    fileRecord.scriptCalls.push(callRecord);
    scopeRecord.scriptCalls.push(callRecord);
    relationships.scriptCalls.push(callRecord);
    metrics?.counters?.increment("scriptCalls.discovered");
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
    if (
        node?.type !== "NewExpression" ||
        node.expression?.type !== "Identifier"
    ) {
        return;
    }

    const callee = node.expression;
    const calleeName = callee.name;
    if (typeof calleeName !== "string" || builtInNames.has(calleeName)) {
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
    metrics?.counters?.increment("scriptCalls.discovered");
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
        metrics?.counters?.increment("identifiers.instanceAssignments");
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

    const { ensureNotAborted } = createProjectIndexAbortGuard(options);

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

/**
 * Process a single GML source file while keeping the high-level project index
 * coordinator focused on orchestration. Handles filesystem access, metrics,
 * record preparation, and AST analysis for the provided file.
 */
async function readProjectGmlFile({ file, fsFacade, metrics }) {
    try {
        const contents = await metrics.timers.timeAsync("fs.readGml", () =>
            fsFacade.readFile(file.absolutePath, "utf8")
        );
        metrics.counters.increment("io.gmlBytes", Buffer.byteLength(contents));
        return contents;
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            metrics.counters.increment("files.missingDuringRead");
            return null;
        }
        throw error;
    }
}

function registerFilePathWithScope(scopeRecord, filePath) {
    if (!scopeRecord?.filePaths) {
        return;
    }

    pushUnique(scopeRecord.filePaths, filePath);
}

function prepareProjectIndexRecords({
    file,
    resourceAnalysis,
    scopeMap,
    filesMap,
    identifierCollections
}) {
    const scopeDescriptor =
        resourceAnalysis.gmlScopeMap.get(file.relativePath) ??
        createFileScopeDescriptor(file.relativePath);
    const scopeRecord = ensureScopeRecord(scopeMap, scopeDescriptor);
    registerFilePathWithScope(scopeRecord, file.relativePath);
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

    return { scopeDescriptor, scopeRecord, fileRecord };
}

function parseProjectGmlSource({
    contents,
    file,
    parseProjectSource,
    metrics,
    projectRoot
}) {
    return metrics.timers.timeSync("gml.parse", () =>
        parseProjectSource(contents, {
            filePath: file.relativePath,
            projectRoot
        })
    );
}

function analyseProjectGmlAst({
    ast,
    builtInNames,
    scopeRecord,
    fileRecord,
    relationships,
    resourceAnalysis,
    identifierCollections,
    scopeDescriptor,
    metrics,
    sourceContents,
    lineOffsets
}) {
    metrics.timers.timeSync("gml.analyse", () =>
        analyseGmlAst({
            ast,
            builtInNames,
            scopeRecord,
            fileRecord,
            relationships,
            scriptNameToScopeId: resourceAnalysis.scriptNameToScopeId,
            scriptNameToResourcePath: resourceAnalysis.scriptNameToResourcePath,
            identifierCollections,
            scopeDescriptor,
            metrics,
            sourceContents,
            lineOffsets
        })
    );
}

async function processProjectGmlFile({
    file,
    fsFacade,
    metrics,
    ensureNotAborted,
    parseProjectSource,
    resourceAnalysis,
    scopeMap,
    filesMap,
    identifierCollections,
    relationships,
    builtInNames,
    projectRoot
}) {
    ensureNotAborted();
    metrics.counters.increment("files.gmlProcessed");

    const contents = await readProjectGmlFile({ file, fsFacade, metrics });
    if (contents === null) {
        return;
    }

    ensureNotAborted();

    const lineOffsets = computeLineOffsets(contents);
    const { scopeDescriptor, scopeRecord, fileRecord } =
        prepareProjectIndexRecords({
            file,
            resourceAnalysis,
            scopeMap,
            filesMap,
            identifierCollections
        });

    const ast = parseProjectGmlSource({
        contents,
        file,
        parseProjectSource,
        metrics,
        projectRoot
    });

    analyseProjectGmlAst({
        ast,
        builtInNames,
        scopeRecord,
        fileRecord,
        relationships,
        resourceAnalysis,
        identifierCollections,
        scopeDescriptor,
        metrics,
        sourceContents: contents,
        lineOffsets
    });
}

/**
 * Centralize the mutable collections used while aggregating project index
 * details. Keeping the map initialisation and relationship bookkeeping here
 * lets the main build flow focus on orchestration rather than data structure
 * wiring.
 */
function createProjectIndexAggregationState(resourceAnalysis) {
    const scopeMap = new Map();
    const filesMap = new Map();
    const relationships = {
        scriptCalls: [],
        assetReferences: resourceAnalysis.assetReferences.map((reference) =>
            cloneAssetReference(reference)
        )
    };
    const identifierCollections = createIdentifierCollections();

    return {
        scopeMap,
        filesMap,
        relationships,
        identifierCollections
    };
}

/**
 * Derive the final serializable project index payload from the populated
 * aggregation state. The snapshot clones individual entry collections so the
 * returned object mirrors the shape produced by the historical inline
 * implementation without leaking mutable internals.
 */
function createProjectIndexResultSnapshot({
    projectRoot,
    resourceAnalysis,
    scopeMap,
    filesMap,
    identifierCollections,
    relationships
}) {
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

    return {
        projectRoot,
        resources,
        scopes,
        files,
        relationships,
        identifiers
    };
}

async function loadBuiltInNamesForProjectIndex({
    fsFacade,
    metrics,
    signal,
    ensureNotAborted
}) {
    const builtInIdentifiers = await metrics.timers.timeAsync(
        "loadBuiltIns",
        () =>
            loadBuiltInIdentifiers(fsFacade, metrics, {
                signal,
                fallbackMessage: PROJECT_INDEX_BUILD_ABORT_MESSAGE
            })
    );
    ensureNotAborted();

    return builtInIdentifiers.names ?? new Set();
}

async function discoverProjectFilesForIndex({
    projectRoot,
    fsFacade,
    metrics,
    signal,
    ensureNotAborted
}) {
    const projectFiles = await metrics.timers.timeAsync("scanProjectTree", () =>
        scanProjectTree(projectRoot, fsFacade, metrics, { signal })
    );
    ensureNotAborted();

    metrics.reporting.setMetadata("yyFileCount", projectFiles.yyFiles.length);
    metrics.reporting.setMetadata("gmlFileCount", projectFiles.gmlFiles.length);

    return projectFiles;
}

async function analyseProjectResourcesForIndex({
    projectRoot,
    yyFiles,
    fsFacade,
    metrics,
    signal,
    ensureNotAborted
}) {
    const resourceAnalysis = await metrics.timers.timeAsync(
        "analyseResourceFiles",
        () =>
            analyseResourceFiles({
                projectRoot,
                yyFiles,
                fsFacade,
                signal
            })
    );
    ensureNotAborted();

    metrics.counters.increment(
        "resources.total",
        resourceAnalysis.resourcesMap.size
    );

    return resourceAnalysis;
}

function configureGmlProcessing({ options, metrics }) {
    const concurrencySettings = options?.concurrency ?? {};
    const gmlConcurrency = clampConcurrency(
        concurrencySettings.gml ?? concurrencySettings.gmlParsing
    );
    metrics.reporting.setMetadata("gmlParseConcurrency", gmlConcurrency);

    const parseProjectSource = resolveProjectIndexParser(options);

    return { gmlConcurrency, parseProjectSource };
}

async function processProjectGmlFilesForIndex({
    gmlFiles,
    gmlConcurrency,
    parseProjectSource,
    fsFacade,
    metrics,
    ensureNotAborted,
    resourceAnalysis,
    scopeMap,
    filesMap,
    identifierCollections,
    relationships,
    builtInNames,
    projectRoot,
    signal
}) {
    await processWithConcurrency(
        gmlFiles,
        gmlConcurrency,
        async (file) =>
            processProjectGmlFile({
                file,
                fsFacade,
                metrics,
                ensureNotAborted,
                parseProjectSource,
                resourceAnalysis,
                scopeMap,
                filesMap,
                identifierCollections,
                relationships,
                builtInNames,
                projectRoot
            }),
        { signal }
    );

    ensureNotAborted();
}

function finalizeProjectIndexResult({ metrics, options, projectIndex }) {
    const metricsReport = finalizeProjectIndexMetrics(metrics);
    if (metricsReport) {
        projectIndex.metrics = metricsReport;
        options?.onMetrics?.(metricsReport, projectIndex);
    }

    return projectIndex;
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

    const stopTotal = metrics.timers.startTimer("total");

    const { signal, ensureNotAborted } = createProjectIndexAbortGuard(options);

    const builtInNames = await loadBuiltInNamesForProjectIndex({
        fsFacade,
        metrics,
        signal,
        ensureNotAborted
    });

    const { yyFiles, gmlFiles } = await discoverProjectFilesForIndex({
        projectRoot: resolvedRoot,
        fsFacade,
        metrics,
        signal,
        ensureNotAborted
    });

    const resourceAnalysis = await analyseProjectResourcesForIndex({
        projectRoot: resolvedRoot,
        yyFiles,
        fsFacade,
        metrics,
        signal,
        ensureNotAborted
    });

    const { scopeMap, filesMap, relationships, identifierCollections } =
        createProjectIndexAggregationState(resourceAnalysis);

    const { gmlConcurrency, parseProjectSource } = configureGmlProcessing({
        options,
        metrics
    });

    await processProjectGmlFilesForIndex({
        gmlFiles,
        gmlConcurrency,
        parseProjectSource,
        fsFacade,
        metrics,
        ensureNotAborted,
        resourceAnalysis,
        scopeMap,
        filesMap,
        identifierCollections,
        relationships,
        builtInNames,
        projectRoot: resolvedRoot,
        signal
    });

    recordScriptCallMetricsAndReferences({
        relationships,
        metrics,
        identifierCollections
    });

    const projectIndexPayload = createProjectIndexResultSnapshot({
        projectRoot: resolvedRoot,
        resourceAnalysis,
        scopeMap,
        filesMap,
        identifierCollections,
        relationships
    });

    stopTotal();
    const projectIndex = projectIndexPayload;

    return finalizeProjectIndexResult({
        metrics,
        options,
        projectIndex
    });
}
export { defaultFsFacade } from "./fs-facade.js";

export {
    ProjectFileCategory,
    getProjectIndexSourceExtensions,
    resetProjectIndexSourceExtensions,
    setProjectIndexSourceExtensions,
    normalizeProjectFileCategory,
    resolveProjectFileCategory
} from "./project-file-categories.js";
export { __loadBuiltInIdentifiersForTests } from "./built-in-identifiers.js";
export { getProjectIndexParserOverride } from "./parser-override.js";
