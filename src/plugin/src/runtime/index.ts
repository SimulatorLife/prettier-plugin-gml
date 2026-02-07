export type {
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
    resolveLoopHoistIdentifier,
    restoreDefaultRefactorRuntime,
    restoreDefaultSemanticSafetyRuntime,
    setRefactorRuntime,
    setSemanticSafetyRuntime
} from "./semantic-safety-runtime.js";
