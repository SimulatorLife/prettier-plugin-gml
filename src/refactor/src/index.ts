import * as HotReloadAPI from "./hot-reload.js";
import * as ImpactAnalysisAPI from "./impact-analysis.js";
import * as OccurrenceAnalysisAPI from "./occurrence-analysis.js";
import * as ProjectAnalysisProviderAPI from "./project-analysis-provider.js";
import * as RefactorAPI from "./refactor-engine.js";
import * as RenameExecutorAPI from "./rename-executor.js";
import * as RenamePlannerAPI from "./rename-planner.js";
import * as RenamePreviewAPI from "./rename-preview.js";
import * as RenameRequestValidatorAPI from "./rename-request-validator.js";
import { RenameValidationCache } from "./rename-validation-cache.js";
import { SemanticQueryCache } from "./semantic-cache.js";
import {
    ConflictType,
    isConflictType,
    isOccurrenceKind,
    isSymbolKind,
    OccurrenceKind,
    parseConflictType,
    parseOccurrenceKind,
    parseSymbolKind,
    requireConflictType,
    requireOccurrenceKind,
    requireSymbolKind,
    SymbolKind
} from "./types.js";
import * as ValidationAPI from "./validation.js";
import { WorkspaceEdit } from "./workspace-edit.js";

export const Refactor = Object.freeze({
    ...RefactorAPI,
    ...ProjectAnalysisProviderAPI,
    WorkspaceEdit,
    SemanticQueryCache,
    RenameValidationCache,
    ...OccurrenceAnalysisAPI,
    ...RenamePreviewAPI,
    ...ValidationAPI,
    ...HotReloadAPI,
    ...ImpactAnalysisAPI,
    ...RenameExecutorAPI,
    ...RenamePlannerAPI,
    ...RenameRequestValidatorAPI,
    ConflictType,
    isConflictType,
    parseConflictType,
    requireConflictType,
    OccurrenceKind,
    isOccurrenceKind,
    parseOccurrenceKind,
    requireOccurrenceKind,
    SymbolKind,
    isSymbolKind,
    parseSymbolKind,
    requireSymbolKind
});

export {
    checkHotReloadSafety,
    computeHotReloadCascade,
    computeRenameImpactGraph,
    generateTranspilerPatches,
    prepareHotReloadUpdates
} from "./hot-reload.js";
export { analyzeRenameImpact, verifyPostEditIntegrity } from "./impact-analysis.js";
export type { OccurrenceClassification } from "./occurrence-analysis.js";
export {
    classifyOccurrences,
    countAffectedFiles,
    filterOccurrencesByKind,
    findOccurrencesInFile,
    groupOccurrencesByFile
} from "./occurrence-analysis.js";
export { createRefactorProjectAnalysisProvider } from "./project-analysis-provider.js";
export { RefactorEngine } from "./refactor-engine.js";
export {
    applyEditsToContent,
    applyWorkspaceEdits,
    validateTranspilerCompatibility,
    validateWorkspaceEdit
} from "./rename-executor.js";
export { buildRenameWorkspace } from "./rename-planner.js";
export type { FilePreview, RenamePreview } from "./rename-preview.js";
export {
    formatBatchRenamePlanReport,
    formatOccurrencePreview,
    formatRenamePlanReport,
    generateRenamePreview
} from "./rename-preview.js";
export { computeRenameValidation, validateBatchRenameRequests } from "./rename-request-validator.js";
export type {
    CachedValidationResult,
    RenameValidationCacheConfig,
    ValidationCacheStats
} from "./rename-validation-cache.js";
export { RenameValidationCache } from "./rename-validation-cache.js";
export type { CacheStats, SemanticCacheConfig } from "./semantic-cache.js";
export { SemanticQueryCache } from "./semantic-cache.js";
export type {
    ApplyWorkspaceEditOptions,
    AstNode,
    BatchRenamePlanSummary,
    BatchRenameValidation,
    CascadeEntry,
    ConflictEntry,
    ConflictTypeValue,
    DependencyAnalyzer,
    DependentSymbol,
    EditValidator,
    ExecuteBatchRenameRequest,
    ExecuteRenameRequest,
    ExecuteRenameResult,
    FileSymbol,
    FileSymbolProvider,
    HotReloadCascadeMetadata,
    HotReloadCascadeResult,
    HotReloadSafetySummary,
    HotReloadUpdate,
    HotReloadValidationOptions,
    KeywordProvider,
    MaybePromise,
    OccurrenceKindValue,
    OccurrenceTracker,
    ParserBridge,
    PartialSemanticAnalyzer,
    PrepareRenamePlanOptions,
    Range,
    RefactorEngineDependencies,
    RefactorProjectAnalysisProvider,
    RenameImpactAnalysis,
    RenameImpactGraph,
    RenameImpactNode,
    RenameImpactSummary,
    RenamePlanSummary,
    RenameRequest,
    SemanticAnalyzer,
    SemanticValidationResult,
    SymbolKindValue,
    SymbolLocation,
    SymbolLookupResult,
    SymbolOccurrence,
    SymbolResolver,
    TranspilerBridge,
    TranspilerPatch,
    ValidateRenameRequestOptions,
    ValidationSummary,
    WorkspaceReadFile,
    WorkspaceWriteFile
} from "./types.js";
export { isSymbolKind, parseSymbolKind, requireSymbolKind, SymbolKind } from "./types.js";
export { ConflictType, isConflictType, parseConflictType, requireConflictType } from "./types.js";
export { isOccurrenceKind, OccurrenceKind, parseOccurrenceKind, requireOccurrenceKind } from "./types.js";
export {
    batchValidateScopeConflicts,
    detectCircularRenames,
    detectRenameConflicts,
    validateCrossFileConsistency,
    validateRenameStructure
} from "./validation.js";
export { WorkspaceEdit } from "./workspace-edit.js";
