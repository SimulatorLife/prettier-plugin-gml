import path from "node:path";

import { Core } from "@gml-modules/core";
import { Refactor } from "@gml-modules/refactor";
import { Semantic } from "@gml-modules/semantic";

import { GmlParserBridge, GmlSemanticBridge, GmlTranspilerBridge } from "../modules/refactor/index.js";
import { importPluginModule } from "./entry-point.js";

type SemanticSafetyRuntimeModule = {
    setIdentifierCaseRuntime?: (runtime: unknown) => void;
    setRefactorRuntime?: (runtime: unknown) => void;
    setSemanticSafetyRuntime?: (runtime: unknown) => void;
};

type RuntimeContext = {
    projectRoot: string;
    refactorEngine: InstanceType<typeof Refactor.RefactorEngine>;
    semanticBridge: GmlSemanticBridge;
};

const runtimeContextCache = new Map<string, Promise<RuntimeContext | null>>();

/**
 * Configure plugin runtime adapters for project-aware semantic safety.
 */
export async function configurePluginRuntimeAdapters(projectRoot: string): Promise<void> {
    if (!Core.isNonEmptyString(projectRoot)) {
        return;
    }

    const pluginModule = (await importPluginModule()) as SemanticSafetyRuntimeModule;
    if (!pluginModule || typeof pluginModule !== "object") {
        return;
    }

    const runtimeContext = await getRuntimeContext(projectRoot);
    if (!runtimeContext) {
        return;
    }

    pluginModule.setIdentifierCaseRuntime?.({
        createScopeTracker: () => new Semantic.SemanticScopeCoordinator(),
        prepareIdentifierCaseEnvironment: Semantic.prepareIdentifierCaseEnvironment,
        teardownIdentifierCaseEnvironment: Semantic.teardownIdentifierCaseEnvironment,
        attachIdentifierCasePlanSnapshot: Semantic.attachIdentifierCasePlanSnapshot
    });

    pluginModule.setRefactorRuntime?.({
        isIdentifierNameOccupiedInProject({ identifierName }: { filePath: string | null; identifierName: string }) {
            if (!Core.isNonEmptyString(identifierName)) {
                return false;
            }

            if (runtimeContext.semanticBridge.getSymbolOccurrences(identifierName).length > 0) {
                return true;
            }

            return Core.isNonEmptyString(runtimeContext.semanticBridge.resolveSymbolId(identifierName));
        },
        listIdentifierOccurrenceFiles({ identifierName }: { filePath: string | null; identifierName: string }) {
            if (!Core.isNonEmptyString(identifierName)) {
                return new Set<string>();
            }

            const occurrences = runtimeContext.semanticBridge.getSymbolOccurrences(identifierName);
            const files = new Set<string>();

            for (const occurrence of occurrences) {
                if (!Core.isNonEmptyString(occurrence.path)) {
                    continue;
                }

                files.add(path.resolve(runtimeContext.projectRoot, occurrence.path));
            }

            return files;
        },
        async planFeatherRenames({
            filePath,
            requests
        }: {
            filePath: string | null;
            requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>;
        }) {
            const normalizedFilePath = Core.isNonEmptyString(filePath) ? path.resolve(filePath) : null;
            const plannedEntries: Array<{
                identifierName: string;
                mode: "local-fallback" | "project-aware";
                preferredReplacementName: string;
                replacementName: string | null;
                skipReason?: string;
            }> = [];

            await Core.runSequentially(requests, async (request) => {
                const plannedEntry = await planSingleFeatherRenameRequest({
                    normalizedFilePath,
                    projectRoot: runtimeContext.projectRoot,
                    refactorEngine: runtimeContext.refactorEngine,
                    resolveSymbolId: (identifierName) => runtimeContext.semanticBridge.resolveSymbolId(identifierName),
                    request
                });

                if (plannedEntry) {
                    plannedEntries.push(plannedEntry);
                }
            });

            return plannedEntries;
        }
    });

    pluginModule.setSemanticSafetyRuntime?.({
        assessGlobalVarRewrite({
            filePath,
            hasInitializer
        }: {
            filePath: string | null;
            hasInitializer: boolean;
            identifierName: string;
        }) {
            const normalizedFilePath = Core.isNonEmptyString(filePath) ? path.resolve(filePath) : null;
            return {
                allowRewrite: hasInitializer || normalizedFilePath !== null,
                initializerMode: hasInitializer ? "existing" : "undefined",
                mode: "project-aware"
            };
        },
        resolveLoopHoistIdentifier({
            preferredName
        }: {
            filePath: string | null;
            localIdentifierNames: ReadonlySet<string>;
            preferredName: string;
        }) {
            return {
                identifierName: preferredName,
                mode: "project-aware"
            };
        }
    });
}

async function planSingleFeatherRenameRequest({
    normalizedFilePath,
    projectRoot,
    refactorEngine,
    resolveSymbolId,
    request
}: {
    normalizedFilePath: string | null;
    projectRoot: string;
    refactorEngine: InstanceType<typeof Refactor.RefactorEngine>;
    resolveSymbolId: (identifierName: string) => string | null;
    request: { identifierName: string; preferredReplacementName: string };
}): Promise<{
    identifierName: string;
    mode: "local-fallback" | "project-aware";
    preferredReplacementName: string;
    replacementName: string | null;
    skipReason?: string;
} | null> {
    if (!request || !Core.isNonEmptyString(request.identifierName)) {
        return null;
    }

    const symbolId = resolveSymbolId(request.identifierName);
    if (!Core.isNonEmptyString(symbolId)) {
        return {
            identifierName: request.identifierName,
            mode: "local-fallback",
            preferredReplacementName: request.preferredReplacementName,
            replacementName: request.preferredReplacementName
        };
    }

    const candidateNames = enumerateRenameCandidates(request.preferredReplacementName);
    const resolution = await resolveRefactorPlannedReplacement({
        candidateNames,
        normalizedFilePath,
        projectRoot,
        refactorEngine,
        symbolId
    });

    return {
        identifierName: request.identifierName,
        mode: "project-aware",
        preferredReplacementName: request.preferredReplacementName,
        replacementName: resolution.replacementName,
        skipReason: resolution.skipReason
    };
}

async function resolveRefactorPlannedReplacement({
    candidateNames,
    normalizedFilePath,
    projectRoot,
    refactorEngine,
    symbolId
}: {
    candidateNames: ReadonlyArray<string>;
    normalizedFilePath: string | null;
    projectRoot: string;
    refactorEngine: InstanceType<typeof Refactor.RefactorEngine>;
    symbolId: string;
}): Promise<{ replacementName: string | null; skipReason?: string }> {
    const tryCandidateAtIndex = async (
        index: number,
        lastSkipReason?: string
    ): Promise<{ replacementName: string | null; skipReason?: string }> => {
        if (index >= candidateNames.length) {
            return {
                replacementName: null,
                skipReason: lastSkipReason
            };
        }

        const candidateName = candidateNames[index];
        try {
            const plan = await refactorEngine.prepareRenamePlan(
                {
                    symbolId,
                    newName: candidateName
                },
                {
                    validateHotReload: false
                }
            );

            if (!plan.validation.valid) {
                return await tryCandidateAtIndex(index + 1, plan.validation.errors.join("; "));
            }

            const affectedAbsolutePaths = new Set<string>();
            for (const edit of plan.workspace.edits) {
                affectedAbsolutePaths.add(path.resolve(projectRoot, edit.path));
            }

            const touchesOnlyCurrentFile =
                normalizedFilePath === null ||
                [...affectedAbsolutePaths.values()].every((affectedPath) => affectedPath === normalizedFilePath);
            if (!touchesOnlyCurrentFile) {
                return await tryCandidateAtIndex(
                    index + 1,
                    "Rename requires project-wide edits and cannot be applied safely inside formatter-only mode."
                );
            }

            return { replacementName: candidateName };
        } catch (error) {
            return await tryCandidateAtIndex(index + 1, Core.getErrorMessage(error));
        }
    };

    return await tryCandidateAtIndex(0);
}

async function getRuntimeContext(projectRoot: string): Promise<RuntimeContext | null> {
    const normalizedProjectRoot = path.resolve(projectRoot);
    const cached = runtimeContextCache.get(normalizedProjectRoot);

    if (cached !== undefined) {
        return await cached;
    }

    const pendingContext = createRuntimeContext(normalizedProjectRoot);
    runtimeContextCache.set(normalizedProjectRoot, pendingContext);
    return await pendingContext;
}

async function createRuntimeContext(projectRoot: string): Promise<RuntimeContext | null> {
    try {
        const projectIndex = await Semantic.buildProjectIndex(projectRoot, undefined, {
            logger: null
        });
        const semanticBridge = new GmlSemanticBridge(projectIndex, projectRoot);

        return {
            projectRoot,
            refactorEngine: new Refactor.RefactorEngine({
                semantic: semanticBridge,
                parser: new GmlParserBridge(),
                formatter: new GmlTranspilerBridge()
            }),
            semanticBridge
        };
    } catch {
        return null;
    }
}

function enumerateRenameCandidates(preferredName: string): ReadonlyArray<string> {
    if (!Core.isNonEmptyString(preferredName)) {
        return ["__featherFix_reserved"];
    }

    const candidates = [preferredName];
    for (let index = 1; index <= 32; index += 1) {
        candidates.push(`${preferredName}_${index}`);
    }

    return candidates;
}
