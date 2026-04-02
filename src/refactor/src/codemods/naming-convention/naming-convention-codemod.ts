import path from "node:path";

import { Core } from "@gmloop/core";

import { evaluateNamingConvention, resolveNamingConventionRules } from "../../naming-convention-policy.js";
import { DEFAULT_RESERVED_KEYWORDS } from "../../rename/index.js";
import type {
    ApplyWorkspaceEditOptions,
    BatchRenamePlanSummary,
    BatchRenameValidation,
    CodemodEngine,
    MacroExpansionDependency,
    NamingCategory,
    NamingConventionCodemodPlan,
    NamingConventionViolation,
    RefactorProjectConfig,
    RenameRequest,
    ValidationSummary
} from "../../types.js";
import { detectCircularRenames, detectCrossRenameNameConfusion, detectDuplicateTargetNames } from "../../validation.js";
import { type WorkspaceEdit, WorkspaceEdit as WorkspaceEditClass } from "../../workspace-edit.js";
import { createPathSelectionMatcher } from "./path-selection.js";

const RESERVED_LOCAL_RENAME_CATEGORIES = new Set([
    "globalVariable",
    "instanceVariable",
    "localVariable",
    "loopIndexVariable",
    "staticVariable"
]);

const RESERVED_LOCAL_IDENTIFIER_TYPES = new Set(["property", "symbol", "variable"]);

let cachedReservedLocalIdentifierNames: ReadonlySet<string> | null = null;

function getReservedLocalIdentifierNames(): ReadonlySet<string> {
    if (cachedReservedLocalIdentifierNames !== null) {
        return cachedReservedLocalIdentifierNames;
    }

    const reservedNames = new Set(Array.from(DEFAULT_RESERVED_KEYWORDS, (keyword) => keyword.toLowerCase()));
    const identifierEntries = Core.normalizeIdentifierMetadataEntries(Core.getIdentifierMetadata());

    for (const { name, type } of identifierEntries) {
        if (!RESERVED_LOCAL_IDENTIFIER_TYPES.has(type.toLowerCase())) {
            continue;
        }

        reservedNames.add(name.toLowerCase());
    }

    cachedReservedLocalIdentifierNames = reservedNames;
    return cachedReservedLocalIdentifierNames;
}

function appendWorkspaceEdits(destination: WorkspaceEdit, source: WorkspaceEdit): void {
    for (const edit of source.edits) {
        destination.addEdit(edit.path, edit.start, edit.end, edit.newText);
    }

    for (const metadataEdit of source.metadataEdits) {
        destination.addMetadataEdit(metadataEdit.path, metadataEdit.content);
    }

    for (const fileRename of source.fileRenames) {
        destination.addFileRename(fileRename.oldPath, fileRename.newPath);
    }
}

function decrementScopedNameCount(names: Map<string, number>, normalizedName: string): void {
    const currentCount = names.get(normalizedName) ?? 0;
    if (currentCount <= 1) {
        names.delete(normalizedName);
        return;
    }

    names.set(normalizedName, currentCount - 1);
}

type TopLevelRenameSelection = {
    executableRenames: Array<RenameRequest>;
    reusableBatchValidation: BatchRenameValidation | null;
    warnings: Array<string>;
};

type MacroDependencyNamesByFile = Map<string, Map<string, Set<string>>>;

function formatTopLevelRenameSkipWarning(rename: RenameRequest, reason: string): string {
    return `Skipping top-level rename '${rename.symbolId}' -> '${rename.newName}': ${reason}`;
}

async function selectExecutableTopLevelRenames(
    engine: CodemodEngine,
    renames: ReadonlyArray<RenameRequest>
): Promise<TopLevelRenameSelection> {
    const warnings: Array<string> = [];
    const individuallySafeRenames: Array<RenameRequest> = [];
    const renameValidations = new Map<string, ValidationSummary>();

    await Core.runSequentially(renames, async (rename) => {
        const validation = await engine.validateRenameRequest(rename);
        renameValidations.set(rename.symbolId, validation);
        warnings.push(...validation.warnings.map((warning) => `${rename.symbolId}: ${warning}`));

        if (!validation.valid) {
            warnings.push(formatTopLevelRenameSkipWarning(rename, validation.errors.join("; ")));
            return;
        }

        individuallySafeRenames.push(rename);
    });

    const blockedSymbolIds = new Set<string>();
    for (const duplicateTarget of detectDuplicateTargetNames(individuallySafeRenames)) {
        for (const symbolId of duplicateTarget.symbolIds) {
            blockedSymbolIds.add(symbolId);
            warnings.push(
                formatTopLevelRenameSkipWarning(
                    individuallySafeRenames.find((rename) => rename.symbolId === symbolId) ?? {
                        symbolId,
                        newName: duplicateTarget.newName
                    },
                    `another naming-convention rename in the same run also targets '${duplicateTarget.newName}'`
                )
            );
        }
    }

    const circularRenameChain = detectCircularRenames(individuallySafeRenames);
    if (circularRenameChain.length > 0) {
        const cycleSymbolIds = new Set(circularRenameChain);
        const cyclePreview = circularRenameChain.join(" -> ");
        for (const rename of individuallySafeRenames) {
            if (cycleSymbolIds.has(rename.symbolId)) {
                blockedSymbolIds.add(rename.symbolId);
                warnings.push(
                    formatTopLevelRenameSkipWarning(
                        rename,
                        `the rename participates in a circular naming-convention batch (${cyclePreview})`
                    )
                );
            }
        }
    }

    const executableRenames = individuallySafeRenames.filter((rename) => !blockedSymbolIds.has(rename.symbolId));

    return {
        executableRenames,
        reusableBatchValidation:
            blockedSymbolIds.size === 0 && individuallySafeRenames.length === renames.length
                ? {
                      valid: true,
                      errors: [],
                      warnings: detectCrossRenameNameConfusion(executableRenames).map(
                          ({ symbolId, newName }) =>
                              `Rename introduces potential confusion: '${symbolId}' renamed to '${newName}' which was an original symbol name in this batch`
                      ),
                      renameValidations,
                      conflictingSets: []
                  }
                : null,
        warnings
    };
}

function collectBatchPlanWarnings(plan: BatchRenamePlanSummary): Array<string> {
    return [...plan.batchValidation.warnings, ...plan.validation.warnings, ...(plan.hotReload?.warnings ?? [])];
}

function collectBatchPlanErrors(plan: BatchRenamePlanSummary): Array<string> {
    return [...plan.batchValidation.errors, ...plan.validation.errors, ...(plan.hotReload?.errors ?? [])];
}

function collectMacroDependencyNamesByFile(
    dependencies: ReadonlyArray<MacroExpansionDependency> | undefined
): MacroDependencyNamesByFile {
    const dependencyNamesByFile: MacroDependencyNamesByFile = new Map();

    for (const dependency of dependencies ?? []) {
        const dependencyNames = dependencyNamesByFile.get(dependency.path) ?? new Map<string, Set<string>>();
        const normalizedReferencedNames = dependencyNames.get(dependency.macroName) ?? new Set<string>();

        for (const referencedName of dependency.referencedNames) {
            normalizedReferencedNames.add(referencedName.toLowerCase());
        }

        dependencyNames.set(dependency.macroName, normalizedReferencedNames);
        dependencyNamesByFile.set(dependency.path, dependencyNames);
    }

    return dependencyNamesByFile;
}

function findDependentMacroNames(
    dependenciesByFile: MacroDependencyNamesByFile,
    filePath: string,
    identifierName: string
): Array<string> {
    const dependenciesForFile = dependenciesByFile.get(filePath);
    if (!dependenciesForFile) {
        return [];
    }

    const normalizedIdentifierName = identifierName.toLowerCase();
    const dependentMacroNames: Array<string> = [];

    for (const [macroName, referencedNames] of dependenciesForFile) {
        if (referencedNames.has(normalizedIdentifierName)) {
            dependentMacroNames.push(macroName);
        }
    }

    return dependentMacroNames.toSorted();
}

function collectNamingTargetQueryPaths(projectRoot: string, selectedFilePaths: ReadonlyArray<string>): Array<string> {
    const queryPaths = new Set<string>();

    for (const filePath of selectedFilePaths) {
        const normalizedFilePath = filePath.replaceAll("\\", "/");
        const siblingResourcePath = normalizedFilePath.replace(/\.gml$/i, ".yy");
        const ownerDirectory = path.posix.dirname(normalizedFilePath);
        const ownerResourceName = path.posix.basename(ownerDirectory);
        const ownerParentDirectory = path.posix.dirname(ownerDirectory);
        const ownerResourcePath =
            ownerParentDirectory === "." ? null : path.posix.join(ownerDirectory, `${ownerResourceName}.yy`);

        queryPaths.add(normalizedFilePath);
        queryPaths.add(path.resolve(projectRoot, normalizedFilePath));
        queryPaths.add(siblingResourcePath);
        queryPaths.add(path.resolve(projectRoot, siblingResourcePath));

        if (ownerResourcePath !== null) {
            queryPaths.add(ownerResourcePath);
            queryPaths.add(path.resolve(projectRoot, ownerResourcePath));
        }
    }

    return Array.from(queryPaths);
}

/**
 * Plan naming-policy-driven edits for the selected project paths.
 */
export async function planNamingConventionCodemod(
    engine: CodemodEngine,
    parameters: {
        projectRoot: string;
        config: RefactorProjectConfig;
        targetPaths: Array<string>;
        gmlFilePaths?: Array<string>;
        includeTopLevelPlan?: boolean;
    }
): Promise<NamingConventionCodemodPlan> {
    const policy = parameters.config.namingConventionPolicy;
    if (!policy) {
        return {
            workspace: new WorkspaceEditClass(),
            violations: [],
            warnings: [
                "The namingConvention codemod is enabled but refactor.namingConventionPolicy is not configured."
            ],
            errors: [],
            topLevelRenamePlan: null,
            topLevelRenameRequests: [],
            localRenameCount: 0
        };
    }

    const semantic = engine.semantic;
    if (!semantic || typeof semantic.listNamingConventionTargets !== "function") {
        return {
            workspace: new WorkspaceEditClass(),
            violations: [],
            warnings: [],
            errors: ["Naming convention codemod requires semantic.listNamingConventionTargets support."],
            topLevelRenamePlan: null,
            topLevelRenameRequests: [],
            localRenameCount: 0
        };
    }

    const includeTopLevelPlan = parameters.includeTopLevelPlan !== false;
    const resolvedRules = resolveNamingConventionRules(policy);
    const requestedCategories = Object.keys(resolvedRules) as Array<NamingCategory>;
    let workspace = new WorkspaceEditClass();
    const warnings: Array<string> = [];
    const errors: Array<string> = [];
    const violations: Array<NamingConventionViolation> = [];
    const localScopeNames = new Map<string, Map<string, number>>();
    const topLevelRenames: Array<{ symbolId: string; newName: string }> = [];
    const seenTopLevelRenames = new Set<string>();
    let localRenameCount = 0;
    const isSelectedTargetPath = createPathSelectionMatcher(parameters.projectRoot, parameters.targetPaths, []);

    const selectedFilePaths = (parameters.gmlFilePaths ?? []).filter((filePath) => isSelectedTargetPath(filePath));
    const queriedTargets = await semantic.listNamingConventionTargets(
        selectedFilePaths.length === 0
            ? undefined
            : collectNamingTargetQueryPaths(parameters.projectRoot, selectedFilePaths),
        requestedCategories
    );
    const selectedTargets = queriedTargets.filter((target) => isSelectedTargetPath(target.path));
    const macroDependencyNamesByFile = collectMacroDependencyNamesByFile(
        typeof semantic.listMacroExpansionDependencies === "function"
            ? await semantic.listMacroExpansionDependencies(selectedFilePaths)
            : []
    );

    for (const target of selectedTargets) {
        if (target.symbolId !== null) {
            continue;
        }

        const scopeKey = `${target.path}:${target.scopeId ?? "root"}`;
        const names = localScopeNames.get(scopeKey) ?? new Map<string, number>();
        Core.incrementMapValue(names, target.name.toLowerCase());
        localScopeNames.set(scopeKey, names);
    }

    for (const target of selectedTargets) {
        const evaluation = evaluateNamingConvention(target.name, target.category, policy, resolvedRules);
        if (evaluation.compliant || evaluation.message === null) {
            continue;
        }

        violations.push({
            category: target.category,
            currentName: target.name,
            suggestedName: evaluation.suggestedName,
            path: target.path,
            symbolId: target.symbolId,
            message: evaluation.message
        });

        if (evaluation.suggestedName === null || evaluation.suggestedName === target.name) {
            warnings.push(`No automatic rename generated for ${target.category} '${target.name}' in ${target.path}.`);
            continue;
        }

        if (target.symbolId !== null) {
            const key = `${target.symbolId}:${evaluation.suggestedName}`;
            if (!seenTopLevelRenames.has(key)) {
                seenTopLevelRenames.add(key);
                topLevelRenames.push({
                    symbolId: target.symbolId,
                    newName: evaluation.suggestedName
                });
            }
            continue;
        }

        const scopeKey = `${target.path}:${target.scopeId ?? "root"}`;
        const existingNames = localScopeNames.get(scopeKey) ?? new Map<string, number>();
        const normalizedSuggestedName = evaluation.suggestedName.toLowerCase();
        const normalizedCurrentName = target.name.toLowerCase();
        const existingSuggestedNameCount = existingNames.get(normalizedSuggestedName) ?? 0;
        const isCaseOnlyRename = normalizedSuggestedName === normalizedCurrentName;
        const hasSameScopeNameConflict = isCaseOnlyRename
            ? existingSuggestedNameCount > 1
            : existingSuggestedNameCount > 0;

        if (evaluation.suggestedName !== target.name && hasSameScopeNameConflict) {
            warnings.push(
                `Skipping local rename '${target.name}' -> '${evaluation.suggestedName}' in ${target.path} because the target name already exists in the same scope.`
            );
            continue;
        }

        if (
            RESERVED_LOCAL_RENAME_CATEGORIES.has(target.category) &&
            getReservedLocalIdentifierNames().has(normalizedSuggestedName)
        ) {
            warnings.push(
                `Skipping local rename '${target.name}' -> '${evaluation.suggestedName}' in ${target.path} because '${evaluation.suggestedName}' is a reserved GameMaker identifier.`
            );
            continue;
        }

        const dependentMacroNames = findDependentMacroNames(macroDependencyNamesByFile, target.path, target.name);
        if (dependentMacroNames.length > 0) {
            warnings.push(
                `Skipping local rename '${target.name}' -> '${evaluation.suggestedName}' in ${target.path} because macro expansion${dependentMacroNames.length === 1 ? "" : "s"} ${dependentMacroNames.map((macroName) => `'${macroName}'`).join(", ")} ${dependentMacroNames.length === 1 ? "depends" : "depend"} on '${target.name}'.`
            );
            continue;
        }

        for (const occurrence of target.occurrences) {
            workspace.addEdit(occurrence.path, occurrence.start, occurrence.end, evaluation.suggestedName);
        }

        decrementScopedNameCount(existingNames, normalizedCurrentName);
        Core.incrementMapValue(existingNames, normalizedSuggestedName);
        localScopeNames.set(scopeKey, existingNames);
        localRenameCount += 1;
    }

    const topLevelRenameSelection = await selectExecutableTopLevelRenames(engine, topLevelRenames);
    warnings.push(...topLevelRenameSelection.warnings);

    let topLevelRenamePlan: NamingConventionCodemodPlan["topLevelRenamePlan"] = null;
    let executableTopLevelRenames = topLevelRenameSelection.executableRenames;
    if (includeTopLevelPlan && executableTopLevelRenames.length > 0) {
        try {
            const preparedTopLevelRenamePlan = await engine.prepareBatchRenamePlan(executableTopLevelRenames, {
                includeImpactAnalyses: false,
                batchValidation: topLevelRenameSelection.reusableBatchValidation
            });
            warnings.push(...collectBatchPlanWarnings(preparedTopLevelRenamePlan));

            const topLevelPlanErrors = collectBatchPlanErrors(preparedTopLevelRenamePlan);
            if (topLevelPlanErrors.length > 0) {
                warnings.push(
                    `Skipping ${executableTopLevelRenames.length} top-level naming rename(s) because batch planning failed: ${topLevelPlanErrors.join("; ")}`
                );
                executableTopLevelRenames = [];
            } else {
                topLevelRenamePlan = preparedTopLevelRenamePlan;
                const mergedWorkspace = preparedTopLevelRenamePlan.workspace;
                appendWorkspaceEdits(mergedWorkspace, workspace);
                workspace = mergedWorkspace;
            }
        } catch (error) {
            warnings.push(
                `Skipping ${executableTopLevelRenames.length} top-level naming rename(s) because batch planning failed: ${Core.getErrorMessage(error)}`
            );
            executableTopLevelRenames = [];
        }
    }

    return {
        workspace,
        violations,
        warnings,
        errors,
        topLevelRenamePlan,
        topLevelRenameRequests: executableTopLevelRenames,
        localRenameCount
    };
}

/**
 * Execute a naming-convention codemod plan when it contains no blocking errors.
 */
export async function executeNamingConventionCodemod(
    engine: CodemodEngine,
    parameters: {
        projectRoot: string;
        config: RefactorProjectConfig;
        targetPaths: Array<string>;
        gmlFilePaths?: Array<string>;
        applyOptions: ApplyWorkspaceEditOptions;
    }
): Promise<{
    plan: NamingConventionCodemodPlan;
    applied: Map<string, string>;
}> {
    const plan = await planNamingConventionCodemod(engine, {
        projectRoot: parameters.projectRoot,
        config: parameters.config,
        targetPaths: parameters.targetPaths,
        gmlFilePaths: parameters.gmlFilePaths
    });

    if (plan.errors.length > 0) {
        return {
            plan,
            applied: new Map()
        };
    }

    if (
        plan.workspace.edits.length === 0 &&
        plan.workspace.metadataEdits.length === 0 &&
        plan.workspace.fileRenames.length === 0
    ) {
        return {
            plan,
            applied: new Map()
        };
    }

    const applied = await engine.applyWorkspaceEdit(plan.workspace, {
        ...parameters.applyOptions,
        includeResultContent: parameters.applyOptions.dryRun === true
    });
    return {
        plan,
        applied
    };
}
