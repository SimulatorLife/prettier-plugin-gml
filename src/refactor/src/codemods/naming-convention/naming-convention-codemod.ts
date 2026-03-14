import path from "node:path";

import { Core } from "@gmloop/core";

import { evaluateNamingConvention, resolveNamingConventionRules } from "../../naming-convention-policy.js";
import type { RefactorEngine } from "../../refactor-engine.js";
import type {
    ApplyWorkspaceEditOptions,
    NamingConventionCodemodPlan,
    NamingConventionTarget,
    NamingConventionViolation,
    RefactorProjectConfig
} from "../../types.js";
import { type WorkspaceEdit, WorkspaceEdit as WorkspaceEditClass } from "../../workspace-edit.js";

function isPathSelected(projectRoot: string, selectedPaths: ReadonlyArray<string>, targetPath: string): boolean {
    if (selectedPaths.length === 0) {
        return true;
    }

    const absoluteTargetPath = path.resolve(projectRoot, targetPath);
    return selectedPaths.some((selectedPath) => {
        const absoluteSelectedPath = path.resolve(selectedPath);
        return (
            absoluteTargetPath === absoluteSelectedPath || Core.isPathInside(absoluteTargetPath, absoluteSelectedPath)
        );
    });
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

/**
 * Plan naming-policy-driven edits for the selected project paths.
 */
export async function planNamingConventionCodemod(
    engine: RefactorEngine,
    parameters: {
        projectRoot: string;
        config: RefactorProjectConfig;
        targetPaths: Array<string>;
        gmlFilePaths?: Array<string>;
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
            localRenameCount: 0
        };
    }

    const resolvedRules = resolveNamingConventionRules(policy);
    const workspace = new WorkspaceEditClass();
    const warnings: Array<string> = [];
    const errors: Array<string> = [];
    const violations: Array<NamingConventionViolation> = [];
    const localScopeNames = new Map<string, Set<string>>();
    const topLevelRenames: Array<{ symbolId: string; newName: string }> = [];
    const seenTopLevelRenames = new Set<string>();
    let localRenameCount = 0;

    const selectedFilePaths = (parameters.gmlFilePaths ?? []).filter((filePath) =>
        isPathSelected(parameters.projectRoot, parameters.targetPaths, filePath)
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
                    if (isPathSelected(parameters.projectRoot, parameters.targetPaths, target.path)) {
                        await visitor(target);
                    }
                });
            });
            return;
        }

        const targets = await semantic.listNamingConventionTargets();
        await Core.runSequentially(targets, async (target) => {
            if (isPathSelected(parameters.projectRoot, parameters.targetPaths, target.path)) {
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

    let topLevelRenamePlan: NamingConventionCodemodPlan["topLevelRenamePlan"] = null;
    if (topLevelRenames.length > 0) {
        topLevelRenamePlan = await engine.prepareBatchRenamePlan(topLevelRenames, {
            includeImpactAnalyses: false
        });
        appendWorkspaceEdits(workspace, topLevelRenamePlan.workspace);
        warnings.push(
            ...topLevelRenamePlan.batchValidation.warnings,
            ...topLevelRenamePlan.validation.warnings,
            ...(topLevelRenamePlan.hotReload?.warnings ?? [])
        );
        errors.push(
            ...topLevelRenamePlan.batchValidation.errors,
            ...topLevelRenamePlan.validation.errors,
            ...(topLevelRenamePlan.hotReload?.errors ?? [])
        );
    }

    return {
        workspace,
        violations,
        warnings,
        errors,
        topLevelRenamePlan,
        localRenameCount
    };
}

/**
 * Execute a naming-convention codemod plan when it contains no blocking errors.
 */
export async function executeNamingConventionCodemod(
    engine: RefactorEngine,
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

    const applied = await engine.applyWorkspaceEdit(plan.workspace, parameters.applyOptions);
    return {
        plan,
        applied
    };
}
