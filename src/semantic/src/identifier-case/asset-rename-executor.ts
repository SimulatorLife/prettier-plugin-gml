import path from "node:path";

import { Core } from "@gml-modules/core";

import { DEFAULT_WRITE_ACCESS_MODE } from "./common.js";
import { defaultIdentifierCaseFsFacade as defaultFsFacade } from "./fs-facade.js";

type IdentifierCaseProjectIndex = {
    projectRoot?: string | null;
};

type AssetRenameExecutorLogger = {
    warn?: (message: string) => void;
};

type AssetRenameExecutorOptions = {
    projectIndex?: IdentifierCaseProjectIndex | null;
    fsFacade?: typeof defaultFsFacade | null;
    logger?: AssetRenameExecutorLogger | null;
};

const DEFAULT_WRITE_ACCESS_ARGS =
    DEFAULT_WRITE_ACCESS_MODE === undefined ? [] : [DEFAULT_WRITE_ACCESS_MODE];

function tryAccess(fsFacade, method, targetPath, ...args) {
    if (!targetPath || !fsFacade) {
        return false;
    }

    const fn = fsFacade[method];
    if (typeof fn !== "function") {
        return false;
    }

    try {
        const result = fn.call(fsFacade, targetPath, ...args);
        return method === "existsSync" ? Boolean(result) : true;
    } catch (error) {
        if (Core.FS.isFsErrorCode(error, "ENOENT")) {
            return false;
        }
        throw error;
    }
}

function resolveAbsolutePath(projectRoot, relativePath) {
    if (!relativePath) {
        return projectRoot;
    }

    if (path.isAbsolute(relativePath)) {
        return relativePath;
    }

    const systemRelative = Core.FS.fromPosixPath(relativePath);
    return path.join(projectRoot, systemRelative);
}

function readJsonFile(fsFacade, absolutePath, cache) {
    if (cache && cache.has(absolutePath)) {
        return cache.get(absolutePath);
    }

    const raw = fsFacade.readFileSync(absolutePath, "utf8");
    const parsed = Core.Utils.parseJsonWithContext(raw, { source: absolutePath });
    const resourceJson = Core.Utils.assertPlainObject(parsed, {
        errorMessage: `Resource JSON at ${absolutePath} must be a plain object.`
    });
    if (cache) {
        cache.set(absolutePath, resourceJson);
    }
    return resourceJson;
}

function getObjectAtPath(json, propertyPath) {
    if (!propertyPath) {
        return json;
    }

    const segments = Core.Utils.trimStringEntries(propertyPath.split(".")).filter(
        (segment) => segment.length > 0
    );

    let current = json;
    for (const segment of segments) {
        if (Array.isArray(current)) {
            const index = Number(segment);
            if (
                !Number.isInteger(index) ||
                index < 0 ||
                index >= current.length
            ) {
                return null;
            }
            current = current[index];
            continue;
        }

        if (!Core.Utils.isObjectLike(current)) {
            return null;
        }

        if (!Object.hasOwn(current, segment)) {
            return null;
        }

        current = current[segment];
    }

    return current;
}

function updateReferenceObject(json, propertyPath, newResourcePath, newName) {
    if (!Core.Utils.isObjectLike(json)) {
        return false;
    }

    const target = getObjectAtPath(json, propertyPath);
    if (!Core.Utils.isObjectLike(target)) {
        return false;
    }

    let changed = false;

    if (Core.Utils.isNonEmptyString(newResourcePath) && target.path !== newResourcePath) {
        target.path = newResourcePath;
        changed = true;
    }

    if (Core.Utils.isNonEmptyString(newName) && target.name !== newName) {
        target.name = newName;
        changed = true;
    }

    return changed;
}

function hasWriteAccess(fsFacade, targetPath, probeMethod) {
    if (
        tryAccess(
            fsFacade,
            "accessSync",
            targetPath,
            ...DEFAULT_WRITE_ACCESS_ARGS
        )
    ) {
        return true;
    }

    return tryAccess(fsFacade, probeMethod, targetPath);
}
function ensureWritableDirectory(fsFacade, directoryPath) {
    if (!directoryPath) {
        return;
    }

    if (hasWriteAccess(fsFacade, directoryPath, "existsSync")) {
        return;
    }

    if (typeof fsFacade.mkdirSync === "function") {
        fsFacade.mkdirSync(directoryPath);
    }
}

function ensureWritableFile(fsFacade, filePath) {
    if (hasWriteAccess(fsFacade, filePath, "statSync")) {
        return;
    }

    ensureWritableDirectory(fsFacade, path.dirname(filePath));
}

export function createAssetRenameExecutor({
    projectIndex,
    fsFacade = null,
    logger = null
}: AssetRenameExecutorOptions = {}) {
    if (
        !Core.Utils.isObjectLike(projectIndex) ||
        typeof projectIndex.projectRoot !== "string"
    ) {
        return {
            queueRename() {
                return false;
            },
            commit() {
                return { writes: [], renames: [] };
            }
        };
    }

    const effectiveFs = fsFacade
        ? { ...defaultFsFacade, ...fsFacade }
        : defaultFsFacade;
    const projectRoot = projectIndex.projectRoot;
    const jsonCache = new Map();
    const pendingWrites = new Map();
    const renameActions = [];

    return {
        queueRename(rename) {
            if (
                !Core.Utils.isObjectLike(rename) ||
                !Core.Utils.isNonEmptyString(rename.resourcePath) ||
                !Core.Utils.isNonEmptyString(rename.toName)
            ) {
                return false;
            }

            const resourceAbsolute = resolveAbsolutePath(
                projectRoot,
                rename.resourcePath
            );
            const resourceJson = readJsonFile(
                effectiveFs,
                resourceAbsolute,
                jsonCache
            );

            if (!Core.Utils.isObjectLike(resourceJson)) {
                throw new Error(
                    `Unable to parse resource metadata at '${rename.resourcePath}'.`
                );
            }

            let resourceChanged = false;
            if (resourceJson.name !== rename.toName) {
                resourceJson.name = rename.toName;
                resourceChanged = true;
            }

            if (
                Core.Utils.isNonEmptyString(rename.newResourcePath) &&
                resourceJson.resourcePath !== rename.newResourcePath
            ) {
                resourceJson.resourcePath = rename.newResourcePath;
                resourceChanged = true;
            }

            if (resourceChanged) {
                pendingWrites.set(resourceAbsolute, resourceJson);
            }

            const groupedReferences = new Map();
            for (const mutation of rename.referenceMutations ?? []) {
                if (
                    !Core.Utils.isObjectLike(mutation) ||
                    !Core.Utils.isNonEmptyString(mutation.filePath)
                ) {
                    continue;
                }
                const entries = Core.Utils.getOrCreateMapEntry(
                    groupedReferences,
                    mutation.filePath,
                    () => []
                );
                entries.push(mutation);
            }

            for (const [filePath, mutations] of groupedReferences.entries()) {
                const absolutePath = resolveAbsolutePath(projectRoot, filePath);
                let targetJson;
                try {
                    targetJson = readJsonFile(
                        effectiveFs,
                        absolutePath,
                        jsonCache
                    );
                } catch (error) {
                    if (logger && typeof logger.warn === "function") {
                        const message = Core.Utils.getErrorMessageOrFallback(error);
                        logger.warn(
                            `Skipping asset reference update for '${filePath}': ${message}`
                        );
                    }
                    continue;
                }

                if (!Core.Utils.isObjectLike(targetJson)) {
                    continue;
                }

                let updated = false;
                for (const mutation of mutations) {
                    const changed = updateReferenceObject(
                        targetJson,
                        mutation.propertyPath,
                        rename.newResourcePath,
                        rename.toName
                    );
                    if (changed) {
                        updated = true;
                    }
                }

                if (updated) {
                    pendingWrites.set(absolutePath, targetJson);
                }
            }

            const newResourceAbsolute = resolveAbsolutePath(
                projectRoot,
                rename.newResourcePath
            );

            if (newResourceAbsolute !== resourceAbsolute) {
                renameActions.push({
                    from: resourceAbsolute,
                    to: newResourceAbsolute
                });
            }

            for (const gmlRename of rename.gmlRenames ?? []) {
                if (
                    !Core.Utils.isObjectLike(gmlRename) ||
                    !Core.Utils.isNonEmptyString(gmlRename.from) ||
                    !Core.Utils.isNonEmptyString(gmlRename.to)
                ) {
                    continue;
                }

                const fromAbsolute = resolveAbsolutePath(
                    projectRoot,
                    gmlRename.from
                );
                const toAbsolute = resolveAbsolutePath(
                    projectRoot,
                    gmlRename.to
                );

                if (fromAbsolute === toAbsolute) {
                    continue;
                }

                renameActions.push({ from: fromAbsolute, to: toAbsolute });
            }

            return true;
        },

        commit() {
            const writeActions = [...pendingWrites.entries()].map(
                ([filePath, jsonData]) => ({
                    filePath,
                    contents: Core.Utils.stringifyJsonForFile(jsonData, { space: 4 })
                })
            );

            if (writeActions.length === 0 && renameActions.length === 0) {
                return { writes: [], renames: [] };
            }

            for (const action of writeActions) {
                ensureWritableFile(effectiveFs, action.filePath);
            }

            for (const action of renameActions) {
                ensureWritableFile(effectiveFs, action.from);
                ensureWritableDirectory(effectiveFs, path.dirname(action.to));
                if (
                    typeof effectiveFs.existsSync === "function" &&
                    effectiveFs.existsSync(action.to)
                ) {
                    throw new Error(
                        `Cannot rename '${action.from}' to existing path '${action.to}'.`
                    );
                }
            }

            for (const action of writeActions) {
                ensureWritableDirectory(
                    effectiveFs,
                    path.dirname(action.filePath)
                );
                effectiveFs.writeFileSync(action.filePath, action.contents);
            }

            for (const action of renameActions) {
                ensureWritableDirectory(effectiveFs, path.dirname(action.to));
                effectiveFs.renameSync(action.from, action.to);
            }

            return { writes: writeActions, renames: [...renameActions] };
        }
    };
}

export const __private__ = {
    defaultFsFacade,
    fromPosixPath: Core.FS.fromPosixPath,
    resolveAbsolutePath,
    readJsonFile,
    getObjectAtPath,
    updateReferenceObject,
    tryAccess,
    ensureWritableFile,
    ensureWritableDirectory
};
