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
    DependentSymbol,
    ExecuteBatchRenameRequest,
    ExecuteRenameRequest,
    ExecuteRenameResult,
    FileSymbol,
    HotReloadCascadeMetadata,
    HotReloadCascadeResult,
    HotReloadSafetySummary,
    HotReloadUpdate,
    HotReloadValidationOptions,
    MaybePromise,
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
    TranspilerBridge,
    TranspilerPatch,
    ValidateRenameRequestOptions,
    ValidationSummary,
    WorkspaceReadFile,
    WorkspaceWriteFile
} from "./types.js";
