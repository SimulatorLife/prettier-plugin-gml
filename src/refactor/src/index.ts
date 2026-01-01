import * as RefactorAPI from "./refactor-engine.js";
import { WorkspaceEdit } from "./workspace-edit.js";

export const Refactor = Object.freeze({
    ...RefactorAPI,
    WorkspaceEdit
});

export { RefactorEngine } from "./refactor-engine.js";
export type { WorkspaceEdit } from "./workspace-edit.js";

export type {
    ApplyWorkspaceEditOptions,
    AstNode,
    BatchRenameValidation,
    CascadeEntry,
    ConflictEntry,
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
    PrepareRenamePlanOptions,
    Range,
    RefactorEngineDependencies,
    RenameImpactAnalysis,
    RenameImpactSummary,
    RenamePlanSummary,
    RenameRequest,
    SemanticAnalyzer,
    SemanticValidationResult,
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
