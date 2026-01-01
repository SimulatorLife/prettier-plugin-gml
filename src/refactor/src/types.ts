import type { WorkspaceEdit } from "./workspace-edit.js";

export type MaybePromise<T> = T | Promise<T>;

export type Range = { start: number; end: number };

export interface AstNode {
    type?: string;
    name?: string;
    start: number;
    end: number;
    children?: Array<AstNode>;
}

export interface SymbolLocation {
    symbolId: string;
    name: string;
    range: Range;
}

export interface SymbolOccurrence {
    path: string;
    start: number;
    end: number;
    scopeId?: string;
    kind?: string;
}

export interface SymbolLookupResult {
    name: string;
}

export interface FileSymbol {
    id: string;
}

export interface DependentSymbol {
    symbolId: string;
    filePath: string;
}

export interface ParserBridge {
    parse(filePath: string): MaybePromise<AstNode>;
}

export interface SemanticValidationResult {
    errors?: Array<string>;
    warnings?: Array<string>;
}

/**
 * Symbol existence and lookup operations.
 *
 * Provides the ability to check whether symbols exist and perform
 * scope-aware name lookups without coupling to occurrence tracking,
 * dependency analysis, or file-level operations.
 */
export interface SymbolResolver {
    hasSymbol(symbolId: string): MaybePromise<boolean>;
    lookup(
        name: string,
        scopeId?: string
    ): MaybePromise<SymbolLookupResult | null | undefined>;
    getSymbolAtPosition(
        filePath: string,
        offset: number
    ): MaybePromise<SymbolLocation | null | undefined>;
}

/**
 * Symbol occurrence tracking.
 *
 * Provides the ability to find all occurrences (definitions and references)
 * of a symbol across the project without coupling to validation, dependency
 * analysis, or other semantic operations.
 */
export interface OccurrenceTracker {
    getSymbolOccurrences(
        symbolName: string
    ): MaybePromise<Array<SymbolOccurrence>>;
}

/**
 * File-level symbol operations.
 *
 * Provides the ability to query symbols defined in specific files
 * without coupling to cross-file dependency analysis or validation.
 */
export interface FileSymbolProvider {
    getFileSymbols(filePath: string): MaybePromise<Array<FileSymbol>>;
}

/**
 * Symbol dependency analysis.
 *
 * Provides the ability to track which symbols depend on other symbols,
 * essential for hot reload and impact analysis without coupling to
 * occurrence tracking or validation operations.
 */
export interface DependencyAnalyzer {
    getDependents(
        symbolIds: Array<string>
    ): MaybePromise<Array<DependentSymbol>>;
}

/**
 * Language keyword information.
 *
 * Provides access to reserved keywords for the language without
 * coupling to symbol resolution or other semantic operations.
 */
export interface KeywordProvider {
    getReservedKeywords(): MaybePromise<Array<string>>;
}

/**
 * Workspace edit validation.
 *
 * Provides semantic validation of workspace edits to detect conflicts
 * and issues before applying changes, without coupling to symbol queries
 * or dependency analysis.
 */
export interface EditValidator {
    validateEdits(
        workspace: WorkspaceEdit
    ): MaybePromise<SemanticValidationResult>;
}

/**
 * Complete semantic analyzer interface.
 *
 * Combines all role-focused interfaces for consumers that need full
 * semantic analysis capabilities. Consumers should prefer depending on
 * the minimal interface they need (SymbolResolver, OccurrenceTracker, etc.)
 * rather than this composite interface when possible.
 */
export interface SemanticAnalyzer
    extends Partial<SymbolResolver>,
        Partial<OccurrenceTracker>,
        Partial<FileSymbolProvider>,
        Partial<DependencyAnalyzer>,
        Partial<KeywordProvider>,
        Partial<EditValidator> {}

export interface TranspilerBridge {
    transpileScript(request: {
        sourceText: string;
        symbolId: string;
    }): MaybePromise<Record<string, unknown>>;
}

export interface RenameRequest {
    symbolId: string;
    newName: string;
}

export interface ExecuteRenameRequest extends RenameRequest {
    readFile: WorkspaceReadFile;
    writeFile: WorkspaceWriteFile;
    prepareHotReload?: boolean;
}

export interface ExecuteBatchRenameRequest {
    renames: Array<RenameRequest>;
    readFile: WorkspaceReadFile;
    writeFile: WorkspaceWriteFile;
    prepareHotReload?: boolean;
}

export interface PrepareRenamePlanOptions {
    validateHotReload?: boolean;
    hotReloadOptions?: HotReloadValidationOptions;
}

export interface HotReloadValidationOptions {
    checkTranspiler?: boolean;
}

export interface ValidationSummary {
    valid: boolean;
    errors: Array<string>;
    warnings: Array<string>;
    symbolName?: string;
    occurrenceCount?: number;
    hotReload?: HotReloadSafetySummary;
}

export interface RenamePlanSummary {
    workspace: WorkspaceEdit;
    validation: ValidationSummary;
    hotReload: ValidationSummary | null;
    analysis: RenameImpactAnalysis;
}

export interface RenameImpactSummary {
    symbolId: string;
    oldName: string;
    newName: string;
    affectedFiles: Array<string>;
    totalOccurrences: number;
    definitionCount: number;
    referenceCount: number;
    hotReloadRequired: boolean;
    dependentSymbols: Array<string>;
}

export interface RenameImpactAnalysis {
    valid: boolean;
    summary: RenameImpactSummary;
    conflicts: Array<ConflictEntry>;
    warnings: Array<ConflictEntry>;
}

export interface HotReloadUpdate {
    symbolId: string;
    action: "recompile" | "notify";
    filePath: string;
    affectedRanges: Array<Range>;
}

export interface ExecuteRenameResult {
    workspace: WorkspaceEdit;
    applied: Map<string, string>;
    hotReloadUpdates: Array<HotReloadUpdate>;
}

export interface TranspilerPatch {
    symbolId: string;
    patch: Record<string, unknown>;
    filePath: string;
}

export interface CascadeEntry {
    symbolId: string;
    distance: number;
    reason: string;
    filePath?: string;
}

export interface HotReloadCascadeMetadata {
    totalSymbols: number;
    maxDistance: number;
    hasCircular: boolean;
}

export interface HotReloadCascadeResult {
    cascade: Array<CascadeEntry>;
    order: Array<string>;
    circular: Array<Array<string>>;
    metadata: HotReloadCascadeMetadata;
}

export interface HotReloadSafetySummary {
    safe: boolean;
    reason: string;
    requiresRestart: boolean;
    canAutoFix: boolean;
    suggestions: Array<string>;
}

export interface ValidateRenameRequestOptions {
    includeHotReload?: boolean;
}

export interface BatchRenameValidation {
    valid: boolean;
    errors: Array<string>;
    warnings: Array<string>;
    renameValidations: Map<string, ValidationSummary>;
    conflictingSets: Array<Array<string>>;
}

export interface ConflictEntry {
    type: string;
    message: string;
    severity?: string;
    path?: string;
}

export type WorkspaceReadFile = (path: string) => MaybePromise<string>;
export type WorkspaceWriteFile = (
    path: string,
    content: string
) => MaybePromise<void>;

export interface RefactorEngineDependencies {
    parser: ParserBridge | null;
    semantic: SemanticAnalyzer | null;
    formatter: TranspilerBridge | null;
}

export interface ApplyWorkspaceEditOptions {
    dryRun?: boolean;
    readFile: WorkspaceReadFile;
    writeFile?: WorkspaceWriteFile;
}
