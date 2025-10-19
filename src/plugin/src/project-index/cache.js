import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import { parseJsonWithContext } from "../../../shared/json-utils.js";
import { throwIfAborted } from "../../../shared/abort-utils.js";
import { PROJECT_MANIFEST_EXTENSION, isProjectManifestPath } from "./constants.js";
import { defaultFsFacade } from "./fs-facade.js";
import { isFsErrorCode, listDirectory, getFileMtime } from "./fs-utils.js";

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

function createCacheMiss(cacheFilePath, type, details) {
    return {
        status: "miss",
        cacheFilePath,
        reason: {
            type,
            ...details
        }
    };
}

function hasEntries(record) {
    return (
        record != null &&
        typeof record === "object" &&
        Object.keys(record).length > 0
    );
}

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

function normalizeMaxSizeBytes(maxSizeBytes) {
    if (maxSizeBytes == null) {
        return null;
    }

    const numericLimit = Number(maxSizeBytes);
    if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
        return null;
    }

    return numericLimit;
}

function cloneMtimeMap(source) {
    if (!source || typeof source !== "object") {
        return {};
    }
    return Object.fromEntries(
        Object.entries(source)
            .map(([key, value]) => [key, Number(value)])
            .filter(([, numeric]) => Number.isFinite(numeric))
    );
}

function areNumbersApproximatelyEqual(a, b) {
    if (a === b) {
        return true;
    }

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return false;
    }

    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    const tolerance = Number.EPSILON * scale * 4;
    return Math.abs(a - b) <= tolerance;
}

function areMtimeMapsEqual(expected = {}, actual = {}) {
    if (expected === actual) {
        return true;
    }

    if (typeof expected !== "object" || expected === null) {
        return false;
    }

    if (typeof actual !== "object" || actual === null) {
        return false;
    }

    const expectedEntries = Object.entries(expected);
    const actualKeys = Object.keys(actual);

    if (expectedEntries.length !== actualKeys.length) {
        return false;
    }

    return expectedEntries.every(([key, value]) => {
        const actualValue = actual[key];

        if (typeof value === "number" && typeof actualValue === "number") {
            return areNumbersApproximatelyEqual(value, actualValue);
        }

        return actualValue === value;
    });
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
        payload.metricsSummary != undefined &&
        typeof payload.metricsSummary !== "object"
    ) {
        return false;
    }

    if (!payload.projectIndex || typeof payload.projectIndex !== "object") {
        return false;
    }

    return true;
}

export async function loadProjectIndexCache(
    descriptor,
    fsFacade = defaultFsFacade,
    options = {}
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

    const signal = options?.signal ?? null;
    throwIfAborted(signal, "Project index cache load was aborted.");

    const resolvedRoot = path.resolve(projectRoot);
    const cacheFilePath = resolveCacheFilePath(resolvedRoot, explicitPath);

    let rawContents;
    try {
        rawContents = await fsFacade.readFile(cacheFilePath, "utf8");
    } catch (error) {
        if (isFsErrorCode(error, "ENOENT")) {
            return createCacheMiss(
                cacheFilePath,
                ProjectIndexCacheMissReason.NOT_FOUND
            );
        }
        throw error;
    }

    throwIfAborted(signal, "Project index cache load was aborted.");

    let parsed;
    try {
        parsed = parseJsonWithContext(rawContents, {
            source: cacheFilePath,
            description: "project index cache"
        });
    } catch (error) {
        return createCacheMiss(
            cacheFilePath,
            ProjectIndexCacheMissReason.INVALID_JSON,
            { error }
        );
    }

    throwIfAborted(signal, "Project index cache load was aborted.");

    if (!validateCachePayload(parsed)) {
        return createCacheMiss(
            cacheFilePath,
            ProjectIndexCacheMissReason.INVALID_SCHEMA
        );
    }

    if (path.resolve(parsed.projectRoot) !== resolvedRoot) {
        return createCacheMiss(
            cacheFilePath,
            ProjectIndexCacheMissReason.PROJECT_ROOT_MISMATCH
        );
    }

    if (
        formatterVersion &&
        parsed.formatterVersion !== String(formatterVersion)
    ) {
        return createCacheMiss(
            cacheFilePath,
            ProjectIndexCacheMissReason.FORMATTER_VERSION_MISMATCH
        );
    }

    if (pluginVersion && parsed.pluginVersion !== String(pluginVersion)) {
        return createCacheMiss(
            cacheFilePath,
            ProjectIndexCacheMissReason.PLUGIN_VERSION_MISMATCH
        );
    }

    const hasManifestExpectations = hasEntries(manifestMtimes);
    if (
        hasManifestExpectations &&
        !areMtimeMapsEqual(manifestMtimes, parsed.manifestMtimes)
    ) {
        return createCacheMiss(
            cacheFilePath,
            ProjectIndexCacheMissReason.MANIFEST_MTIME_MISMATCH
        );
    }

    const hasSourceExpectations = hasEntries(sourceMtimes);
    if (
        hasSourceExpectations &&
        !areMtimeMapsEqual(sourceMtimes, parsed.sourceMtimes)
    ) {
        return createCacheMiss(
            cacheFilePath,
            ProjectIndexCacheMissReason.SOURCE_MTIME_MISMATCH
        );
    }

    const projectIndex = {
        ...parsed.projectIndex
    };
    if (parsed.metricsSummary != undefined) {
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
    fsFacade = defaultFsFacade,
    options = {}
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

    const signal = options?.signal ?? null;
    throwIfAborted(signal, "Project index cache save was aborted.");

    const resolvedRoot = path.resolve(projectRoot);
    const cacheFilePath = resolveCacheFilePath(resolvedRoot, explicitPath);
    const cacheDir = path.dirname(cacheFilePath);

    await fsFacade.mkdir(cacheDir, { recursive: true });
    throwIfAborted(signal, "Project index cache save was aborted.");

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

    const effectiveMaxSize = normalizeMaxSizeBytes(maxSizeBytes);
    if (effectiveMaxSize !== null && byteLength > effectiveMaxSize) {
        return {
            status: "skipped",
            cacheFilePath,
            reason: "payload-too-large",
            size: byteLength
        };
    }

    const uniqueSuffix = randomUUID();
    const tempFilePath = `${cacheFilePath}.${uniqueSuffix}.tmp`;

    try {
        await fsFacade.writeFile(tempFilePath, serialized, "utf8");
        throwIfAborted(signal, "Project index cache save was aborted.");

        await fsFacade.rename(tempFilePath, cacheFilePath);
        throwIfAborted(signal, "Project index cache save was aborted.");
    } catch (error) {
        try {
            await fsFacade.unlink(tempFilePath);
        } catch {
            // The rename failure above is the actionable error for callers; a
            // secondary failure while deleting the uniquely named temp file is
            // best-effort hygiene. Dropping that error preserves the original
            // stack trace while still leaving a breadcrumb that the write was
            // attempted—the random suffix prevents future writes from
            // colliding even if the orphaned file lingers.
        }
        throw error;
    }

    return {
        status: "written",
        cacheFilePath,
        size: byteLength
    };
}

export async function deriveCacheKey(
    { filepath, projectRoot, formatterVersion = "dev" } = {},
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
            .filter(isProjectManifestPath)
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
