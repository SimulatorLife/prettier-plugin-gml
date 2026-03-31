import path from "node:path";

import { Core } from "@gmloop/core";

import { evaluateNamingConvention, resolveNamingConventionRules } from "../../naming-convention-policy.js";
import type {
    ApplyWorkspaceEditOptions,
    BatchRenamePlanSummary,
    CodemodEngine,
    NamingConventionCodemodPlan,
    NamingConventionTarget,
    NamingConventionViolation,
    RefactorProjectConfig,
    RenameRequest
} from "../../types.js";
import { detectCircularRenames, detectDuplicateTargetNames } from "../../validation.js";
import { type WorkspaceEdit, WorkspaceEdit as WorkspaceEditClass } from "../../workspace-edit.js";
import { isPathSelectedByLists } from "./path-selection.js";

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

type TopLevelRenameSelection = {
    executableRenames: Array<RenameRequest>;
    warnings: Array<string>;
};

function formatTopLevelRenameSkipWarning(rename: RenameRequest, reason: string): string {
    return `Skipping top-level rename '${rename.symbolId}' -> '${rename.newName}': ${reason}`;
}

async function selectExecutableTopLevelRenames(
    engine: CodemodEngine,
    renames: ReadonlyArray<RenameRequest>
): Promise<TopLevelRenameSelection> {
    const warnings: Array<string> = [];
    const individuallySafeRenames: Array<RenameRequest> = [];

    await Core.runSequentially(renames, async (rename) => {
        const validation = await engine.validateRenameRequest(rename);
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

    return {
        executableRenames: individuallySafeRenames.filter((rename) => !blockedSymbolIds.has(rename.symbolId)),
        warnings
    };
}

function collectBatchPlanWarnings(plan: BatchRenamePlanSummary): Array<string> {
    return [...plan.batchValidation.warnings, ...plan.validation.warnings, ...(plan.hotReload?.warnings ?? [])];
}

function collectBatchPlanErrors(plan: BatchRenamePlanSummary): Array<string> {
    return [...plan.batchValidation.errors, ...plan.validation.errors, ...(plan.hotReload?.errors ?? [])];
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
    let workspace = new WorkspaceEditClass();
    const warnings: Array<string> = [];
    const errors: Array<string> = [];
    const violations: Array<NamingConventionViolation> = [];
    const localScopeNames = new Map<string, Set<string>>();
    const topLevelRenames: Array<{ symbolId: string; newName: string }> = [];
    const seenTopLevelRenames = new Set<string>();
    let localRenameCount = 0;

    const selectedFilePaths = (parameters.gmlFilePaths ?? []).filter((filePath) =>
        isPathSelectedByLists(parameters.projectRoot, filePath, parameters.targetPaths, [])
    );

    const forEachSelectedTarget = async (
        visitor: (target: NamingConventionTarget) => void | Promise<void>
    ): Promise<void> => {
        if (selectedFilePaths.length > 0) {
            await Core.runSequentially(selectedFilePaths, async (filePath) => {
                const relativeResourcePath = filePath.replace(/\.gml$/i, ".yy");
                const absoluteFilePath = path.resolve(parameters.projectRoot, filePath);
                const absoluteResourcePath = path.resolve(parameters.projectRoot, relativeResourcePath);
                const targetsForFile = await semantic.listNamingConventionTargets([
                    filePath,
                    absoluteFilePath,
                    relativeResourcePath,
                    absoluteResourcePath
                ]);
                await Core.runSequentially(targetsForFile, async (target) => {
                    if (isPathSelectedByLists(parameters.projectRoot, target.path, parameters.targetPaths, [])) {
                        await visitor(target);
                    }
                });
            });
            return;
        }

        const targets = await semantic.listNamingConventionTargets();
        await Core.runSequentially(targets, async (target) => {
            if (isPathSelectedByLists(parameters.projectRoot, target.path, parameters.targetPaths, [])) {
                await visitor(target);
            }
        });
    };

    await forEachSelectedTarget((target) => {
        if (target.symbolId !== null) {
            return;
        }

        const scopeKey = `${target.path}:${target.scopeId ?? "root"}`;
        const names = localScopeNames.get(scopeKey) ?? new Set<string>();
        names.add(target.name);
        localScopeNames.set(scopeKey, names);
    });

    await forEachSelectedTarget((target) => {
        const evaluation = evaluateNamingConvention(target.name, target.category, policy, resolvedRules);
        if (evaluation.compliant || evaluation.message === null) {
            return;
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
            return;
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
            return;
        }

        const scopeKey = `${target.path}:${target.scopeId ?? "root"}`;
        const existingNames = localScopeNames.get(scopeKey) ?? new Set<string>();

        if (existingNames.has(evaluation.suggestedName) && evaluation.suggestedName !== target.name) {
            warnings.push(
                `Skipping local rename '${target.name}' -> '${evaluation.suggestedName}' in ${target.path} because the target name already exists in the same scope.`
            );
            return;
        }

        for (const occurrence of target.occurrences) {
            workspace.addEdit(occurrence.path, occurrence.start, occurrence.end, evaluation.suggestedName);
        }

        existingNames.add(evaluation.suggestedName);
        localScopeNames.set(scopeKey, existingNames);
        localRenameCount += 1;
    });

    const topLevelRenameSelection = await selectExecutableTopLevelRenames(engine, topLevelRenames);
    warnings.push(...topLevelRenameSelection.warnings);

    let topLevelRenamePlan: NamingConventionCodemodPlan["topLevelRenamePlan"] = null;
    let executableTopLevelRenames = topLevelRenameSelection.executableRenames;
    if (includeTopLevelPlan && executableTopLevelRenames.length > 0) {
        try {
            const preparedTopLevelRenamePlan = await engine.prepareBatchRenamePlan(executableTopLevelRenames, {
                includeImpactAnalyses: false
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
