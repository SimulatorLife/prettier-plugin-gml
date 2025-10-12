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

import { formatIdentifierCase } from "../../../shared/identifier-case.js";
import {
    COLLISION_CONFLICT_CODE,
    PRESERVE_CONFLICT_CODE,
    IGNORE_CONFLICT_CODE,
    createConflict,
    matchesIgnorePattern,
    incrementFileOccurrence,
    summarizeFileOccurrences,
    DEFAULT_WRITE_ACCESS_MODE
} from "./common.js";

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

    try {
        if (typeof fsFacade.accessSync === "function") {
            fsFacade.accessSync(directoryPath, DEFAULT_WRITE_ACCESS_MODE);
            return;
        }

        if (typeof fsFacade.existsSync === "function") {
            if (fsFacade.existsSync(directoryPath)) {
                return;
            }
        }
    } catch (error) {
        if (!error || error.code !== "ENOENT") {
            throw error;
        }
    }

    if (typeof fsFacade.mkdirSync === "function") {
        fsFacade.mkdirSync(directoryPath);
    }
}

function ensureWritableFile(fsFacade, filePath) {
    try {
        if (typeof fsFacade.accessSync === "function") {
            fsFacade.accessSync(filePath, DEFAULT_WRITE_ACCESS_MODE);
            return;
        }

        if (typeof fsFacade.statSync === "function") {
            fsFacade.statSync(filePath);
            return;
        }
    } catch (error) {
        if (!error || error.code !== "ENOENT") {
            throw error;
        }
    }

    ensureWritableDirectory(fsFacade, path.dirname(filePath));
}

function summarizeReferences(referenceMutations, resourcePath) {
    const counts = new Map();
    if (resourcePath) {
        incrementFileOccurrence(counts, resourcePath);
    }

    for (const mutation of referenceMutations ?? []) {
        if (!mutation?.filePath) {
            continue;
        }
        incrementFileOccurrence(counts, mutation.filePath);
    }

    return summarizeFileOccurrences(counts);
}

export function planAssetRenames({
    projectIndex,
    assetStyle,
    preservedSet = new Set(),
    ignoreMatchers = []
} = {}) {
    if (!projectIndex || !projectIndex.resources || assetStyle === "off") {
        return { operations: [], conflicts: [], renames: [] };
    }

    const resources = projectIndex.resources;
    const assetReferences = projectIndex.relationships?.assetReferences ?? [];
    const referencesByTargetPath = new Map();

    for (const reference of assetReferences) {
        if (!reference || typeof reference.targetPath !== "string") {
            continue;
        }

        const existing = referencesByTargetPath.get(reference.targetPath) ?? [];
        existing.push(reference);
        referencesByTargetPath.set(reference.targetPath, existing);
    }

    const operations = [];
    const conflicts = [];
    const renames = [];
    const namesByDirectory = new Map();

    for (const [resourcePath, resourceRecord] of Object.entries(resources)) {
        if (!resourceRecord || !resourceRecord.name) {
            continue;
        }

        if (resourceRecord.resourceType !== "GMScript") {
            continue;
        }

        const originalName = resourceRecord.name;
        const convertedName = formatIdentifierCase(originalName, assetStyle);

        if (!convertedName || convertedName === originalName) {
            continue;
        }

        if (preservedSet.has(originalName)) {
            const scopeDescriptor = {
                id: resourcePath,
                displayName: `${resourceRecord.resourceType}.${originalName}`
            };
            conflicts.push(
                createConflict({
                    code: PRESERVE_CONFLICT_CODE,
                    severity: "info",
                    message: `Asset '${originalName}' is preserved by configuration.`,
                    scope: scopeDescriptor,
                    identifier: originalName
                })
            );
            continue;
        }

        const ignoreMatch = matchesIgnorePattern(
            ignoreMatchers,
            originalName,
            resourcePath
        );
        if (ignoreMatch) {
            const scopeDescriptor = {
                id: resourcePath,
                displayName: `${resourceRecord.resourceType}.${originalName}`
            };
            conflicts.push(
                createConflict({
                    code: IGNORE_CONFLICT_CODE,
                    severity: "info",
                    message: `Asset '${originalName}' matches ignore pattern '${ignoreMatch}'.`,
                    scope: scopeDescriptor,
                    identifier: originalName
                })
            );
            continue;
        }

        const directory = path.posix.dirname(resourcePath);
        const collisionKey = `${directory}|${convertedName.toLowerCase()}`;
        if (namesByDirectory.has(collisionKey)) {
            const scopeDescriptor = {
                id: resourcePath,
                displayName: `${resourceRecord.resourceType}.${originalName}`
            };
            conflicts.push(
                createConflict({
                    code: COLLISION_CONFLICT_CODE,
                    severity: "error",
                    message: `Renaming '${originalName}' to '${convertedName}' collides with existing asset '${
                        namesByDirectory.get(collisionKey).name
                    }'.`,
                    scope: scopeDescriptor,
                    identifier: originalName
                })
            );
            continue;
        }
        namesByDirectory.set(collisionKey, {
            name: originalName,
            path: resourcePath
        });

        const inboundReferences =
            referencesByTargetPath.get(resourcePath) ?? [];
        const referenceMutations = inboundReferences
            .filter(
                (reference) => typeof reference.fromResourcePath === "string"
            )
            .map((reference) => ({
                filePath: reference.fromResourcePath,
                propertyPath: reference.propertyPath ?? "",
                originalName: reference.targetName ?? originalName
            }));

        const newResourcePath = path.posix.join(
            directory,
            `${convertedName}.yy`
        );

        const gmlRenames = [];
        for (const gmlFile of resourceRecord.gmlFiles ?? []) {
            const extension = path.posix.extname(gmlFile);
            const baseName = path.posix.basename(gmlFile, extension);
            if (baseName !== originalName) {
                continue;
            }

            const renamedPath = path.posix.join(
                path.posix.dirname(gmlFile),
                `${convertedName}${extension}`
            );
            gmlRenames.push({ from: gmlFile, to: renamedPath });
        }

        renames.push({
            resourcePath,
            resourceType: resourceRecord.resourceType,
            fromName: originalName,
            toName: convertedName,
            newResourcePath,
            gmlRenames,
            referenceMutations
        });

        operations.push({
            id: `asset:${resourceRecord.resourceType}:${resourcePath}`,
            kind: "asset",
            scope: {
                id: resourcePath,
                displayName: `${resourceRecord.resourceType}.${originalName}`
            },
            from: { name: originalName },
            to: { name: convertedName },
            references: summarizeReferences(referenceMutations, resourcePath)
        });
    }

    return { operations, conflicts, renames };
}

export function applyAssetRenames({
    projectIndex,
    renames,
    fsFacade = null,
    logger = null
} = {}) {
    if (!projectIndex || !Array.isArray(renames) || renames.length === 0) {
        return { writes: [], renames: [] };
    }

    const effectiveFs = fsFacade
        ? { ...defaultFsFacade, ...fsFacade }
        : defaultFsFacade;
    const root = projectIndex.projectRoot;

    const jsonCache = new Map();
    const pendingWrites = new Map();
    const renameActions = [];

    for (const rename of renames) {
        if (!rename?.resourcePath || !rename?.toName) {
            continue;
        }

        const resourceAbsolute = resolveAbsolutePath(root, rename.resourcePath);
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
            const absolutePath = resolveAbsolutePath(root, filePath);
            let targetJson;
            try {
                targetJson = readJsonFile(effectiveFs, absolutePath, jsonCache);
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
            root,
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

            const fromAbsolute = resolveAbsolutePath(root, gmlRename.from);
            const toAbsolute = resolveAbsolutePath(root, gmlRename.to);

            if (fromAbsolute === toAbsolute) {
                continue;
            }

            renameActions.push({ from: fromAbsolute, to: toAbsolute });
        }
    }

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
        ensureWritableDirectory(effectiveFs, path.dirname(action.filePath));
        effectiveFs.writeFileSync(action.filePath, action.contents);
    }

    for (const action of renameActions) {
        ensureWritableDirectory(effectiveFs, path.dirname(action.to));
        effectiveFs.renameSync(action.from, action.to);
    }

    return { writes: writeActions, renames: renameActions };
}
