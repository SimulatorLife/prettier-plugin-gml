import * as HotReloadAPI from "./hot-reload.js";
import * as OccurrenceAnalysisAPI from "./occurrence-analysis.js";
import * as RefactorAPI from "./refactor-engine.js";
import * as RenamePreviewAPI from "./rename-preview.js";
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
    WorkspaceEdit,
    SemanticQueryCache,
    RenameValidationCache,
    ...OccurrenceAnalysisAPI,
    ...RenamePreviewAPI,
    ...ValidationAPI,
    ...HotReloadAPI,
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
export type { OccurrenceClassification } from "./occurrence-analysis.js";
export {
    classifyOccurrences,
    countAffectedFiles,
    filterOccurrencesByKind,
    findOccurrencesInFile,
    groupOccurrencesByFile
} from "./occurrence-analysis.js";
export { RefactorEngine } from "./refactor-engine.js";
export type { FilePreview, RenamePreview } from "./rename-preview.js";
export {
    formatBatchRenamePlanReport,
    formatOccurrencePreview,
    formatRenamePlanReport,
    generateRenamePreview
} from "./rename-preview.js";
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
