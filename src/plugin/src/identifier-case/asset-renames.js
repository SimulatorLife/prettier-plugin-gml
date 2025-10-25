import path from "node:path";

import { formatIdentifierCase } from "./identifier-case-utils.js";
import {
    isNonEmptyString,
    toNormalizedLowerCaseString,
    isNonEmptyArray,
    getOrCreateMapEntry
} from "../shared/index.js";
import { loadReservedIdentifierNames } from "../resources/reserved-identifiers.js";
import {
    COLLISION_CONFLICT_CODE,
    RESERVED_CONFLICT_CODE,
    createConflict,
    formatConfigurationConflictMessage,
    resolveIdentifierConfigurationConflict,
    summarizeReferenceFileOccurrences
} from "./common.js";
import { createAssetRenameExecutor } from "./asset-rename-executor.js";

const RESERVED_IDENTIFIER_NAMES = loadReservedIdentifierNames();

function isReservedIdentifierName(name) {
    const normalizedName = toNormalizedLowerCaseString(name);
    if (!normalizedName) {
        return false;
    }

    if (RESERVED_IDENTIFIER_NAMES.size === 0) {
        return false;
    }

    return RESERVED_IDENTIFIER_NAMES.has(normalizedName);
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

function mapRenameConflictDetails(entries) {
    return entries.map((entry) => ({
        resourcePath: entry.resourcePath,
        originalName: entry.originalName,
        finalName: entry.finalName,
        isRename: entry.isRename
    }));
}

function pushAssetRenameConflict({
    conflicts,
    metrics,
    metricKey,
    code,
    severity = "error",
    message,
    resourcePath,
    resourceType,
    identifierName,
    details,
    includeSuggestions = true,
    suggestions
}) {
    const scope = {
        id: resourcePath,
        displayName: `${resourceType}.${identifierName}`
    };

    const resolvedSuggestions =
        suggestions === undefined
            ? includeSuggestions && isNonEmptyString(identifierName)
                ? buildAssetConflictSuggestions(identifierName)
                : null
            : suggestions;

    const conflict = {
        code,
        severity,
        message,
        scope,
        identifier: identifierName
    };

    if (details !== undefined) {
        conflict.details = details;
    }

    if (resolvedSuggestions && resolvedSuggestions.length > 0) {
        conflict.suggestions = resolvedSuggestions;
    }

    conflicts.push(createConflict(conflict));

    if (metricKey) {
        metrics?.incrementCounter(metricKey);
    }
}

function recordAssetRenameCollision({
    conflicts,
    renameEntry,
    conflictingEntries,
    message,
    metrics
}) {
    pushAssetRenameConflict({
        conflicts,
        metrics,
        metricKey: "assets.collisionConflicts",
        code: COLLISION_CONFLICT_CODE,
        message,
        resourcePath: renameEntry.resourcePath,
        resourceType: renameEntry.resourceType,
        identifierName: renameEntry.originalName,
        details: {
            targetName: renameEntry.finalName,
            conflicts: mapRenameConflictDetails(conflictingEntries)
        }
    });
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
        const list = getOrCreateMapEntry(directories, directory, () => []);
        list.push({
            directory,
            resourcePath,
            resourceType: resourceRecord.resourceType,
            originalName: resourceRecord.name,
            finalName,
            isRename: Boolean(rename),
            rename
        });
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
            const key = toNormalizedLowerCaseString(entry.finalName);
            const bucket = getOrCreateMapEntry(byLowerName, key, () => []);
            bucket.push(entry);
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

        pushAssetRenameConflict({
            conflicts,
            metrics,
            metricKey: "assets.reservedConflicts",
            code: RESERVED_CONFLICT_CODE,
            message: `Renaming '${rename.fromName}' to '${rename.toName}' conflicts with reserved identifier '${rename.toName}'.`,
            resourcePath: rename.resourcePath,
            resourceType: rename.resourceType,
            identifierName: rename.fromName,
            details: {
                targetName: rename.toName
            }
        });
    }

    return conflicts;
}

function summarizeReferences(referenceMutations, resourcePath) {
    const includeFilePaths = isNonEmptyString(resourcePath)
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
            const message = formatConfigurationConflictMessage({
                configConflict,
                identifierName: originalName,
                noun: "Asset"
            });

            pushAssetRenameConflict({
                conflicts,
                code: configConflict.code,
                severity: "info",
                message,
                resourcePath,
                resourceType: resourceRecord.resourceType,
                identifierName: originalName,
                includeSuggestions: false
            });
            continue;
        }

        const directory = path.posix.dirname(resourcePath);
        const collisionKey = `${directory}|${convertedName.toLowerCase()}`;
        if (namesByDirectory.has(collisionKey)) {
            pushAssetRenameConflict({
                conflicts,
                metrics,
                metricKey: "assets.collisionConflicts",
                code: COLLISION_CONFLICT_CODE,
                message: `Renaming '${originalName}' to '${convertedName}' collides with existing asset '${
                    namesByDirectory.get(collisionKey).name
                }'.`,
                resourcePath,
                resourceType: resourceRecord.resourceType,
                identifierName: originalName,
                includeSuggestions: false
            });
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
