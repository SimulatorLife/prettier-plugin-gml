import * as RefactorAPI from "./refactor-engine.js";
import { WorkspaceEdit } from "./workspace-edit.js";
import * as OccurrenceAnalysisAPI from "./occurrence-analysis.js";
import * as RenamePreviewAPI from "./rename-preview.js";
import * as ValidationAPI from "./validation.js";
import {
    ConflictType,
    isConflictType,
    parseConflictType,
    requireConflictType,
    SymbolKind,
    isSymbolKind,
    parseSymbolKind,
    requireSymbolKind
} from "./types.js";

export const Refactor = Object.freeze({
    ...RefactorAPI,
    WorkspaceEdit,
    ...OccurrenceAnalysisAPI,
    ...RenamePreviewAPI,
    ...ValidationAPI,
    ConflictType,
    isConflictType,
    parseConflictType,
    requireConflictType,
    SymbolKind,
    isSymbolKind,
    parseSymbolKind,
    requireSymbolKind
});

export { RefactorEngine } from "./refactor-engine.js";
export { WorkspaceEdit } from "./workspace-edit.js";

export { SymbolKind, isSymbolKind, parseSymbolKind, requireSymbolKind } from "./types.js";

export { ConflictType, isConflictType, parseConflictType, requireConflictType } from "./types.js";

export {
    classifyOccurrences,
    filterOccurrencesByKind,
    groupOccurrencesByFile,
    findOccurrencesInFile,
    countAffectedFiles
} from "./occurrence-analysis.js";

export type { OccurrenceClassification } from "./occurrence-analysis.js";

export {
    generateRenamePreview,
    formatRenamePlanReport,
    formatBatchRenamePlanReport,
    formatOccurrencePreview
} from "./rename-preview.js";

export type { FilePreview, RenamePreview } from "./rename-preview.js";

export {
    detectRenameConflicts,
    detectCircularRenames,
    validateRenameStructure,
    batchValidateScopeConflicts
} from "./validation.js";

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
    OccurrenceTracker,
    ParserBridge,
    PartialSemanticAnalyzer,
    PrepareRenamePlanOptions,
    Range,
    RefactorEngineDependencies,
    RenameImpactAnalysis,
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
