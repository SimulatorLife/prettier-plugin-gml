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

export interface SemanticAnalyzer {
    hasSymbol?(symbolId: string): MaybePromise<boolean>;
    getSymbolOccurrences?(
        symbolName: string
    ): MaybePromise<Array<SymbolOccurrence>>;
    lookup?(
        name: string,
        scopeId?: string
    ): MaybePromise<SymbolLookupResult | null | undefined>;
    getReservedKeywords?(): MaybePromise<Array<string>>;
    validateEdits?(
        workspace: WorkspaceEdit
    ): MaybePromise<SemanticValidationResult>;
    getFileSymbols?(filePath: string): MaybePromise<Array<FileSymbol>>;
    getDependents?(
        symbolIds: Array<string>
    ): MaybePromise<Array<DependentSymbol>>;
    getSymbolAtPosition?(
        filePath: string,
        offset: number
    ): MaybePromise<SymbolLocation | null | undefined>;
}

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
