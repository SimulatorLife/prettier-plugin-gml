import type { PartialSemanticAnalyzer, RenamePlanSummary } from "./types.js";

export type PrepareRenamePlan = (
    request: { symbolId: string; newName: string },
    options: { validateHotReload: boolean }
) => Promise<RenamePlanSummary>;

export interface ProjectAnalysisProviderContext {
    semantic: PartialSemanticAnalyzer | null;
    prepareRenamePlan: PrepareRenamePlan;
}

export interface ProjectAnalysisProvider {
    isIdentifierOccupied(identifierName: string, context: ProjectAnalysisProviderContext): Promise<boolean>;
    listIdentifierOccurrences(identifierName: string, context: ProjectAnalysisProviderContext): Promise<Set<string>>;
    planFeatherRenames(
        requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>,
        filePath: string | null,
        projectRoot: string,
        context: ProjectAnalysisProviderContext
    ): Promise<
        Array<{
            identifierName: string;
            mode: "local-fallback" | "project-aware";
            preferredReplacementName: string;
            replacementName: string | null;
            skipReason?: string;
        }>
    >;
    assessGlobalVarRewrite(
        filePath: string | null,
        hasInitializer: boolean
    ): {
        allowRewrite: boolean;
        initializerMode: "existing" | "undefined";
        mode: "project-aware";
    };
    resolveLoopHoistIdentifier(preferredName: string): {
        identifierName: string;
        mode: "project-aware";
    };
}
