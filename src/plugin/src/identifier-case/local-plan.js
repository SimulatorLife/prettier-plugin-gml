import path from "node:path";

import { formatIdentifierCase } from "./identifier-case-utils.js";
import { asArray } from "../../../shared/array-utils.js";
import { toPosixPath } from "../../../shared/path-utils.js";
import { createMetricsTracker } from "../reporting/metrics-tracker.js";
import { buildLocationKey } from "../../../shared/location-keys.js";
import {
    isNonEmptyString,
    getNonEmptyString
} from "../../../shared/string-utils.js";
import { isObjectLike, withObjectLike } from "../../../shared/object-utils.js";
import {
    normalizeIdentifierCaseOptions,
    IdentifierCaseStyle
} from "../options/identifier-case.js";
import { peekIdentifierCaseDryRunContext } from "./identifier-case-context.js";
import {
    applyBootstrappedIdentifierCaseProjectIndex,
    ensureIdentifierCaseProjectIndex,
    resolveIdentifierCaseProjectIndex
} from "./project-index-gateway.js";
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

function getEntryDeclarations(entry) {
    return asArray(entry?.declarations);
}

function getEntityClassifications(entity) {
    return asArray(entity?.classifications);
}

function getEntryDeclarationKinds(entry) {
    return asArray(entry?.declarationKinds);
}

function applyAssetRenamesIfEligible({
    options,
    projectIndex,
    assetRenames,
    assetConflicts,
    metrics
}) {
    if (options.__identifierCaseDryRun !== false) {
        return;
    }

    if (assetRenames.length === 0) {
        return;
    }

    if ((assetConflicts ?? []).length > 0) {
        return;
    }

    if (!projectIndex) {
        return;
    }

    if (options.__identifierCaseAssetRenamesApplied === true) {
        return;
    }

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

function getObjectValues(object) {
    if (!isObjectLike(object)) {
        return [];
    }
    return Object.values(object);
}

function resolveIdentifierEntryName(entry) {
    if (!isObjectLike(entry)) {
        return null;
    }

    const declarations = getEntryDeclarations(entry);
    for (const declaration of declarations) {
        const declarationName = getNonEmptyString(declaration?.name);
        if (declarationName) {
            return declarationName;
        }
    }

    const entryName = getNonEmptyString(entry?.name);
    if (entryName) {
        return entryName;
    }

    const displayName = getNonEmptyString(entry?.displayName);
    if (displayName) {
        return displayName;
    }

    return null;
}

function extractDeclarationClassifications(entry) {
    const tags = new Set();
    const declarations = getEntryDeclarations(entry);

    for (const declaration of declarations) {
        const classifications = getEntityClassifications(declaration);
        for (const tag of classifications) {
            if (tag) {
                tags.add(tag);
            }
        }
    }

    const declarationKinds = getEntryDeclarationKinds(entry);
    for (const tag of declarationKinds) {
        if (tag) {
            tags.add(tag);
        }
    }

    return tags;
}

function isStructScriptEntry(entry) {
    const tags = extractDeclarationClassifications(entry);
    if (tags.size === 0) {
        return false;
    }
    return tags.has("constructor") || tags.has("struct");
}

function isFunctionScriptEntry(entry) {
    const tags = extractDeclarationClassifications(entry);
    if (tags.size === 0) {
        return false;
    }
    if (tags.has("constructor") || tags.has("struct")) {
        return false;
    }
    return tags.has("script") || tags.has("function");
}

function summarizeReferencesAcrossFiles(references) {
    const counts = new Map();

    for (const reference of references ?? []) {
        incrementFileOccurrence(counts, reference?.filePath ?? null, null);
    }

    return summarizeFileOccurrences(counts);
}

function getDeclarationFilePath(entry) {
    for (const declaration of entry?.declarations ?? []) {
        if (typeof declaration?.filePath === "string") {
            return declaration.filePath;
        }
    }
    return null;
}

function getReferenceLocation(reference) {
    if (!isObjectLike(reference)) {
        return null;
    }
    if (reference.start) {
        return reference.start;
    }
    if (reference.location?.start) {
        return reference.location.start;
    }
    return null;
}

function createTopLevelScopeDescriptor(projectIndex, entry, fallbackKey) {
    const scopeMap = projectIndex?.scopes ?? {};
    const declarations = getEntryDeclarations(entry);

    for (const declaration of declarations) {
        const scopeId = declaration?.scopeId ?? entry?.scopeId ?? null;
        if (scopeId && scopeMap[scopeId]) {
            const scopeRecord = scopeMap[scopeId];
            return {
                id: scopeRecord.id,
                displayName:
                    scopeRecord.displayName ??
                    scopeRecord.name ??
                    scopeRecord.id
            };
        }
    }

    const scopeId = entry?.scopeId ?? null;
    if (scopeId && scopeMap[scopeId]) {
        const scopeRecord = scopeMap[scopeId];
        return {
            id: scopeRecord.id,
            displayName:
                scopeRecord.displayName ?? scopeRecord.name ?? scopeRecord.id
        };
    }

    const identifierKey =
        entry?.identifierId ?? entry?.id ?? entry?.key ?? entry?.name ?? "";
    return {
        id: `${fallbackKey}:${identifierKey}`,
        displayName: fallbackKey
    };
}

const SCOPE_TYPE_LABELS = Object.freeze({
    functions: "function",
    structs: "struct constructor",
    macros: "macro",
    globals: "global variable",
    instance: "instance variable"
});

function describeScopeType(scopeType) {
    return SCOPE_TYPE_LABELS[scopeType] ?? scopeType;
}

function createNameCollisionTracker() {
    const entriesByName = new Map();
    const entriesById = new Map();

    const toKey = (name) =>
        typeof name === "string" ? name.toLowerCase() : "";

    const addRecord = (record) => {
        const key = toKey(record.name);
        if (!entriesByName.has(key)) {
            entriesByName.set(key, []);
        }
        entriesByName.get(key).push(record);
        entriesById.set(record.uniqueId, record);
    };

    return {
        registerExisting(scopeType, uniqueId, name, metadata) {
            if (!name || !uniqueId) {
                return;
            }
            addRecord({
                scopeType,
                uniqueId,
                name,
                metadata,
                isPlanned: false
            });
        },
        removeExisting(uniqueId) {
            if (!uniqueId || !entriesById.has(uniqueId)) {
                return null;
            }
            const record = entriesById.get(uniqueId);
            entriesById.delete(uniqueId);
            const key = toKey(record.name);
            const bucket = entriesByName.get(key);
            if (bucket) {
                const index = bucket.findIndex(
                    (existing) => existing.uniqueId === uniqueId
                );
                if (index !== -1) {
                    bucket.splice(index, 1);
                }
                if (bucket.length === 0) {
                    entriesByName.delete(key);
                }
            }
            return record;
        },
        registerCandidate(scopeType, uniqueId, name, metadata) {
            if (!name || !uniqueId) {
                return [];
            }
            const key = toKey(name);
            const bucket = entriesByName.get(key) ?? [];
            const collisions = bucket.filter(
                (existing) => existing.uniqueId !== uniqueId
            );

            if (collisions.length === 0) {
                addRecord({
                    scopeType,
                    uniqueId,
                    name,
                    metadata,
                    isPlanned: true
                });
            }

            return collisions;
        }
    };
}

function createCrossScopeCollisionConflict({
    scopeType,
    currentName,
    convertedName,
    collisions,
    scopeDescriptor
}) {
    const scopeLabel = describeScopeType(scopeType);
    const otherDescriptions = collisions
        .map((collision) => {
            const otherLabel = describeScopeType(collision.scopeType);
            const otherName =
                collision.metadata?.currentName ??
                collision.metadata?.entry?.name ??
                collision.name ??
                convertedName;
            return `${otherLabel} '${otherName}'`;
        })
        .join(", ");

    const message = `Renaming ${scopeLabel} '${currentName}' to '${convertedName}' collides with existing ${otherDescriptions}. Adjust your identifier case configuration or rename the conflicting identifiers before retrying.`;

    return createConflict({
        code: COLLISION_CONFLICT_CODE,
        severity: "error",
        message,
        scope: scopeDescriptor,
        identifier: currentName
    });
}

function planIdentifierRenamesForScope({
    scopeType,
    entries,
    style,
    projectIndex,
    preservedSet,
    ignoreMatchers,
    renameMap,
    operations,
    conflicts,
    metrics,
    collisionTracker
}) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return;
    }

    if (style === IdentifierCaseStyle.OFF) {
        return;
    }

    for (const entry of entries) {
        const currentName = resolveIdentifierEntryName(entry);
        if (typeof currentName !== "string" || currentName.length === 0) {
            continue;
        }

        const declarations = getEntryDeclarations(entry);
        if (declarations.length === 0) {
            continue;
        }

        const convertedName = formatIdentifierCase(currentName, style);
        if (convertedName === currentName || !convertedName) {
            continue;
        }

        const filePath = getDeclarationFilePath(entry);
        const configConflict = resolveIdentifierConfigurationConflict({
            preservedSet,
            identifierName: currentName,
            ignoreMatchers,
            filePath
        });

        const scopeDescriptor = createTopLevelScopeDescriptor(
            projectIndex,
            entry,
            scopeType
        );

        const uniqueKey = `${scopeType}:${
            entry?.identifierId ?? entry?.id ?? entry?.key ?? currentName
        }`;

        if (configConflict) {
            let message;
            switch (configConflict.code) {
                case PRESERVE_CONFLICT_CODE: {
                    message = `Identifier '${currentName}' is preserved by configuration.`;
                    break;
                }
                case IGNORE_CONFLICT_CODE: {
                    message = `Identifier '${currentName}' matches ignore pattern '${configConflict.ignoreMatch}'.`;
                    break;
                }
                default: {
                    message = `Identifier '${currentName}' cannot be renamed due to configuration.`;
                }
            }

            conflicts.push(
                createConflict({
                    code: configConflict.code,
                    severity: "info",
                    message,
                    scope: scopeDescriptor,
                    identifier: currentName
                })
            );
            metrics?.incrementCounter(`${scopeType}.configurationConflicts`, 1);
            continue;
        }

        const removedRecord = collisionTracker.removeExisting(uniqueKey);
        const collisions = collisionTracker.registerCandidate(
            scopeType,
            uniqueKey,
            convertedName,
            { entry, currentName }
        );

        if (collisions.length > 0) {
            if (removedRecord) {
                collisionTracker.registerExisting(
                    removedRecord.scopeType,
                    removedRecord.uniqueId,
                    removedRecord.name,
                    removedRecord.metadata
                );
            }

            conflicts.push(
                createCrossScopeCollisionConflict({
                    scopeType,
                    currentName,
                    convertedName,
                    collisions,
                    scopeDescriptor
                })
            );
            metrics?.incrementCounter(`${scopeType}.collisionConflicts`, 1);
            continue;
        }

        const referenceSummaries = summarizeReferencesAcrossFiles(
            entry.references
        );

        operations.push({
            id: `${scopeType}:${entry?.identifierId ?? entry?.id ?? currentName}`,
            kind: "identifier",
            scope: scopeDescriptor,
            from: { name: currentName },
            to: { name: convertedName },
            references: referenceSummaries
        });
        metrics?.incrementCounter(`${scopeType}.operations`, 1);

        for (const declaration of declarations) {
            const renameKey = buildRenameKey(
                declaration?.scopeId ?? null,
                declaration?.start ?? null
            );
            if (!renameKey) {
                continue;
            }
            renameMap.set(renameKey, convertedName);
            metrics?.incrementCounter(`${scopeType}.renameMapEntries`, 1);
        }

        for (const reference of entry.references ?? []) {
            const location = getReferenceLocation(reference);
            if (!location) {
                continue;
            }
            const renameKey = buildRenameKey(
                reference?.scopeId ?? null,
                location
            );
            if (!renameKey) {
                continue;
            }
            renameMap.set(renameKey, convertedName);
            metrics?.incrementCounter(`${scopeType}.renameMapEntries`, 1);
        }
    }
}

function planTopLevelIdentifierRenames({
    projectIndex,
    styles,
    preservedSet,
    ignoreMatchers,
    renameMap,
    operations,
    conflicts,
    metrics
}) {
    if (!projectIndex || !projectIndex.identifiers) {
        return;
    }

    const identifiers = projectIndex.identifiers;
    const scriptEntries = getObjectValues(identifiers.scripts);
    const functionEntries = scriptEntries.filter((entry) =>
        isFunctionScriptEntry(entry)
    );
    const structEntries = scriptEntries.filter((entry) =>
        isStructScriptEntry(entry)
    );
    const macroEntries = getObjectValues(identifiers.macros);
    const globalEntries = getObjectValues(identifiers.globalVariables);
    const instanceEntries = getObjectValues(identifiers.instanceVariables);

    const collisionTracker = createNameCollisionTracker();

    const registerEntries = (scopeType, entries) => {
        for (const entry of entries ?? []) {
            const name = resolveIdentifierEntryName(entry);
            if (!name) {
                continue;
            }
            const uniqueKey = `${scopeType}:${
                entry?.identifierId ?? entry?.id ?? entry?.key ?? name
            }`;
            collisionTracker.registerExisting(scopeType, uniqueKey, name, {
                entry,
                currentName: name
            });
        }
    };

    registerEntries("functions", functionEntries);
    registerEntries("structs", structEntries);
    registerEntries("macros", macroEntries);
    registerEntries("globals", globalEntries);
    registerEntries("instance", instanceEntries);

    planIdentifierRenamesForScope({
        scopeType: "functions",
        entries: functionEntries,
        style: styles.functions,
        projectIndex,
        preservedSet,
        ignoreMatchers,
        renameMap,
        operations,
        conflicts,
        metrics,
        collisionTracker
    });

    planIdentifierRenamesForScope({
        scopeType: "structs",
        entries: structEntries,
        style: styles.structs,
        projectIndex,
        preservedSet,
        ignoreMatchers,
        renameMap,
        operations,
        conflicts,
        metrics,
        collisionTracker
    });

    planIdentifierRenamesForScope({
        scopeType: "macros",
        entries: macroEntries,
        style: styles.macros,
        projectIndex,
        preservedSet,
        ignoreMatchers,
        renameMap,
        operations,
        conflicts,
        metrics,
        collisionTracker
    });

    planIdentifierRenamesForScope({
        scopeType: "globals",
        entries: globalEntries,
        style: styles.globals,
        projectIndex,
        preservedSet,
        ignoreMatchers,
        renameMap,
        operations,
        conflicts,
        metrics,
        collisionTracker
    });

    planIdentifierRenamesForScope({
        scopeType: "instance",
        entries: instanceEntries,
        style: styles.instance,
        projectIndex,
        preservedSet,
        ignoreMatchers,
        renameMap,
        operations,
        conflicts,
        metrics,
        collisionTracker
    });
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
    applyBootstrappedIdentifierCaseProjectIndex(options);

    let projectIndex = resolveIdentifierCaseProjectIndex(
        options,
        context?.projectIndex ?? null
    );

    const logger = options.logger ?? null;
    const metrics = createMetricsTracker({
        category: "identifier-case-plan",
        logger,
        autoLog: options.logIdentifierCaseMetrics === true
    });
    setIdentifierCaseOption(options, "__identifierCaseMetrics", metrics);
    const stopTotal = metrics.startTimer("preparePlan");
    // Scripts, macros, globals, structs, and instance assignments are tracked via
    // `projectIndex.identifiers`. The scope-specific toggles fan out through the
    // rename planner so we can generate dry-run diagnostics, collision reports,
    // and rename maps without mutating sources when the style is disabled.

    const normalizedOptions = normalizeIdentifierCaseOptions(options);
    const localStyle =
        normalizedOptions.scopeStyles?.locals ?? IdentifierCaseStyle.OFF;
    const assetStyle = normalizedOptions.scopeStyles?.assets ?? "off";
    const functionStyle = normalizedOptions.scopeStyles?.functions ?? "off";
    const structStyle = normalizedOptions.scopeStyles?.structs ?? "off";
    const macroStyle = normalizedOptions.scopeStyles?.macros ?? "off";
    const instanceStyle = normalizedOptions.scopeStyles?.instance ?? "off";
    const globalStyle = normalizedOptions.scopeStyles?.globals ?? "off";

    const shouldPlanLocals = localStyle !== IdentifierCaseStyle.OFF;
    const shouldPlanAssets = assetStyle !== "off";
    const shouldPlanFunctions = functionStyle !== "off";
    const shouldPlanStructs = structStyle !== "off";
    const shouldPlanMacros = macroStyle !== "off";
    const shouldPlanInstance = instanceStyle !== "off";
    const shouldPlanGlobals = globalStyle !== "off";

    const requiresProjectIndex =
        shouldPlanLocals ||
        shouldPlanAssets ||
        shouldPlanFunctions ||
        shouldPlanStructs ||
        shouldPlanMacros ||
        shouldPlanInstance ||
        shouldPlanGlobals;

    if (!projectIndex && requiresProjectIndex) {
        projectIndex = await ensureIdentifierCaseProjectIndex(
            options,
            context?.projectIndex ?? null
        );
    }

    metrics.setMetadata("localStyle", localStyle);
    metrics.setMetadata("assetStyle", assetStyle);
    metrics.setMetadata("functionStyle", functionStyle);
    metrics.setMetadata("structStyle", structStyle);
    metrics.setMetadata("macroStyle", macroStyle);
    metrics.setMetadata("instanceStyle", instanceStyle);
    metrics.setMetadata("globalStyle", globalStyle);

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

    if (
        projectIndex &&
        (shouldPlanFunctions ||
            shouldPlanStructs ||
            shouldPlanMacros ||
            shouldPlanInstance ||
            shouldPlanGlobals)
    ) {
        planTopLevelIdentifierRenames({
            projectIndex,
            styles: {
                functions: functionStyle,
                structs: structStyle,
                macros: macroStyle,
                instance: instanceStyle,
                globals: globalStyle
            },
            preservedSet,
            ignoreMatchers,
            renameMap,
            operations,
            conflicts,
            metrics
        });
    }

    const hasLocalSupport =
        projectIndex &&
        projectIndex.files &&
        localStyle !== IdentifierCaseStyle.OFF;

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
            // Leave `__identifierCaseRenamePlan` unset when there are no planned
            // edits or conflicts. Downstream reporters treat the existence of a
            // plan as a signal that fresh rename data is available; writing an
            // empty object would still be truthy, causing editors and CLI dry
            // runs to emit "empty" summaries and replace whichever snapshot was
            // provided through the dry-run context. Keeping the option untouched
            // preserves that snapshot while the metrics +
            // `__identifierCasePlanGeneratedInternally` flag still communicate
            // that planning finished. See docs/identifier-case-reference.md for
            // how consumers stream rename plans across tooling boundaries.
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

        applyAssetRenamesIfEligible({
            options,
            projectIndex,
            assetRenames,
            assetConflicts,
            metrics
        });
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

        const classifications = getEntityClassifications(reference);

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

        const classifications = getEntityClassifications(declaration);

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

    applyAssetRenamesIfEligible({
        options,
        projectIndex,
        assetRenames,
        assetConflicts,
        metrics
    });

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
    return withObjectLike(
        options,
        (object) => ({
            projectIndex: object.__identifierCaseProjectIndex ?? null,
            projectRoot: object.__identifierCaseProjectRoot ?? null,
            bootstrap: object.__identifierCaseProjectIndexBootstrap ?? null,
            renameMap: object.__identifierCaseRenameMap ?? null,
            renamePlan: object.__identifierCaseRenamePlan ?? null,
            conflicts: object.__identifierCaseConflicts ?? null,
            metricsReport: object.__identifierCaseMetricsReport ?? null,
            metrics: object.__identifierCaseMetrics ?? null,
            assetRenames: object.__identifierCaseAssetRenames ?? null,
            assetRenameResult: object.__identifierCaseAssetRenameResult ?? null,
            assetRenamesApplied:
                object.__identifierCaseAssetRenamesApplied ?? null,
            dryRun:
                object.__identifierCaseDryRun === undefined
                    ? null
                    : object.__identifierCaseDryRun,
            planGenerated:
                object.__identifierCasePlanGeneratedInternally === true
        }),
        null
    );
}

export function applyIdentifierCasePlanSnapshot(snapshot, options) {
    if (!snapshot) {
        return;
    }

    withObjectLike(options, (object) => {
        const truthyAssignments = [
            ["projectIndex", "__identifierCaseProjectIndex"],
            ["projectRoot", "__identifierCaseProjectRoot"],
            ["bootstrap", "__identifierCaseProjectIndexBootstrap"]
        ];

        for (const [snapshotKey, optionKey] of truthyAssignments) {
            const value = snapshot[snapshotKey];
            if (value && !object[optionKey]) {
                setIdentifierCaseOption(object, optionKey, value);
            }
        }

        setIdentifierCaseOption(
            object,
            "__identifierCasePlanSnapshot",
            snapshot
        );
        Object.defineProperty(object, "__identifierCasePlanSnapshot", {
            value: snapshot,
            writable: true,
            configurable: true,
            enumerable: false
        });

        const optionalAssignments = [
            ["renameMap", "__identifierCaseRenameMap"],
            ["renamePlan", "__identifierCaseRenamePlan"],
            ["conflicts", "__identifierCaseConflicts"],
            ["metricsReport", "__identifierCaseMetricsReport"],
            ["metrics", "__identifierCaseMetrics"],
            ["assetRenames", "__identifierCaseAssetRenames"],
            ["assetRenameResult", "__identifierCaseAssetRenameResult"]
        ];

        for (const [snapshotKey, optionKey] of optionalAssignments) {
            const value = snapshot[snapshotKey];
            if (value && !object[optionKey]) {
                setIdentifierCaseOption(object, optionKey, value);
            }
        }

        const assetRenamesApplied = snapshot.assetRenamesApplied;
        if (
            assetRenamesApplied != undefined &&
            object.__identifierCaseAssetRenamesApplied == undefined
        ) {
            setIdentifierCaseOption(
                object,
                "__identifierCaseAssetRenamesApplied",
                assetRenamesApplied
            );
        }

        if (snapshot.dryRun !== null) {
            setIdentifierCaseOption(
                object,
                "__identifierCaseDryRun",
                snapshot.dryRun
            );
            Object.defineProperty(object, "__identifierCaseDryRun", {
                value: snapshot.dryRun,
                writable: true,
                configurable: true,
                enumerable: false
            });
        }

        if (snapshot.planGenerated) {
            setIdentifierCaseOption(
                object,
                "__identifierCasePlanGeneratedInternally",
                true
            );
        }
    });
}
