import path from "node:path";

import { formatIdentifierCase } from "./identifier-case-utils.js";
import { isNonEmptyString } from "../../../shared/string-utils.js";
import { isNonEmptyArray } from "../../../shared/array-utils.js";
import { loadReservedIdentifierNames } from "../reserved-identifiers.js";
import {
    COLLISION_CONFLICT_CODE,
    PRESERVE_CONFLICT_CODE,
    IGNORE_CONFLICT_CODE,
    RESERVED_CONFLICT_CODE,
    createConflict,
    resolveIdentifierConfigurationConflict,
    summarizeReferenceFileOccurrences
} from "./common.js";
import { createAssetRenameExecutor } from "./asset-rename-executor.js";

const RESERVED_IDENTIFIER_NAMES = loadReservedIdentifierNames();

function isReservedIdentifierName(name) {
    if (!isNonEmptyString(name)) {
        return false;
    }

    if (RESERVED_IDENTIFIER_NAMES.size === 0) {
        return false;
    }

    return RESERVED_IDENTIFIER_NAMES.has(name.toLowerCase());
}

function buildAssetConflictSuggestions(identifierName) {
    const suggestions = [];

    if (isNonEmptyString(identifierName)) {
        suggestions.push(`Add '${identifierName}' to gmlIdentifierCaseIgnore`);
    }

    suggestions.push(
        'Disable asset renames by setting gmlIdentifierCaseAssets to "off"'
    );

    return suggestions;
}

function createRenameScopeDescriptor(renameEntry) {
    return {
        id: renameEntry.resourcePath,
        displayName: `${renameEntry.resourceType}.${renameEntry.originalName}`
    };
}

function mapRenameConflictDetails(entries) {
    return entries.map((entry) => ({
        resourcePath: entry.resourcePath,
        originalName: entry.originalName,
        finalName: entry.finalName,
        isRename: entry.isRename
    }));
}

function recordAssetRenameCollision({
    conflicts,
    renameEntry,
    conflictingEntries,
    message,
    metrics
}) {
    conflicts.push(
        createConflict({
            code: COLLISION_CONFLICT_CODE,
            severity: "error",
            message,
            scope: createRenameScopeDescriptor(renameEntry),
            identifier: renameEntry.originalName,
            suggestions: buildAssetConflictSuggestions(
                renameEntry.originalName
            ),
            details: {
                targetName: renameEntry.finalName,
                conflicts: mapRenameConflictDetails(conflictingEntries)
            }
        })
    );
    metrics?.incrementCounter("assets.collisionConflicts");
}

function collectDirectoryEntries({ projectIndex, renames }) {
    const renameByResourcePath = new Map();
    for (const rename of renames ?? []) {
        if (!rename?.resourcePath) {
            continue;
        }
        renameByResourcePath.set(rename.resourcePath, rename);
    }

    const resources = projectIndex?.resources ?? {};
    const directories = new Map();

    for (const [resourcePath, resourceRecord] of Object.entries(resources)) {
        if (
            !resourceRecord ||
            resourceRecord.resourceType !== "GMScript" ||
            typeof resourceRecord.name !== "string"
        ) {
            continue;
        }

        const rename = renameByResourcePath.get(resourcePath) ?? null;
        const finalName = rename?.toName ?? resourceRecord.name;
        if (!isNonEmptyString(finalName)) {
            continue;
        }

        const directory = path.posix.dirname(resourcePath);
        const list = directories.get(directory) ?? [];
        list.push({
            directory,
            resourcePath,
            resourceType: resourceRecord.resourceType,
            originalName: resourceRecord.name,
            finalName,
            isRename: Boolean(rename),
            rename
        });
        directories.set(directory, list);
    }

    return directories;
}

function hasPendingAssetRenames(projectIndex, renames) {
    return Boolean(projectIndex) && isNonEmptyArray(renames);
}

function detectAssetRenameConflicts({ projectIndex, renames, metrics = null }) {
    if (!hasPendingAssetRenames(projectIndex, renames)) {
        return [];
    }

    const directories = collectDirectoryEntries({ projectIndex, renames });
    const conflicts = [];

    for (const entries of directories.values()) {
        const byLowerName = new Map();
        for (const entry of entries) {
            const key = entry.finalName.toLowerCase();
            const bucket = byLowerName.get(key) ?? [];
            bucket.push(entry);
            byLowerName.set(key, bucket);
        }

        for (const bucket of byLowerName.values()) {
            if (bucket.length <= 1) {
                continue;
            }

            const renameEntries = bucket.filter((entry) => entry.isRename);
            if (renameEntries.length === 0) {
                continue;
            }

            const existingEntries = bucket.filter((entry) => !entry.isRename);

            for (const renameEntry of renameEntries) {
                if (existingEntries.length > 0) {
                    const otherNames = existingEntries
                        .map(
                            (entry) =>
                                `'${entry.originalName}' (${entry.resourcePath})`
                        )
                        .join(", ");
                    recordAssetRenameCollision({
                        conflicts,
                        renameEntry,
                        conflictingEntries: existingEntries,
                        message: `Renaming '${renameEntry.originalName}' to '${renameEntry.finalName}' collides with existing asset ${otherNames}.`,
                        metrics
                    });
                }

                const otherRenames = renameEntries.filter(
                    (entry) => entry !== renameEntry
                );
                if (otherRenames.length > 0) {
                    const otherNames = otherRenames
                        .map((entry) => `'${entry.originalName}'`)
                        .join(", ");
                    recordAssetRenameCollision({
                        conflicts,
                        renameEntry,
                        conflictingEntries: otherRenames,
                        message: `Renaming '${renameEntry.originalName}' to '${renameEntry.finalName}' collides with ${otherNames} targeting the same name.`,
                        metrics
                    });
                }
            }
        }
    }

    for (const rename of renames) {
        if (!rename?.toName || !isReservedIdentifierName(rename.toName)) {
            continue;
        }

        const scopeDescriptor = {
            id: rename.resourcePath,
            displayName: `${rename.resourceType}.${rename.fromName}`
        };

        conflicts.push(
            createConflict({
                code: RESERVED_CONFLICT_CODE,
                severity: "error",
                message: `Renaming '${rename.fromName}' to '${rename.toName}' conflicts with reserved identifier '${rename.toName}'.`,
                scope: scopeDescriptor,
                identifier: rename.fromName,
                suggestions: buildAssetConflictSuggestions(rename.fromName),
                details: {
                    targetName: rename.toName
                }
            })
        );
        metrics?.incrementCounter("assets.reservedConflicts");
    }

    return conflicts;
}

function summarizeReferences(referenceMutations, resourcePath) {
    const includeFilePaths =
        typeof resourcePath === "string" && resourcePath.length > 0
            ? [resourcePath]
            : [];

    return summarizeReferenceFileOccurrences(referenceMutations, {
        includeFilePaths,
        fallbackPath: null
    });
}

export function planAssetRenames({
    projectIndex,
    assetStyle,
    preservedSet = new Set(),
    ignoreMatchers = [],
    metrics = null
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
    let renames = [];
    const namesByDirectory = new Map();

    for (const [resourcePath, resourceRecord] of Object.entries(resources)) {
        if (!resourceRecord || !resourceRecord.name) {
            continue;
        }

        metrics?.incrementCounter("assets.resourcesScanned");

        if (resourceRecord.resourceType !== "GMScript") {
            continue;
        }

        const originalName = resourceRecord.name;
        const convertedName = formatIdentifierCase(originalName, assetStyle);

        if (!convertedName || convertedName === originalName) {
            continue;
        }

        metrics?.incrementCounter("assets.renameCandidates");

        const configConflict = resolveIdentifierConfigurationConflict({
            preservedSet,
            identifierName: originalName,
            ignoreMatchers,
            filePath: resourcePath
        });

        if (configConflict) {
            metrics?.incrementCounter("assets.configurationConflicts");
            const scopeDescriptor = {
                id: resourcePath,
                displayName: `${resourceRecord.resourceType}.${originalName}`
            };

            let message;
            switch (configConflict.code) {
                case PRESERVE_CONFLICT_CODE: {
                    message = `Asset '${originalName}' is preserved by configuration.`;
                    break;
                }
                case IGNORE_CONFLICT_CODE: {
                    message = `Asset '${originalName}' matches ignore pattern '${configConflict.ignoreMatch}'.`;
                    break;
                }
                default: {
                    message = `Asset '${originalName}' cannot be renamed due to configuration.`;
                }
            }

            conflicts.push(
                createConflict({
                    code: configConflict.code,
                    severity: "info",
                    message,
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
            metrics?.incrementCounter("assets.collisionConflicts");
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

        metrics?.incrementCounter("assets.renamesQueued");

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

    const validationConflicts = detectAssetRenameConflicts({
        projectIndex,
        renames,
        metrics
    });

    if (validationConflicts.length > 0) {
        conflicts.push(...validationConflicts);
        renames = [];
    }

    return { operations, conflicts, renames };
}

export function applyAssetRenames({
    projectIndex,
    renames,
    fsFacade = null,
    logger = null
} = {}) {
    if (!hasPendingAssetRenames(projectIndex, renames)) {
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
