import path from "node:path";

import { formatIdentifierCase } from "../../../shared/identifier-case.js";
import { toPosixPath } from "../../../shared/path-utils.js";
import { createMetricsTracker } from "../../../shared/metrics.js";
import { buildLocationKey } from "../../../shared/location-keys.js";
import { isNonEmptyString } from "../../../shared/string-utils.js";
import { isObjectLike } from "../../../shared/object-utils.js";
import { normalizeIdentifierCaseOptions } from "../options/identifier-case.js";
import { peekIdentifierCaseDryRunContext } from "../reporting/identifier-case-context.js";
import {
    bootstrapProjectIndex,
    applyBootstrappedProjectIndex
} from "../project-index/bootstrap.js";
import { setIdentifierCaseOption } from "./option-store.js";
import {
    COLLISION_CONFLICT_CODE,
    PRESERVE_CONFLICT_CODE,
    IGNORE_CONFLICT_CODE,
    buildPatternMatchers,
    resolveIdentifierConfigurationConflict,
    createConflict,
    incrementFileOccurrence,
    summarizeFileOccurrences
} from "./common.js";
import { planAssetRenames, applyAssetRenames } from "./asset-renames.js";

function resolveRelativeFilePath(projectRoot, absoluteFilePath) {
    if (!isNonEmptyString(absoluteFilePath)) {
        return null;
    }

    const resolvedFile = path.resolve(absoluteFilePath);

    if (isNonEmptyString(projectRoot)) {
        const resolvedRoot = path.resolve(projectRoot);
        return toPosixPath(path.relative(resolvedRoot, resolvedFile));
    }

    return toPosixPath(resolvedFile);
}

function buildRenameKey(_scopeId, location) {
    const locationKey = buildLocationKey(location);
    if (!locationKey) {
        return null;
    }

    return locationKey;
}

function createScopeGroupingKey(scopeId, fallback) {
    if (isNonEmptyString(scopeId)) {
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
        incrementFileOccurrence(counts, reference?.filePath, relativeFilePath);
    }

    return summarizeFileOccurrences(counts);
}

export async function prepareIdentifierCasePlan(options) {
    if (!options) {
        return;
    }

    if (
        options.__identifierCaseDryRun === undefined &&
        options.identifierCaseDryRun !== undefined
    ) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseDryRun",
            options.identifierCaseDryRun
        );
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
        setIdentifierCaseOption(
            options,
            "__identifierCaseDryRun",
            context.dryRun
        );
    }
    applyBootstrappedProjectIndex(options, setIdentifierCaseOption);

    let projectIndex =
        options.__identifierCaseProjectIndex ??
        options.identifierCaseProjectIndex ??
        context?.projectIndex ??
        null;

    const logger = options.logger ?? null;
    const metrics = createMetricsTracker({
        category: "identifier-case-plan",
        logger,
        autoLog: options.logIdentifierCaseMetrics === true
    });
    setIdentifierCaseOption(options, "__identifierCaseMetrics", metrics);
    const stopTotal = metrics.startTimer("preparePlan");
    // Scripts, macros, enums, globals, and instance assignments are now tracked via
    // `projectIndex.identifiers` with dedicated identifier IDs per scope. Local-scope
    // renaming remains the only executed transformation until the scope toggles
    // (e.g. gmlIdentifierCaseFunctions, gmlIdentifierCaseMacros, etc.) are
    // connected to the rename planner. Future stages will consult these per-scope
    // buckets to respect collisions before enabling the additional conversions.

    const normalizedOptions = normalizeIdentifierCaseOptions(options);
    const localStyle = normalizedOptions.scopeStyles?.locals ?? "off";
    const assetStyle = normalizedOptions.scopeStyles?.assets ?? "off";

    const shouldPlanLocals = localStyle !== "off";
    const shouldPlanAssets = assetStyle !== "off";

    if (!projectIndex && (shouldPlanLocals || shouldPlanAssets)) {
        await bootstrapProjectIndex(options, setIdentifierCaseOption);
        projectIndex =
            applyBootstrappedProjectIndex(options, setIdentifierCaseOption) ??
            options.identifierCaseProjectIndex ??
            context?.projectIndex ??
            null;
    }

    metrics.setMetadata("localStyle", localStyle);
    metrics.setMetadata("assetStyle", assetStyle);

    const preservedSet = new Set(normalizedOptions.preservedIdentifiers ?? []);
    const ignoreMatchers = buildPatternMatchers(
        normalizedOptions.ignorePatterns ?? []
    );

    const finalizeMetrics = (extraMetadata = {}) => {
        stopTotal();
        const report = metrics.finalize({ metadata: extraMetadata });
        setIdentifierCaseOption(
            options,
            "__identifierCaseMetricsReport",
            report
        );
        return report;
    };

    const renameMap = new Map();
    const operations = [];
    const conflicts = [];
    const assetRenames = [];
    let assetConflicts = [];

    if (projectIndex && assetStyle !== "off") {
        metrics.incrementCounter("assets.projectsWithIndex");
        const assetPlan = metrics.timeSync("assets.plan", () =>
            planAssetRenames({
                projectIndex,
                assetStyle,
                preservedSet,
                ignoreMatchers,
                metrics
            })
        );
        operations.push(...assetPlan.operations);
        conflicts.push(...assetPlan.conflicts);
        assetRenames.push(...assetPlan.renames);
        assetConflicts = assetPlan.conflicts ?? [];
        metrics.incrementCounter(
            "assets.operations",
            assetPlan.operations.length
        );
        metrics.incrementCounter(
            "assets.conflicts",
            assetPlan.conflicts.length
        );
        metrics.incrementCounter("assets.renames", assetPlan.renames.length);
    }

    const hasLocalSupport =
        projectIndex && projectIndex.files && localStyle !== "off";

    if (hasLocalSupport) {
        metrics.incrementCounter("locals.supportedFiles");
    }

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
        setIdentifierCaseOption(
            options,
            "__identifierCaseRenameMap",
            renameMap
        );
        if (assetRenames.length > 0) {
            setIdentifierCaseOption(
                options,
                "__identifierCaseAssetRenames",
                assetRenames
            );
        }

        const metricsReport = finalizeMetrics({
            resolvedFile: Boolean(fileRecord),
            relativeFilePath
        });

        if (operations.length === 0 && conflicts.length === 0) {
            // no-op
        } else {
            setIdentifierCaseOption(options, "__identifierCaseRenamePlan", {
                operations
            });
            setIdentifierCaseOption(
                options,
                "__identifierCaseConflicts",
                conflicts
            );
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
            setIdentifierCaseOption(
                options,
                "__identifierCaseAssetRenameResult",
                result
            );
            setIdentifierCaseOption(
                options,
                "__identifierCaseAssetRenamesApplied",
                true
            );
            metrics.incrementCounter(
                "assets.appliedRenames",
                result?.renames?.length ?? 0
            );
        }
        setIdentifierCaseOption(
            options,
            "__identifierCasePlanGeneratedInternally",
            true
        );
        if (options.__identifierCaseRenamePlan) {
            options.__identifierCaseRenamePlan.metrics = metricsReport;
        }
        return;
    }

    const existingNamesByScope = new Map();
    for (const declaration of fileRecord.declarations ?? []) {
        if (!declaration || !declaration.name) {
            continue;
        }

        metrics.incrementCounter("locals.declarationsScanned");

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

        metrics.incrementCounter("locals.referencesScanned");

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

        metrics.incrementCounter("locals.declarationCandidates");

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

        const configConflict = resolveIdentifierConfigurationConflict({
            preservedSet,
            identifierName: declaration.name,
            ignoreMatchers,
            filePath: relativeFilePath
        });

        if (configConflict) {
            metrics.incrementCounter("locals.configurationConflicts");
            const scopeDescriptor = createScopeDescriptor(
                projectIndex,
                fileRecord,
                declaration.scopeId
            );

            let message;
            switch (configConflict.code) {
                case PRESERVE_CONFLICT_CODE: {
                    message = `Identifier '${declaration.name}' is preserved by configuration.`;
                    break;
                }
                case IGNORE_CONFLICT_CODE: {
                    message = `Identifier '${declaration.name}' matches ignore pattern '${configConflict.ignoreMatch}'.`;
                    break;
                }
                default: {
                    message = `Identifier '${declaration.name}' cannot be renamed due to configuration.`;
                }
            }

            conflicts.push(
                createConflict({
                    code: configConflict.code,
                    severity: "info",
                    message,
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
            metrics.incrementCounter("locals.collisionConflicts");
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
        metrics.incrementCounter("locals.candidatesAccepted");
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
                    metrics.incrementCounter("locals.collisionConflicts");
                }
                continue;
            }

            appliedCandidates.push(groupedCandidates[0]);
            metrics.incrementCounter("locals.candidatesApplied");
        }
    }

    for (const candidate of appliedCandidates) {
        metrics.incrementCounter("locals.operations", 1);
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
            metrics.incrementCounter("locals.renameMapEntries");
        }

        for (const reference of references) {
            const referenceKey = buildRenameKey(
                reference.scopeId,
                reference.start
            );
            if (referenceKey) {
                renameMap.set(referenceKey, convertedName);
                metrics.incrementCounter("locals.renameMapEntries");
            }
        }
    }

    setIdentifierCaseOption(options, "__identifierCaseRenameMap", renameMap);
    if (assetRenames.length > 0) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseAssetRenames",
            assetRenames
        );
    }

    if (operations.length === 0 && conflicts.length === 0) {
        setIdentifierCaseOption(
            options,
            "__identifierCasePlanGeneratedInternally",
            true
        );
    } else {
        setIdentifierCaseOption(options, "__identifierCaseRenamePlan", {
            operations
        });
        setIdentifierCaseOption(
            options,
            "__identifierCaseConflicts",
            conflicts
        );
        setIdentifierCaseOption(
            options,
            "__identifierCasePlanGeneratedInternally",
            true
        );
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
        setIdentifierCaseOption(
            options,
            "__identifierCaseAssetRenameResult",
            result
        );
        setIdentifierCaseOption(
            options,
            "__identifierCaseAssetRenamesApplied",
            true
        );
        metrics.incrementCounter(
            "assets.appliedRenames",
            result?.renames?.length ?? 0
        );
    }

    const metricsReport = finalizeMetrics({
        resolvedFile: Boolean(fileRecord),
        relativeFilePath,
        operationCount: operations.length,
        conflictCount: conflicts.length,
        renameEntries: renameMap.size
    });

    if (options.__identifierCaseRenamePlan) {
        options.__identifierCaseRenamePlan.metrics = metricsReport;
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

    const renameTarget = renameMap.get(key) ?? null;
    if (!renameTarget) {
        return null;
    }

    const planSnapshot = options.__identifierCasePlanSnapshot ?? null;

    if (options.__identifierCaseDryRun === true) {
        return null;
    }

    if (planSnapshot?.dryRun === true) {
        return null;
    }

    return renameTarget;
}

export function captureIdentifierCasePlanSnapshot(options) {
    if (!isObjectLike(options)) {
        return null;
    }

    const snapshot = {
        projectIndex: options.__identifierCaseProjectIndex ?? null,
        projectRoot: options.__identifierCaseProjectRoot ?? null,
        bootstrap: options.__identifierCaseProjectIndexBootstrap ?? null,
        renameMap: options.__identifierCaseRenameMap ?? null,
        renamePlan: options.__identifierCaseRenamePlan ?? null,
        conflicts: options.__identifierCaseConflicts ?? null,
        metricsReport: options.__identifierCaseMetricsReport ?? null,
        metrics: options.__identifierCaseMetrics ?? null,
        assetRenames: options.__identifierCaseAssetRenames ?? null,
        assetRenameResult: options.__identifierCaseAssetRenameResult ?? null,
        assetRenamesApplied:
            options.__identifierCaseAssetRenamesApplied ?? null,
        dryRun:
            options.__identifierCaseDryRun !== undefined
                ? options.__identifierCaseDryRun
                : null,
        planGenerated: options.__identifierCasePlanGeneratedInternally === true
    };

    return snapshot;
}

export function applyIdentifierCasePlanSnapshot(snapshot, options) {
    if (!snapshot || !isObjectLike(options)) {
        return;
    }

    if (snapshot.projectIndex && !options.__identifierCaseProjectIndex) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseProjectIndex",
            snapshot.projectIndex
        );
    }

    if (snapshot.projectRoot && !options.__identifierCaseProjectRoot) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseProjectRoot",
            snapshot.projectRoot
        );
    }

    if (snapshot.bootstrap && !options.__identifierCaseProjectIndexBootstrap) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseProjectIndexBootstrap",
            snapshot.bootstrap
        );
    }

    setIdentifierCaseOption(options, "__identifierCasePlanSnapshot", snapshot);
    Object.defineProperty(options, "__identifierCasePlanSnapshot", {
        value: snapshot,
        writable: true,
        configurable: true,
        enumerable: false
    });

    if (snapshot.renameMap && !options.__identifierCaseRenameMap) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseRenameMap",
            snapshot.renameMap
        );
    }

    if (snapshot.renamePlan && !options.__identifierCaseRenamePlan) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseRenamePlan",
            snapshot.renamePlan
        );
    }

    if (snapshot.conflicts && !options.__identifierCaseConflicts) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseConflicts",
            snapshot.conflicts
        );
    }

    if (snapshot.metricsReport && !options.__identifierCaseMetricsReport) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseMetricsReport",
            snapshot.metricsReport
        );
    }

    if (snapshot.metrics && !options.__identifierCaseMetrics) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseMetrics",
            snapshot.metrics
        );
    }

    if (snapshot.assetRenames && !options.__identifierCaseAssetRenames) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseAssetRenames",
            snapshot.assetRenames
        );
    }

    if (
        snapshot.assetRenameResult &&
        !options.__identifierCaseAssetRenameResult
    ) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseAssetRenameResult",
            snapshot.assetRenameResult
        );
    }

    if (
        snapshot.assetRenamesApplied != null &&
        options.__identifierCaseAssetRenamesApplied == null
    ) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseAssetRenamesApplied",
            snapshot.assetRenamesApplied
        );
    }

    if (snapshot.dryRun !== null) {
        setIdentifierCaseOption(
            options,
            "__identifierCaseDryRun",
            snapshot.dryRun
        );
        Object.defineProperty(options, "__identifierCaseDryRun", {
            value: snapshot.dryRun,
            writable: true,
            configurable: true,
            enumerable: false
        });
    }

    if (snapshot.planGenerated) {
        setIdentifierCaseOption(
            options,
            "__identifierCasePlanGeneratedInternally",
            true
        );
    }
}
