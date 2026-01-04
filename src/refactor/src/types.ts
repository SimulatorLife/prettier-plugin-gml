import type { WorkspaceEdit } from "./workspace-edit.js";

export type MaybePromise<T> = T | Promise<T>;

export type Range = { start: number; end: number };

/**
 * Enumerated constants for GML symbol kinds.
 *
 * Symbol IDs follow the pattern `gml/{kind}/{name}`, where `kind` identifies
 * the semantic category of the symbol. This enum centralizes valid symbol
 * kinds to prevent stringly-typed branches and provides a single source of
 * truth for validation.
 *
 * @example
 * // Use typed constants instead of raw strings
 * if (symbolKind === SymbolKind.SCRIPT) { ... }
 *
 * // Validate runtime strings
 * const kind = parseSymbolKind(rawInput);
 */
export const SymbolKind = Object.freeze({
    SCRIPT: "script",
    VAR: "var",
    EVENT: "event",
    MACRO: "macro",
    ENUM: "enum"
} as const);

export type SymbolKindValue = (typeof SymbolKind)[keyof typeof SymbolKind];

const SYMBOL_KIND_VALUES = Object.freeze(Object.values(SymbolKind)) as ReadonlyArray<SymbolKindValue>;

const SYMBOL_KIND_SET: ReadonlySet<string> = new Set(SYMBOL_KIND_VALUES);

/**
 * Check whether a value is a valid symbol kind.
 *
 * @param value - Candidate value to test
 * @returns True if value matches a known SymbolKind constant
 *
 * @example
 * if (isSymbolKind(rawString)) {
 *   // Safe to use as SymbolKindValue
 * }
 */
export function isSymbolKind(value: unknown): value is SymbolKindValue {
    return typeof value === "string" && SYMBOL_KIND_SET.has(value);
}

/**
 * Parse and validate a symbol kind string.
 *
 * @param value - Raw string to parse
 * @returns Valid SymbolKindValue or null if invalid
 *
 * @example
 * const kind = parseSymbolKind(symbolParts[1]);
 * if (kind === null) {
 *   // Handle invalid kind
 * }
 */
export function parseSymbolKind(value: unknown): SymbolKindValue | null {
    return isSymbolKind(value) ? value : null;
}

/**
 * Parse and validate a symbol kind string, throwing on invalid input.
 *
 * @param value - Raw string to parse
 * @param context - Optional context for error message
 * @returns Valid SymbolKindValue
 * @throws {TypeError} If value is not a valid symbol kind
 *
 * @example
 * const kind = requireSymbolKind(symbolParts[1], symbolId);
 */
export function requireSymbolKind(value: unknown, context?: string): SymbolKindValue {
    if (!isSymbolKind(value)) {
        const validKinds = SYMBOL_KIND_VALUES.join(", ");
        const contextInfo = context ? ` (in ${context})` : "";
        throw new TypeError(
            `Invalid symbol kind: ${JSON.stringify(value)}${contextInfo}. Must be one of: ${validKinds}.`
        );
    }
    return value;
}

/**
 * Enumerated constants for refactoring conflict types.
 *
 * Conflicts represent issues detected during rename validation that would
 * break semantics or cause ambiguity. This enum centralizes valid conflict
 * types to prevent stringly-typed branches and provides a single source of
 * truth for validation.
 *
 * @example
 * // Use typed constants instead of raw strings
 * if (conflict.type === ConflictType.RESERVED) { ... }
 *
 * // Validate runtime strings
 * const type = parseConflictType(rawInput);
 */
export const ConflictType = Object.freeze({
    INVALID_IDENTIFIER: "invalid_identifier",
    SHADOW: "shadow",
    RESERVED: "reserved",
    MISSING_SYMBOL: "missing_symbol",
    LARGE_RENAME: "large_rename",
    MANY_DEPENDENTS: "many_dependents",
    ANALYSIS_ERROR: "analysis_error"
} as const);

export type ConflictTypeValue = (typeof ConflictType)[keyof typeof ConflictType];

const CONFLICT_TYPE_VALUES = Object.freeze(Object.values(ConflictType)) as ReadonlyArray<ConflictTypeValue>;

const CONFLICT_TYPE_SET: ReadonlySet<string> = new Set(CONFLICT_TYPE_VALUES);

/**
 * Check whether a value is a valid conflict type.
 *
 * @param value - Candidate value to test
 * @returns True if value matches a known ConflictType constant
 *
 * @example
 * if (isConflictType(rawString)) {
 *   // Safe to use as ConflictTypeValue
 * }
 */
export function isConflictType(value: unknown): value is ConflictTypeValue {
    return typeof value === "string" && CONFLICT_TYPE_SET.has(value);
}

/**
 * Parse and validate a conflict type string.
 *
 * @param value - Raw string to parse
 * @returns Valid ConflictTypeValue or null if invalid
 *
 * @example
 * const type = parseConflictType(rawInput);
 * if (type === null) {
 *   // Handle invalid type
 * }
 */
export function parseConflictType(value: unknown): ConflictTypeValue | null {
    return isConflictType(value) ? value : null;
}

/**
 * Parse and validate a conflict type string, throwing on invalid input.
 *
 * @param value - Raw string to parse
 * @param context - Optional context for error message
 * @returns Valid ConflictTypeValue
 * @throws {TypeError} If value is not a valid conflict type
 *
 * @example
 * const type = requireConflictType(conflict.type, "validation");
 */
export function requireConflictType(value: unknown, context?: string): ConflictTypeValue {
    if (!isConflictType(value)) {
        const validTypes = CONFLICT_TYPE_VALUES.join(", ");
        const contextInfo = context ? ` (in ${context})` : "";
        throw new TypeError(
            `Invalid conflict type: ${JSON.stringify(value)}${contextInfo}. Must be one of: ${validTypes}.`
        );
    }
    return value;
}

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
    lookup(name: string, scopeId?: string): MaybePromise<SymbolLookupResult | null | undefined>;
    getSymbolAtPosition(filePath: string, offset: number): MaybePromise<SymbolLocation | null | undefined>;
}

/**
 * Symbol occurrence tracking.
 *
 * Provides the ability to find all occurrences (definitions and references)
 * of a symbol across the project without coupling to validation, dependency
 * analysis, or other semantic operations.
 */
export interface OccurrenceTracker {
    getSymbolOccurrences(symbolName: string): MaybePromise<Array<SymbolOccurrence>>;
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
    getDependents(symbolIds: Array<string>): MaybePromise<Array<DependentSymbol>>;
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
    validateEdits(workspace: WorkspaceEdit): MaybePromise<SemanticValidationResult>;
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
    transpileScript(request: { sourceText: string; symbolId: string }): MaybePromise<Record<string, unknown>>;
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
    type: ConflictTypeValue;
    message: string;
    severity?: string;
    path?: string;
}

export type WorkspaceReadFile = (path: string) => MaybePromise<string>;
export type WorkspaceWriteFile = (path: string, content: string) => MaybePromise<void>;

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
