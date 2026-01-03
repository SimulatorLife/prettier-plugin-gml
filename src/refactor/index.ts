export { Refactor } from "./src/index.js";

export {
    SymbolKind,
    isSymbolKind,
    parseSymbolKind,
    requireSymbolKind,
    classifyOccurrences,
    filterOccurrencesByKind,
    groupOccurrencesByFile,
    findOccurrencesInFile,
    countAffectedFiles
} from "./src/index.js";

export type { RefactorEngine, WorkspaceEdit, OccurrenceClassification } from "./src/index.js";

export type {
    ApplyWorkspaceEditOptions,
    BatchRenameValidation,
    DependencyAnalyzer,
    EditValidator,
    ExecuteBatchRenameRequest,
    ExecuteRenameRequest,
    FileSymbolProvider,
    HotReloadSafetySummary,
    HotReloadUpdate,
    KeywordProvider,
    OccurrenceTracker,
    ParserBridge,
    RenameImpactAnalysis,
    RenameRequest,
    SemanticAnalyzer,
    SymbolKindValue,
    SymbolOccurrence,
    SymbolResolver,
    TranspilerPatch,
    ValidateRenameRequestOptions,
    ValidationSummary,
    WorkspaceReadFile,
    WorkspaceWriteFile
} from "./src/index.js";
