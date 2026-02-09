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
        async isIdentifierNameOccupiedInProject({
            identifierName
        }: {
            filePath: string | null;
            identifierName: string;
        }) {
            return await runtimeContext.refactorEngine.isIdentifierOccupied(identifierName);
        },
        async listIdentifierOccurrenceFiles({ identifierName }: { filePath: string | null; identifierName: string }) {
            const relativeFiles = await runtimeContext.refactorEngine.listIdentifierOccurrences(identifierName);
            const absoluteFiles = new Set<string>();

            for (const relativePath of relativeFiles) {
                if (Core.isNonEmptyString(relativePath)) {
                    absoluteFiles.add(path.resolve(runtimeContext.projectRoot, relativePath));
                }
            }

            return absoluteFiles;
        },
        async planFeatherRenames({
            filePath,
            requests
        }: {
            filePath: string | null;
            requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>;
        }) {
            return await runtimeContext.refactorEngine.planFeatherRenames(
                requests,
                filePath,
                runtimeContext.projectRoot
            );
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
            return runtimeContext.refactorEngine.assessGlobalVarRewrite(filePath, hasInitializer);
        },
        resolveLoopHoistIdentifier({
            preferredName
        }: {
            filePath: string | null;
            localIdentifierNames: ReadonlySet<string>;
            preferredName: string;
        }) {
            return runtimeContext.refactorEngine.resolveLoopHoistIdentifier(preferredName);
        }
    });
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
