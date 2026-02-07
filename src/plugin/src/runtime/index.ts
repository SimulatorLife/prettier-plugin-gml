export type {
    FeatherRenameContext,
    FeatherRenamePlanEntry,
    FeatherRenamePlanRequest,
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
    prepareFeatherRenamePlan,
    resolveFeatherRename,
    resolveLoopHoistIdentifier,
    restoreDefaultRefactorRuntime,
    restoreDefaultSemanticSafetyRuntime,
    runWithFeatherRenamePlan,
    runWithSemanticSafetyReportService,
    setRefactorRuntime,
    setSemanticSafetyRuntime
} from "./semantic-safety-runtime.js";
