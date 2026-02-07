export type {
    FeatherRenameContext,
    FeatherRenameResolution,
    GlobalVarRewriteAssessment,
    GlobalVarRewriteContext,
    LoopHoistIdentifierContext,
    LoopHoistIdentifierResolution,
    RefactorRuntime,
    SemanticSafetyMode,
    SemanticSafetyReport,
    SemanticSafetyRuntime
} from "./semantic-safety-runtime.js";
export {
    assessGlobalVarRewrite,
    emitSemanticSafetyReport,
    hasActiveSemanticSafetyReportService,
    resolveFeatherRename,
    resolveLoopHoistIdentifier,
    restoreDefaultRefactorRuntime,
    restoreDefaultSemanticSafetyRuntime,
    runWithSemanticSafetyReportService,
    setRefactorRuntime,
    setSemanticSafetyRuntime
} from "./semantic-safety-runtime.js";
