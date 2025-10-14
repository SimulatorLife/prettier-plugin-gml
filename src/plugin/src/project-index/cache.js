import path from "node:path";
import { createHash } from "node:crypto";

import { PROJECT_MANIFEST_EXTENSION } from "./constants.js";
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

function isManifestEntry(entry) {
    return (
        typeof entry === "string" &&
        entry.toLowerCase().endsWith(PROJECT_MANIFEST_EXTENSION)
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

    return expectedEntries.every(([key, value]) => actual[key] === value);
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
        if (isFsErrorCode(error, "ENOENT")) {
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
