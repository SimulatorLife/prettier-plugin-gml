import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import GMLParser from "../../parser/gml-parser.js";
import { cloneLocation } from "../ast-locations.js";
import { toPosixPath } from "../path-utils.js";
import { createMetricsTracker } from "../metrics.js";
import { buildLocationKey, buildFileLocationKey } from "../location-keys.js";

export const PROJECT_MANIFEST_EXTENSION = ".yyp";

const defaultFsFacade = {
    async readDir(targetPath) {
        return fs.readdir(targetPath);
    },
    async stat(targetPath) {
        return fs.stat(targetPath);
    },
    async readFile(targetPath, encoding = "utf8") {
        return fs.readFile(targetPath, encoding);
    },
    async writeFile(targetPath, contents, encoding = "utf8") {
        return fs.writeFile(targetPath, contents, encoding);
    },
    async rename(fromPath, toPath) {
        return fs.rename(fromPath, toPath);
    },
    async mkdir(targetPath, options = { recursive: true }) {
        return fs.mkdir(targetPath, options);
    },
    async unlink(targetPath) {
        return fs.unlink(targetPath);
    }
};

export function getDefaultFsFacade() {
    return defaultFsFacade;
}

export const PROJECT_INDEX_CACHE_SCHEMA_VERSION = 1;
export const PROJECT_INDEX_CACHE_DIRECTORY = ".prettier-plugin-gml";
export const PROJECT_INDEX_CACHE_FILENAME = "project-index-cache.json";
export const DEFAULT_MAX_PROJECT_INDEX_CACHE_SIZE = 8 * 1024 * 1024; // 8 MiB

export const ProjectIndexCacheMissReason = Object.freeze({
    NOT_FOUND: "not-found",
    INVALID_JSON: "invalid-json",
    INVALID_SCHEMA: "invalid-schema",
    PROJECT_ROOT_MISMATCH: "project-root-mismatch",
    FORMATTER_VERSION_MISMATCH: "formatter-version-mismatch",
    PLUGIN_VERSION_MISMATCH: "plugin-version-mismatch",
    MANIFEST_MTIME_MISMATCH: "manifest-mtime-mismatch",
    SOURCE_MTIME_MISMATCH: "source-mtime-mismatch"
});

function resolveCacheFilePath(projectRoot, cacheFilePath) {
    if (cacheFilePath) {
        return path.resolve(cacheFilePath);
    }
    return path.join(
        projectRoot,
        PROJECT_INDEX_CACHE_DIRECTORY,
        PROJECT_INDEX_CACHE_FILENAME
    );
}

function cloneMtimeMap(source) {
    if (!source || typeof source !== "object") {
        return {};
    }
    const result = {};
    for (const [key, value] of Object.entries(source)) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            result[key] = numeric;
        }
    }
    return result;
}

function areMtimeMapsEqual(expected = {}, actual = {}) {
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    if (expectedKeys.length !== actualKeys.length) {
        return false;
    }
    for (let i = 0; i < expectedKeys.length; i += 1) {
        if (expectedKeys[i] !== actualKeys[i]) {
            return false;
        }
        if (expected[expectedKeys[i]] !== actual[actualKeys[i]]) {
            return false;
        }
    }
    return true;
}

function validateCachePayload(payload) {
    if (!payload || typeof payload !== "object") {
        return false;
    }

    if (payload.schemaVersion !== PROJECT_INDEX_CACHE_SCHEMA_VERSION) {
        return false;
    }

    if (
        typeof payload.projectRoot !== "string" ||
        payload.projectRoot.length === 0
    ) {
        return false;
    }

    if (typeof payload.formatterVersion !== "string") {
        return false;
    }

    if (typeof payload.pluginVersion !== "string") {
        return false;
    }

    if (!payload.manifestMtimes || typeof payload.manifestMtimes !== "object") {
        return false;
    }

    if (!payload.sourceMtimes || typeof payload.sourceMtimes !== "object") {
        return false;
    }

    if (
        payload.metricsSummary != null &&
        typeof payload.metricsSummary !== "object"
    ) {
        return false;
    }

    if (!payload.projectIndex || typeof payload.projectIndex !== "object") {
        return false;
    }

    return true;
}

function isManifestEntry(entry) {
    return (
        typeof entry === "string" &&
        entry.toLowerCase().endsWith(PROJECT_MANIFEST_EXTENSION)
    );
}

async function listDirectory(fsFacade, directoryPath) {
    try {
        return await fsFacade.readDir(directoryPath);
    } catch (error) {
        if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
            return [];
        }
        throw error;
    }
}

async function getFileMtime(fsFacade, filePath) {
    try {
        const stats = await fsFacade.stat(filePath);
        return typeof stats.mtimeMs === "number" ? stats.mtimeMs : null;
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return null;
        }
        throw error;
    }
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

export async function deriveCacheKey(
    { filepath, projectRoot, formatterVersion = "dev" },
    fsFacade = defaultFsFacade
) {
    const hash = createHash("sha256");
    hash.update(String(formatterVersion));
    hash.update("\0");

    const resolvedRoot = projectRoot ? path.resolve(projectRoot) : "";
    hash.update(resolvedRoot);
    hash.update("\0");

    if (resolvedRoot) {
        const entries = await listDirectory(fsFacade, resolvedRoot);
        const manifestNames = entries
            .filter(isManifestEntry)
            .sort((a, b) => a.localeCompare(b));

        for (const manifestName of manifestNames) {
            const manifestPath = path.join(resolvedRoot, manifestName);
            const mtime = await getFileMtime(fsFacade, manifestPath);
            if (mtime !== null) {
                hash.update(manifestName);
                hash.update("\0");
                hash.update(String(mtime));
                hash.update("\0");
            }
        }
    }

    if (filepath) {
        const resolvedFile = path.resolve(filepath);
        const mtime = await getFileMtime(fsFacade, resolvedFile);
        if (mtime !== null) {
            hash.update(
                path.relative(
                    resolvedRoot || path.parse(resolvedFile).root,
                    resolvedFile
                )
            );
            hash.update("\0");
            hash.update(String(mtime));
            hash.update("\0");
        }
    }

    return hash.digest("hex");
}

export async function loadProjectIndexCache(
    descriptor,
    fsFacade = defaultFsFacade
) {
    const {
        projectRoot,
        cacheFilePath: explicitPath,
        formatterVersion,
        pluginVersion,
        manifestMtimes = {},
        sourceMtimes = {}
    } = descriptor ?? {};

    if (!projectRoot) {
        throw new Error(
            "projectRoot must be provided to loadProjectIndexCache"
        );
    }

    const resolvedRoot = path.resolve(projectRoot);
    const cacheFilePath = resolveCacheFilePath(resolvedRoot, explicitPath);

    let rawContents;
    try {
        rawContents = await fsFacade.readFile(cacheFilePath, "utf8");
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return {
                status: "miss",
                cacheFilePath,
                reason: { type: ProjectIndexCacheMissReason.NOT_FOUND }
            };
        }
        throw error;
    }

    let parsed;
    try {
        parsed = JSON.parse(rawContents);
    } catch (error) {
        return {
            status: "miss",
            cacheFilePath,
            reason: {
                type: ProjectIndexCacheMissReason.INVALID_JSON,
                error
            }
        };
    }

    if (!validateCachePayload(parsed)) {
        return {
            status: "miss",
            cacheFilePath,
            reason: { type: ProjectIndexCacheMissReason.INVALID_SCHEMA }
        };
    }

    if (path.resolve(parsed.projectRoot) !== resolvedRoot) {
        return {
            status: "miss",
            cacheFilePath,
            reason: { type: ProjectIndexCacheMissReason.PROJECT_ROOT_MISMATCH }
        };
    }

    if (
        formatterVersion &&
        parsed.formatterVersion !== String(formatterVersion)
    ) {
        return {
            status: "miss",
            cacheFilePath,
            reason: {
                type: ProjectIndexCacheMissReason.FORMATTER_VERSION_MISMATCH
            }
        };
    }

    if (pluginVersion && parsed.pluginVersion !== String(pluginVersion)) {
        return {
            status: "miss",
            cacheFilePath,
            reason: {
                type: ProjectIndexCacheMissReason.PLUGIN_VERSION_MISMATCH
            }
        };
    }

    const hasManifestExpectations =
        manifestMtimes && Object.keys(manifestMtimes).length > 0;
    if (
        hasManifestExpectations &&
        !areMtimeMapsEqual(manifestMtimes, parsed.manifestMtimes)
    ) {
        return {
            status: "miss",
            cacheFilePath,
            reason: {
                type: ProjectIndexCacheMissReason.MANIFEST_MTIME_MISMATCH
            }
        };
    }

    const hasSourceExpectations =
        sourceMtimes && Object.keys(sourceMtimes).length > 0;
    if (
        hasSourceExpectations &&
        !areMtimeMapsEqual(sourceMtimes, parsed.sourceMtimes)
    ) {
        return {
            status: "miss",
            cacheFilePath,
            reason: {
                type: ProjectIndexCacheMissReason.SOURCE_MTIME_MISMATCH
            }
        };
    }

    const projectIndex = {
        ...parsed.projectIndex
    };
    if (parsed.metricsSummary != null) {
        projectIndex.metrics = parsed.metricsSummary;
    }

    return {
        status: "hit",
        cacheFilePath,
        payload: parsed,
        projectIndex
    };
}

export async function saveProjectIndexCache(
    descriptor,
    fsFacade = defaultFsFacade
) {
    const {
        projectRoot,
        cacheFilePath: explicitPath,
        formatterVersion,
        pluginVersion,
        manifestMtimes = {},
        sourceMtimes = {},
        projectIndex,
        metricsSummary,
        maxSizeBytes = DEFAULT_MAX_PROJECT_INDEX_CACHE_SIZE
    } = descriptor ?? {};

    if (!projectRoot) {
        throw new Error(
            "projectRoot must be provided to saveProjectIndexCache"
        );
    }
    if (!projectIndex || typeof projectIndex !== "object") {
        throw new Error(
            "projectIndex must be provided to saveProjectIndexCache"
        );
    }

    const resolvedRoot = path.resolve(projectRoot);
    const cacheFilePath = resolveCacheFilePath(resolvedRoot, explicitPath);
    const cacheDir = path.dirname(cacheFilePath);

    await fsFacade.mkdir(cacheDir, { recursive: true });

    const sanitizedProjectIndex = { ...projectIndex };
    const summary = metricsSummary ?? sanitizedProjectIndex.metrics ?? null;
    if (sanitizedProjectIndex.metrics) {
        delete sanitizedProjectIndex.metrics;
    }

    const payload = {
        schemaVersion: PROJECT_INDEX_CACHE_SCHEMA_VERSION,
        projectRoot: resolvedRoot,
        formatterVersion: formatterVersion ? String(formatterVersion) : "",
        pluginVersion: pluginVersion ? String(pluginVersion) : "",
        manifestMtimes: cloneMtimeMap(manifestMtimes),
        sourceMtimes: cloneMtimeMap(sourceMtimes),
        metricsSummary: summary,
        projectIndex: sanitizedProjectIndex
    };

    const serialized = JSON.stringify(payload);
    const byteLength = Buffer.byteLength(serialized, "utf8");

    if (maxSizeBytes != null && byteLength > maxSizeBytes) {
        return {
            status: "skipped",
            cacheFilePath,
            reason: "payload-too-large",
            size: byteLength
        };
    }

    const uniqueSuffix = `${process.pid}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;
    const tempFilePath = `${cacheFilePath}.${uniqueSuffix}.tmp`;

    try {
        await fsFacade.writeFile(tempFilePath, serialized, "utf8");
        await fsFacade.rename(tempFilePath, cacheFilePath);
    } catch (error) {
        try {
            await fsFacade.unlink(tempFilePath);
        } catch {
            // Ignore cleanup failures.
        }
        throw error;
    }

    return {
        status: "written",
        cacheFilePath,
        size: byteLength
    };
}

export function createProjectIndexCoordinator(options = {}) {
    const {
        fsFacade = defaultFsFacade,
        loadCache = loadProjectIndexCache,
        saveCache = saveProjectIndexCache,
        buildIndex = buildProjectIndex
    } = options;

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

            const saveResult = await saveCache(
                {
                    ...descriptor,
                    projectRoot: resolvedRoot,
                    projectIndex,
                    metricsSummary: projectIndex.metrics
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

const GML_IDENTIFIER_FILE_PATH = fileURLToPath(
    new URL("../../../resources/gml-identifiers.json", import.meta.url)
);

let cachedBuiltInIdentifiers = null;

const hasOwnProperty = Object.prototype.hasOwnProperty;

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

function toProjectRelativePath(projectRoot, absolutePath) {
    const relative = path.relative(projectRoot, absolutePath);
    return toPosixPath(relative);
}

function normaliseResourcePath(rawPath, { projectRoot } = {}) {
    if (typeof rawPath !== "string" || rawPath.length === 0) {
        return null;
    }

    const normalised = toPosixPath(rawPath).replace(/^\.\//, "");
    if (!projectRoot) {
        return normalised;
    }

    const absoluteCandidate = path.isAbsolute(normalised)
        ? normalised
        : path.join(projectRoot, normalised);
    return toProjectRelativePath(projectRoot, absoluteCandidate);
}

async function scanProjectTree(projectRoot, fsFacade, metrics = null) {
    const yyFiles = [];
    const gmlFiles = [];
    const pending = ["."];

    while (pending.length > 0) {
        const relativeDir = pending.pop();
        const absoluteDir = path.join(projectRoot, relativeDir);
        const entries = await listDirectory(fsFacade, absoluteDir);
        metrics?.incrementCounter("io.directoriesScanned");

        for (const entry of entries) {
            const relativePath = path.join(relativeDir, entry);
            const absolutePath = path.join(projectRoot, relativePath);
            let stats;
            try {
                stats = await fsFacade.stat(absolutePath);
            } catch (error) {
                if (error && error.code === "ENOENT") {
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
            if (lowerPath.endsWith(".yy") || lowerPath.endsWith(".yyp")) {
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

function ensureResourceRecord(resourcesMap, resourcePath, resourceData = {}) {
    let record = resourcesMap.get(resourcePath);
    if (!record) {
        const lowerPath = resourcePath.toLowerCase();
        let defaultName = path.posix.basename(resourcePath);
        if (lowerPath.endsWith(".yy")) {
            defaultName = path.posix.basename(resourcePath, ".yy");
        } else if (lowerPath.endsWith(".yyp")) {
            defaultName = path.posix.basename(resourcePath, ".yyp");
        }
        record = {
            path: resourcePath,
            name: resourceData.name ?? defaultName,
            resourceType: resourceData.resourceType ?? "unknown",
            scopes: [],
            gmlFiles: [],
            assetReferences: []
        };
        resourcesMap.set(resourcePath, record);
    } else {
        if (resourceData.name && record.name !== resourceData.name) {
            record.name = resourceData.name;
        }
        if (
            resourceData.resourceType &&
            record.resourceType !== resourceData.resourceType
        ) {
            record.resourceType = resourceData.resourceType;
        }
    }

    return record;
}

function pushUnique(array, value) {
    if (!array.includes(value)) {
        array.push(value);
    }
}

function deriveScopeId(kind, parts) {
    const suffix = Array.isArray(parts)
        ? parts.join("::")
        : String(parts ?? "");
    return `scope:${kind}:${suffix}`;
}

function createScriptScopeDescriptor(resourceRecord, gmlRelativePath) {
    const scopeId = deriveScopeId("script", [resourceRecord.name]);
    return {
        id: scopeId,
        kind: "script",
        name: resourceRecord.name,
        displayName: `script.${resourceRecord.name}`,
        resourcePath: resourceRecord.path,
        gmlFile: gmlRelativePath
    };
}

function deriveEventDisplayName(event) {
    if (event && typeof event.name === "string" && event.name.trim()) {
        return event.name;
    }

    const eventType =
        typeof event?.eventType === "number"
            ? event.eventType
            : typeof event?.eventtype === "number"
                ? event.eventtype
                : null;
    const eventNum =
        typeof event?.eventNum === "number"
            ? event.eventNum
            : typeof event?.enumb === "number"
                ? event.enumb
                : null;

    if (eventType == null && eventNum == null) {
        return "event";
    }

    if (eventNum == null) {
        return String(eventType);
    }

    return `${eventType}_${eventNum}`;
}

function createObjectEventScopeDescriptor(
    resourceRecord,
    event,
    gmlRelativePath
) {
    const displayName = deriveEventDisplayName(event);
    const scopeId = deriveScopeId("object", [resourceRecord.name, displayName]);
    return {
        id: scopeId,
        kind: "objectEvent",
        name: `${resourceRecord.name}.${displayName}`,
        displayName: `object.${resourceRecord.name}.${displayName}`,
        resourcePath: resourceRecord.path,
        gmlFile: gmlRelativePath,
        event: {
            name: displayName,
            eventType:
                typeof event?.eventType === "number"
                    ? event.eventType
                    : typeof event?.eventtype === "number"
                        ? event.eventtype
                        : null,
            eventNum:
                typeof event?.eventNum === "number"
                    ? event.eventNum
                    : typeof event?.enumb === "number"
                        ? event.enumb
                        : null
        }
    };
}

function createFileScopeDescriptor(relativePath) {
    const fileBaseName = path.posix.basename(
        relativePath,
        path.extname(relativePath)
    );
    const scopeId = deriveScopeId("file", [relativePath]);
    return {
        id: scopeId,
        kind: "file",
        name: fileBaseName,
        displayName: `file.${relativePath}`,
        resourcePath: null,
        gmlFile: relativePath
    };
}

function extractEventGmlPath(event, resourceRecord, resourceRelativeDir) {
    if (!event) {
        return null;
    }

    const candidatePaths = [];
    if (typeof event.eventContents === "string") {
        candidatePaths.push(event.eventContents);
    }
    if (typeof event.event === "string") {
        candidatePaths.push(event.event);
    }
    if (event.event && typeof event.event.path === "string") {
        candidatePaths.push(event.event.path);
    }
    if (event.eventId && typeof event.eventId.path === "string") {
        candidatePaths.push(event.eventId.path);
    }
    if (event.code && typeof event.code === "string") {
        candidatePaths.push(event.code);
    }

    for (const candidate of candidatePaths) {
        const normalised = normaliseResourcePath(candidate);
        if (normalised) {
            return normalised;
        }
    }

    if (!resourceRecord?.name) {
        return null;
    }

    const displayName = deriveEventDisplayName(event);
    const guessed = path.posix.join(
        resourceRelativeDir,
        `${resourceRecord.name}_${displayName}.gml`
    );
    return guessed;
}

function collectAssetReferences(json, callback, pathStack = []) {
    if (Array.isArray(json)) {
        json.forEach((entry, index) => {
            collectAssetReferences(
                entry,
                callback,
                pathStack.concat(String(index))
            );
        });
        return;
    }

    if (!json || typeof json !== "object") {
        return;
    }

    if (typeof json.path === "string") {
        const propertyPath = pathStack.join(".");
        callback({
            propertyPath,
            targetPath: json.path,
            targetName: typeof json.name === "string" ? json.name : null
        });
    }

    for (const key of Object.keys(json)) {
        collectAssetReferences(json[key], callback, pathStack.concat(key));
    }
}

async function analyseResourceFiles({ projectRoot, yyFiles, fsFacade }) {
    const resourcesMap = new Map();
    const gmlScopeMap = new Map();
    const assetReferences = [];
    const scriptNameToScopeId = new Map();
    const scriptNameToResourcePath = new Map();

    for (const file of yyFiles) {
        let rawContents;
        try {
            rawContents = await fsFacade.readFile(file.absolutePath, "utf8");
        } catch (error) {
            if (error && error.code === "ENOENT") {
                continue;
            }
            throw error;
        }

        let parsed;
        try {
            parsed = JSON.parse(rawContents);
        } catch {
            // Skip invalid JSON entries but continue scanning.
            continue;
        }

        const resourceRecord = ensureResourceRecord(
            resourcesMap,
            file.relativePath,
            {
                name: parsed?.name,
                resourceType: parsed?.resourceType
            }
        );

        const resourceDir = path.posix.dirname(file.relativePath);

        if (parsed?.resourceType === "GMScript") {
            const gmlRelativePath = path.posix.join(
                resourceDir,
                `${resourceRecord.name}.gml`
            );
            pushUnique(resourceRecord.gmlFiles, gmlRelativePath);

            const descriptor = createScriptScopeDescriptor(
                resourceRecord,
                gmlRelativePath
            );
            gmlScopeMap.set(gmlRelativePath, descriptor);
            pushUnique(resourceRecord.scopes, descriptor.id);

            scriptNameToScopeId.set(resourceRecord.name, descriptor.id);
            scriptNameToResourcePath.set(
                resourceRecord.name,
                resourceRecord.path
            );
        }

        if (Array.isArray(parsed?.eventList) && parsed.eventList.length > 0) {
            for (const event of parsed.eventList) {
                const eventGmlPath = extractEventGmlPath(
                    event,
                    resourceRecord,
                    resourceDir
                );
                if (!eventGmlPath) {
                    continue;
                }

                pushUnique(resourceRecord.gmlFiles, eventGmlPath);
                const descriptor = createObjectEventScopeDescriptor(
                    resourceRecord,
                    event,
                    eventGmlPath
                );

                gmlScopeMap.set(eventGmlPath, descriptor);
                pushUnique(resourceRecord.scopes, descriptor.id);
            }
        }

        collectAssetReferences(
            parsed,
            ({ propertyPath, targetPath, targetName }) => {
                const normalisedTarget = normaliseResourcePath(targetPath, {
                    projectRoot
                });
                if (!normalisedTarget) {
                    return;
                }

                const referenceRecord = {
                    fromResourcePath: file.relativePath,
                    fromResourceName: resourceRecord.name,
                    propertyPath,
                    targetPath: normalisedTarget,
                    targetName: targetName ?? null,
                    targetResourceType: null
                };
                assetReferences.push(referenceRecord);
                resourceRecord.assetReferences.push(referenceRecord);
            }
        );
    }

    for (const reference of assetReferences) {
        const targetResource = resourcesMap.get(reference.targetPath);
        if (targetResource) {
            reference.targetResourceType = targetResource.resourceType;
            if (!reference.targetName && targetResource.name) {
                reference.targetName = targetResource.name;
            }
        }
    }

    return {
        resourcesMap,
        gmlScopeMap,
        assetReferences,
        scriptNameToScopeId,
        scriptNameToResourcePath
    };
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
            references: []
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
    const locationKey = buildLocationKey(clone.start);
    const hasExisting = entry.declarations.some((existing) => {
        const existingKey = buildLocationKey(existing.start);
        return existingKey && locationKey && existingKey === locationKey;
    });

    if (!hasExisting) {
        entry.declarations.push(clone);
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
    return Object.fromEntries(
        Array.from(map.entries()).map(([key, value]) => [
            key,
            transform(value)
        ])
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
            if (!hasOwnProperty.call(node, key)) {
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
    metrics = null
}) {
    const enumLookup = createEnumLookup(ast, fileRecord?.filePath ?? null);

    traverseAst(ast, (node) => {
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

function clampConcurrency(value, { min = 1, max = 16, fallback = 4 } = {}) {
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

    const size = Math.max(1, Math.min(limit, items.length));
    let index = 0;

    async function run() {
        while (true) {
            const currentIndex = index;
            if (currentIndex >= items.length) {
                return;
            }
            index += 1;

            await worker(items[currentIndex], currentIndex);
        }
    }

    const tasks = [];
    for (let i = 0; i < size; i += 1) {
        tasks.push(run());
    }
    await Promise.all(tasks);
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
    const metrics =
        options?.metrics ??
        createMetricsTracker({
            category: "project-index",
            logger,
            autoLog: options?.logMetrics === true
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
        concurrencySettings.gml ?? concurrencySettings.gmlParsing ?? 4,
        { fallback: 4 }
    );
    metrics.setMetadata("gmlParseConcurrency", gmlConcurrency);

    await processWithConcurrency(gmlFiles, gmlConcurrency, async (file) => {
        metrics.incrementCounter("files.gmlProcessed");
        let contents;
        try {
            contents = await metrics.timeAsync("fs.readGml", () =>
                fsFacade.readFile(file.absolutePath, "utf8")
            );
        } catch (error) {
            if (error && error.code === "ENOENT") {
                metrics.incrementCounter("files.missingDuringRead");
                return;
            }
            throw error;
        }

        metrics.incrementCounter("io.gmlBytes", Buffer.byteLength(contents));

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
            GMLParser.parse(contents, {
                getComments: false,
                getLocations: true,
                simplifyLocations: false,
                getIdentifierMetadata: true
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
                metrics
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
        Array.from(resourceAnalysis.resourcesMap.entries()).map(
            ([resourcePath, record]) => [
                resourcePath,
                {
                    path: record.path,
                    name: record.name,
                    resourceType: record.resourceType,
                    scopes: record.scopes.slice(),
                    gmlFiles: record.gmlFiles.slice(),
                    assetReferences: record.assetReferences.map((reference) =>
                        cloneAssetReference(reference)
                    )
                }
            ]
        )
    );

    const scopes = Object.fromEntries(
        Array.from(scopeMap.entries()).map(([scopeId, record]) => [
            scopeId,
            {
                id: record.id,
                kind: record.kind,
                name: record.name,
                displayName: record.displayName,
                resourcePath: record.resourcePath,
                event: record.event ? { ...record.event } : null,
                filePaths: record.filePaths.slice(),
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
        Array.from(filesMap.entries()).map(([filePath, record]) => [
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

    const metricsReport = metrics.finalize();
    projectIndex.metrics = metricsReport;
    if (typeof options?.onMetrics === "function") {
        options.onMetrics(metricsReport, projectIndex);
    }

    return projectIndex;
}
