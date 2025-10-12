import path from "node:path";

import { formatIdentifierCase } from "../../../shared/identifier-case.js";
import {
    COLLISION_CONFLICT_CODE,
    PRESERVE_CONFLICT_CODE,
    IGNORE_CONFLICT_CODE,
    createConflict,
    matchesIgnorePattern,
    incrementFileOccurrence,
    summarizeFileOccurrences
} from "./common.js";
import { createAssetRenameExecutor } from "../assets/rename.js";

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

    const executor = createAssetRenameExecutor({
        projectIndex,
        fsFacade,
        logger
    });

    let hasQueuedRenames = false;
    for (const rename of renames) {
        const queued = executor.queueRename(rename);
        if (queued) {
            hasQueuedRenames = true;
        }
    }

    if (!hasQueuedRenames) {
        return { writes: [], renames: [] };
    }

    return executor.commit();
}
