import path from "node:path";

import { Core } from "@gml-modules/core";
import { Semantic } from "@gml-modules/semantic";

import { GmlSemanticBridge } from "../modules/refactor/index.js";
import { importPluginModule } from "./entry-point.js";

type SemanticSafetyRuntimeModule = {
    setIdentifierCaseRuntime?: (runtime: unknown) => void;
    setRefactorRuntime?: (runtime: unknown) => void;
    setSemanticSafetyRuntime?: (runtime: unknown) => void;
};

type RuntimeContext = {
    projectRoot: string;
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

        return {
            projectRoot,
            semanticBridge: new GmlSemanticBridge(projectIndex, projectRoot)
        };
    } catch {
        return null;
    }
}
