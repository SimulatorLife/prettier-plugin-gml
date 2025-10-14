import path from "node:path";
import {
    readFileSync as nodeReadFileSync,
    writeFileSync as nodeWriteFileSync,
    renameSync as nodeRenameSync,
    accessSync as nodeAccessSync,
    statSync as nodeStatSync,
    mkdirSync as nodeMkdirSync,
    existsSync as nodeExistsSync
} from "node:fs";

import { DEFAULT_WRITE_ACCESS_MODE } from "./common.js";

const defaultFsFacade = Object.freeze({
    readFileSync(targetPath, encoding = "utf8") {
        return nodeReadFileSync(targetPath, encoding);
    },
    writeFileSync(targetPath, contents) {
        nodeWriteFileSync(targetPath, contents, "utf8");
    },
    renameSync(fromPath, toPath) {
        nodeRenameSync(fromPath, toPath);
    },
    accessSync(targetPath, mode = DEFAULT_WRITE_ACCESS_MODE) {
        if (mode != null) {
            nodeAccessSync(targetPath, mode);
        } else {
            nodeAccessSync(targetPath);
        }
    },
    statSync(targetPath) {
        return nodeStatSync(targetPath);
    },
    mkdirSync(targetPath) {
        nodeMkdirSync(targetPath, { recursive: true });
    },
    existsSync(targetPath) {
        return nodeExistsSync(targetPath);
    }
});

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
        if (error?.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

function toSystemPath(relativePath) {
    if (typeof relativePath !== "string") {
        return relativePath ?? "";
    }

    return relativePath.replace(/\//g, path.sep);
}

function resolveAbsolutePath(projectRoot, relativePath) {
    if (!relativePath) {
        return projectRoot;
    }

    if (path.isAbsolute(relativePath)) {
        return relativePath;
    }

    const systemRelative = toSystemPath(relativePath);
    return path.join(projectRoot, systemRelative);
}

function stringifyJson(json) {
    return `${JSON.stringify(json, null, 4)}\n`;
}

function readJsonFile(fsFacade, absolutePath, cache) {
    if (cache && cache.has(absolutePath)) {
        return cache.get(absolutePath);
    }

    const raw = fsFacade.readFileSync(absolutePath, "utf8");
    const parsed = JSON.parse(raw);
    if (cache) {
        cache.set(absolutePath, parsed);
    }
    return parsed;
}

function getObjectAtPath(json, propertyPath) {
    if (!propertyPath) {
        return json;
    }

    const segments = propertyPath
        .split(".")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);

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

        if (!current || typeof current !== "object") {
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
    if (!json) {
        return false;
    }

    const target = getObjectAtPath(json, propertyPath);
    if (!target || typeof target !== "object") {
        return false;
    }

    let changed = false;

    if (
        typeof newResourcePath === "string" &&
        newResourcePath.length > 0 &&
        target.path !== newResourcePath
    ) {
        target.path = newResourcePath;
        changed = true;
    }

    if (
        typeof newName === "string" &&
        newName.length > 0 &&
        target.name !== newName
    ) {
        target.name = newName;
        changed = true;
    }

    return changed;
}

function ensureWritableDirectory(fsFacade, directoryPath) {
    if (!directoryPath) {
        return;
    }

    const accessArgs =
        DEFAULT_WRITE_ACCESS_MODE != null ? [DEFAULT_WRITE_ACCESS_MODE] : [];

    if (
        tryAccess(fsFacade, "accessSync", directoryPath, ...accessArgs) ||
        tryAccess(fsFacade, "existsSync", directoryPath)
    ) {
        return;
    }

    if (typeof fsFacade.mkdirSync === "function") {
        fsFacade.mkdirSync(directoryPath);
    }
}

function ensureWritableFile(fsFacade, filePath) {
    const accessArgs =
        DEFAULT_WRITE_ACCESS_MODE != null ? [DEFAULT_WRITE_ACCESS_MODE] : [];

    if (
        tryAccess(fsFacade, "accessSync", filePath, ...accessArgs) ||
        tryAccess(fsFacade, "statSync", filePath)
    ) {
        return;
    }

    ensureWritableDirectory(fsFacade, path.dirname(filePath));
}

export function createAssetRenameExecutor({
    projectIndex,
    fsFacade = null,
    logger = null
} = {}) {
    if (!projectIndex || typeof projectIndex.projectRoot !== "string") {
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
            if (!rename?.resourcePath || !rename?.toName) {
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

            if (!resourceJson || typeof resourceJson !== "object") {
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
                typeof rename.newResourcePath === "string" &&
                rename.newResourcePath.length > 0 &&
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
                if (!mutation?.filePath) {
                    continue;
                }
                const entries = groupedReferences.get(mutation.filePath) ?? [];
                entries.push(mutation);
                groupedReferences.set(mutation.filePath, entries);
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
                        logger.warn(
                            `Skipping asset reference update for '${filePath}': ${error.message}`
                        );
                    }
                    continue;
                }

                if (!targetJson || typeof targetJson !== "object") {
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
                if (!gmlRename?.from || !gmlRename?.to) {
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
            const writeActions = Array.from(pendingWrites.entries()).map(
                ([filePath, jsonData]) => ({
                    filePath,
                    contents: stringifyJson(jsonData)
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

            return { writes: writeActions, renames: renameActions.slice() };
        }
    };
}

export const __private__ = {
    defaultFsFacade,
    toSystemPath,
    resolveAbsolutePath,
    stringifyJson,
    readJsonFile,
    getObjectAtPath,
    updateReferenceObject,
    tryAccess,
    ensureWritableFile,
    ensureWritableDirectory
};
