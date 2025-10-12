import path from "node:path";

import { formatIdentifierCase } from "../../../shared/identifier-case.js";
import { normalizeIdentifierCaseOptions } from "../options/identifier-case.js";
import { peekIdentifierCaseDryRunContext } from "../reporting/identifier-case-context.js";
import {
    COLLISION_CONFLICT_CODE,
    PRESERVE_CONFLICT_CODE,
    IGNORE_CONFLICT_CODE,
    buildPatternMatchers,
    matchesIgnorePattern,
    createConflict
} from "./common.js";
import { planAssetRenames, applyAssetRenames } from "../assets/rename.js";

function toPosixPath(filePath) {
    if (typeof filePath !== "string" || filePath.length === 0) {
        return "";
    }

    return filePath.replace(/\\+/g, "/");
}

function resolveRelativeFilePath(projectRoot, absoluteFilePath) {
    if (typeof absoluteFilePath !== "string" || absoluteFilePath.length === 0) {
        return null;
    }

    const resolvedFile = path.resolve(absoluteFilePath);

    if (typeof projectRoot === "string" && projectRoot.length > 0) {
        const resolvedRoot = path.resolve(projectRoot);
        return toPosixPath(path.relative(resolvedRoot, resolvedFile));
    }

    return toPosixPath(resolvedFile);
}

function buildLocationKey(location) {
    if (!location || typeof location !== "object") {
        return null;
    }

    const line = location.line ?? location.row ?? location.start ?? null;
    const column =
        location.column ?? location.col ?? location.columnStart ?? null;
    const index = location.index ?? location.offset ?? null;

    if (line == null && column == null && index == null) {
        return null;
    }

    return [line ?? "", column ?? "", index ?? ""].join(":");
}

function buildRenameKey(_scopeId, location) {
    const locationKey = buildLocationKey(location);
    if (!locationKey) {
        return null;
    }

    return locationKey;
}

function createScopeGroupingKey(scopeId, fallback) {
    if (scopeId && typeof scopeId === "string") {
        return scopeId;
    }

    return fallback ?? "<unknown>";
}

function createScopeDescriptor(projectIndex, fileRecord, scopeId) {
    const fileScopeId = fileRecord?.scopeId ?? null;
    const scopeMap = projectIndex?.scopes ?? {};

    if (scopeId && scopeMap[scopeId]) {
        const scopeRecord = scopeMap[scopeId];
        return {
            id: scopeRecord.id,
            displayName:
                scopeRecord.displayName ?? scopeRecord.name ?? scopeRecord.id
        };
    }

    if (fileScopeId && scopeMap[fileScopeId]) {
        const parentScope = scopeMap[fileScopeId];
        return {
            id:
                scopeId ??
                parentScope.id ??
                `locals:${fileRecord?.filePath ?? "<unknown>"}`,
            displayName: `${parentScope.displayName ?? parentScope.name ?? fileRecord?.filePath ?? "<locals>"} (locals)`
        };
    }

    const filePath = fileRecord?.filePath ?? "<unknown>";
    return {
        id: scopeId ?? `locals:${filePath}`,
        displayName: `locals@${filePath}`
    };
}

function summarizeReferencesByFile(relativeFilePath, references) {
    const counts = new Map();

    for (const reference of references ?? []) {
        const filePath = reference?.filePath ?? relativeFilePath;
        const key = filePath ?? "<unknown>";
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return Array.from(counts.entries()).map(([filePath, occurrences]) => ({
        filePath,
        occurrences
    }));
}

export function prepareIdentifierCasePlan(options) {
    if (!options) {
        return;
    }

    if (
        options.__identifierCaseDryRun === undefined &&
        options.identifierCaseDryRun !== undefined
    ) {
        options.__identifierCaseDryRun = options.identifierCaseDryRun;
    }

    if (options.__identifierCasePlanGeneratedInternally === true) {
        return;
    }

    if (
        options.__identifierCaseRenamePlan &&
        options.__identifierCasePlanGeneratedInternally !== true
    ) {
        return;
    }

    const context = peekIdentifierCaseDryRunContext(options.filepath ?? null);
    if (
        options.__identifierCaseDryRun === undefined &&
        context &&
        typeof context.dryRun === "boolean"
    ) {
        options.__identifierCaseDryRun = context.dryRun;
    }
    const projectIndex =
        options.__identifierCaseProjectIndex ??
        options.identifierCaseProjectIndex ??
        context?.projectIndex ??
        null;
    // Scripts, macros, enums, globals, and instance assignments are now tracked via
    // `projectIndex.identifiers`. Local-scope renaming remains the only executed
    // transformation here until per-scope toggles are wired through.

    const normalizedOptions = normalizeIdentifierCaseOptions(options);
    const localStyle = normalizedOptions.scopeStyles?.locals ?? "off";
    const assetStyle = normalizedOptions.scopeStyles?.assets ?? "off";

    const preservedSet = new Set(normalizedOptions.preservedIdentifiers ?? []);
    const ignoreMatchers = buildPatternMatchers(
        normalizedOptions.ignorePatterns ?? []
    );

    const renameMap = new Map();
    const operations = [];
    const conflicts = [];
    const assetRenames = [];
    let assetConflicts = [];

    if (projectIndex && assetStyle !== "off") {
        const assetPlan = planAssetRenames({
            projectIndex,
            assetStyle,
            preservedSet,
            ignoreMatchers
        });
        operations.push(...assetPlan.operations);
        conflicts.push(...assetPlan.conflicts);
        assetRenames.push(...assetPlan.renames);
        assetConflicts = assetPlan.conflicts ?? [];
    }

    const hasLocalSupport =
        projectIndex && projectIndex.files && localStyle !== "off";

    let fileRecord = null;
    let relativeFilePath = null;
    if (hasLocalSupport) {
        relativeFilePath = resolveRelativeFilePath(
            projectIndex.projectRoot,
            options.filepath ?? null
        );
        if (relativeFilePath && projectIndex.files[relativeFilePath]) {
            fileRecord = projectIndex.files[relativeFilePath];
        }
    }

    if (!fileRecord) {
        options.__identifierCaseRenameMap = renameMap;
        if (assetRenames.length > 0) {
            options.__identifierCaseAssetRenames = assetRenames;
        }
        if (
            options.__identifierCaseDryRun === false &&
            assetRenames.length > 0 &&
            assetConflicts.length === 0 &&
            projectIndex &&
            options.__identifierCaseAssetRenamesApplied !== true
        ) {
            const fsFacade =
                options.__identifierCaseFs ?? options.identifierCaseFs ?? null;
            const logger = options.logger ?? null;
            const result = applyAssetRenames({
                projectIndex,
                renames: assetRenames,
                fsFacade,
                logger
            });
            options.__identifierCaseAssetRenameResult = result;
            options.__identifierCaseAssetRenamesApplied = true;
        }
        options.__identifierCasePlanGeneratedInternally = true;
        return;
    }

    const existingNamesByScope = new Map();
    for (const declaration of fileRecord.declarations ?? []) {
        if (!declaration || !declaration.name) {
            continue;
        }

        const scopeKey = createScopeGroupingKey(
            declaration.scopeId,
            fileRecord.scopeId
        );
        const existing = existingNamesByScope.get(scopeKey) ?? new Set();
        existing.add(declaration.name);
        existingNamesByScope.set(scopeKey, existing);
    }

    const referencesByScopeAndName = new Map();
    for (const reference of fileRecord.references ?? []) {
        if (!reference || reference.isBuiltIn) {
            continue;
        }

        const classifications = Array.isArray(reference.classifications)
            ? reference.classifications
            : [];

        if (!classifications.includes("variable")) {
            continue;
        }

        const scopeKey = createScopeGroupingKey(
            reference.scopeId,
            fileRecord.scopeId
        );
        const key = `${scopeKey}|${reference.name}`;
        const list = referencesByScopeAndName.get(key) ?? [];
        list.push({
            ...reference,
            filePath: relativeFilePath
        });
        referencesByScopeAndName.set(key, list);
    }

    const activeCandidates = [];

    for (const declaration of fileRecord.declarations ?? []) {
        if (!declaration || declaration.isBuiltIn) {
            continue;
        }

        const classifications = Array.isArray(declaration.classifications)
            ? declaration.classifications
            : [];

        if (!classifications.includes("variable")) {
            continue;
        }

        if (classifications.includes("global")) {
            continue;
        }

        const renameKey = buildRenameKey(
            declaration.scopeId,
            declaration.start
        );
        if (!renameKey) {
            continue;
        }

        const convertedName = formatIdentifierCase(
            declaration.name,
            localStyle
        );

        if (convertedName === declaration.name) {
            continue;
        }

        if (preservedSet.has(declaration.name)) {
            const scopeDescriptor = createScopeDescriptor(
                projectIndex,
                fileRecord,
                declaration.scopeId
            );
            conflicts.push(
                createConflict({
                    code: PRESERVE_CONFLICT_CODE,
                    severity: "info",
                    message: `Identifier '${declaration.name}' is preserved by configuration.`,
                    scope: scopeDescriptor,
                    identifier: declaration.name
                })
            );
            continue;
        }

        const ignoreMatch = matchesIgnorePattern(
            ignoreMatchers,
            declaration.name,
            relativeFilePath
        );
        if (ignoreMatch) {
            const scopeDescriptor = createScopeDescriptor(
                projectIndex,
                fileRecord,
                declaration.scopeId
            );
            conflicts.push(
                createConflict({
                    code: IGNORE_CONFLICT_CODE,
                    severity: "info",
                    message: `Identifier '${declaration.name}' matches ignore pattern '${ignoreMatch}'.`,
                    scope: scopeDescriptor,
                    identifier: declaration.name
                })
            );
            continue;
        }

        const scopeGroupKey = createScopeGroupingKey(
            declaration.scopeId,
            fileRecord.scopeId
        );
        const existingNames =
            existingNamesByScope.get(scopeGroupKey) ?? new Set();

        if (
            existingNames.has(convertedName) &&
            convertedName !== declaration.name
        ) {
            const scopeDescriptor = createScopeDescriptor(
                projectIndex,
                fileRecord,
                declaration.scopeId
            );
            conflicts.push(
                createConflict({
                    code: COLLISION_CONFLICT_CODE,
                    severity: "error",
                    message: `Renaming '${declaration.name}' to '${convertedName}' collides with existing identifier '${convertedName}'.`,
                    scope: scopeDescriptor,
                    identifier: declaration.name
                })
            );
            continue;
        }
        const referenceKey = `${scopeGroupKey}|${declaration.name}`;
        const relatedReferences =
            referencesByScopeAndName.get(referenceKey) ?? [];

        activeCandidates.push({
            declaration,
            convertedName,
            references: relatedReferences,
            scopeGroupKey
        });
    }

    const candidatesByScope = new Map();
    for (const candidate of activeCandidates) {
        const scopeCandidates =
            candidatesByScope.get(candidate.scopeGroupKey) ?? new Map();
        const existing = scopeCandidates.get(candidate.convertedName) ?? [];
        existing.push(candidate);
        scopeCandidates.set(candidate.convertedName, existing);
        candidatesByScope.set(candidate.scopeGroupKey, scopeCandidates);
    }

    const appliedCandidates = [];
    for (const [, nameMap] of candidatesByScope.entries()) {
        for (const [convertedName, groupedCandidates] of nameMap.entries()) {
            if (groupedCandidates.length > 1) {
                for (const candidate of groupedCandidates) {
                    const scopeDescriptor = createScopeDescriptor(
                        projectIndex,
                        fileRecord,
                        candidate.declaration.scopeId
                    );
                    const otherNames = groupedCandidates
                        .filter((other) => other !== candidate)
                        .map((other) => other.declaration.name);
                    conflicts.push(
                        createConflict({
                            code: COLLISION_CONFLICT_CODE,
                            severity: "error",
                            message: `Renaming '${candidate.declaration.name}' to '${convertedName}' collides with ${otherNames
                                .map((name) => `'${name}'`)
                                .join(", ")}.`,
                            scope: scopeDescriptor,
                            identifier: candidate.declaration.name
                        })
                    );
                }
                continue;
            }

            appliedCandidates.push(groupedCandidates[0]);
        }
    }

    for (const candidate of appliedCandidates) {
        const { declaration, convertedName, references } = candidate;
        const scopeDescriptor = createScopeDescriptor(
            projectIndex,
            fileRecord,
            declaration.scopeId
        );

        const referenceSummaries = summarizeReferencesByFile(
            relativeFilePath,
            references
        );

        operations.push({
            id: `local:${scopeDescriptor.id ?? candidate.scopeGroupKey}:${declaration.name}`,
            kind: "identifier",
            scope: {
                id: scopeDescriptor.id,
                displayName: scopeDescriptor.displayName
            },
            from: { name: declaration.name },
            to: { name: convertedName },
            references: referenceSummaries
        });

        const declarationKey = buildRenameKey(
            declaration.scopeId,
            declaration.start
        );
        if (declarationKey) {
            renameMap.set(declarationKey, convertedName);
        }

        for (const reference of references) {
            const referenceKey = buildRenameKey(
                reference.scopeId,
                reference.start
            );
            if (referenceKey) {
                renameMap.set(referenceKey, convertedName);
            }
        }
    }

    options.__identifierCaseRenameMap = renameMap;
    if (assetRenames.length > 0) {
        options.__identifierCaseAssetRenames = assetRenames;
    }

    if (operations.length === 0 && conflicts.length === 0) {
        options.__identifierCasePlanGeneratedInternally = true;
    } else {
        options.__identifierCaseRenamePlan = { operations };
        options.__identifierCaseConflicts = conflicts;
        options.__identifierCasePlanGeneratedInternally = true;
    }

    if (
        options.__identifierCaseDryRun === false &&
        assetRenames.length > 0 &&
        assetConflicts.length === 0 &&
        projectIndex &&
        options.__identifierCaseAssetRenamesApplied !== true
    ) {
        const fsFacade =
            options.__identifierCaseFs ?? options.identifierCaseFs ?? null;
        const logger = options.logger ?? null;
        const result = applyAssetRenames({
            projectIndex,
            renames: assetRenames,
            fsFacade,
            logger
        });
        options.__identifierCaseAssetRenameResult = result;
        options.__identifierCaseAssetRenamesApplied = true;
    }
}

export function getIdentifierCaseRenameForNode(node, options) {
    if (!node || !options) {
        return null;
    }

    const renameMap = options.__identifierCaseRenameMap;
    if (!(renameMap instanceof Map)) {
        return null;
    }

    const key = buildRenameKey(node.scopeId ?? null, node.start ?? null);
    if (!key) {
        return null;
    }

    return renameMap.get(key) ?? null;
}
