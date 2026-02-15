/**
 * Core types and interfaces for the refactor engine.
 * Defines symbols, occurrences, conflicts, dependencies, and validation contracts
 * that coordinate semantic analysis, transpiler integration, and safe renaming.
 */

import type { FileRename, WorkspaceEdit } from "./workspace-edit.js";

export type MaybePromise<T> = T | Promise<T>;

export type Range = { start: number; end: number };

/**
 * Generic helper for creating type-safe enum validators.
 * Eliminates boilerplate for type guard, parser, and require functions.
 */
function createEnumHelpers<T extends Record<string, string>>(enumObj: T, typeName: string) {
    type EnumValue = T[keyof T];
    const values = Object.freeze(Object.values(enumObj)) as ReadonlyArray<EnumValue>;
    const valueSet: ReadonlySet<string> = new Set(values);

    const is = (value: unknown): value is EnumValue => typeof value === "string" && valueSet.has(value);

    const parse = (value: unknown): EnumValue | null => (is(value) ? value : null);

    const require = (value: unknown, context?: string): EnumValue => {
        if (!is(value)) {
            const validValues = values.join(", ");
            const contextInfo = context ? ` (in ${context})` : "";
            throw new TypeError(
                `Invalid ${typeName}: ${JSON.stringify(value)}${contextInfo}. Must be one of: ${validValues}.`
            );
        }
        return value;
    };

    return { is, parse, require };
}

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

const symbolKindHelpers = createEnumHelpers(SymbolKind, "symbol kind");

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
    return symbolKindHelpers.is(value);
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
    return symbolKindHelpers.parse(value);
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
    return symbolKindHelpers.require(value, context);
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

const conflictTypeHelpers = createEnumHelpers(ConflictType, "conflict type");

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
    return conflictTypeHelpers.is(value);
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
    return conflictTypeHelpers.parse(value);
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
    return conflictTypeHelpers.require(value, context);
}

/**
 * Enumerated constants for symbol occurrence kinds.
 *
 * Occurrence kinds distinguish between definitions (where symbols are declared)
 * and references (where symbols are used). This enum centralizes valid occurrence
 * kinds to prevent stringly-typed branches and provides a single source of truth
 * for validation.
 *
 * @example
 * // Use typed constants instead of raw strings
 * if (occurrence.kind === OccurrenceKind.DEFINITION) { ... }
 *
 * // Validate runtime strings
 * const kind = parseOccurrenceKind(rawInput);
 */
export const OccurrenceKind = Object.freeze({
    DEFINITION: "definition",
    REFERENCE: "reference"
} as const);

export type OccurrenceKindValue = (typeof OccurrenceKind)[keyof typeof OccurrenceKind];

const occurrenceKindHelpers = createEnumHelpers(OccurrenceKind, "occurrence kind");

/**
 * Check whether a value is a valid occurrence kind.
 *
 * @param value - Candidate value to test
 * @returns True if value matches a known OccurrenceKind constant
 *
 * @example
 * if (isOccurrenceKind(rawString)) {
 *   // Safe to use as OccurrenceKindValue
 * }
 */
export function isOccurrenceKind(value: unknown): value is OccurrenceKindValue {
    return occurrenceKindHelpers.is(value);
}

/**
 * Parse and validate an occurrence kind string.
 *
 * @param value - Raw string to parse
 * @returns Valid OccurrenceKindValue or null if invalid
 *
 * @example
 * const kind = parseOccurrenceKind(occ.kind);
 * if (kind === null) {
 *   // Handle invalid kind
 * }
 */
export function parseOccurrenceKind(value: unknown): OccurrenceKindValue | null {
    return occurrenceKindHelpers.parse(value);
}

/**
 * Parse and validate an occurrence kind string, throwing on invalid input.
 *
 * @param value - Raw string to parse
 * @param context - Optional context for error message
 * @returns Valid OccurrenceKindValue
 * @throws {TypeError} If value is not a valid occurrence kind
 *
 * @example
 * const kind = requireOccurrenceKind(occ.kind, "occurrence analysis");
 */
export function requireOccurrenceKind(value: unknown, context?: string): OccurrenceKindValue {
    return occurrenceKindHelpers.require(value, context);
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
    kind?: OccurrenceKindValue;
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
    resolveSymbolId(name: string): MaybePromise<string | null | undefined>;
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
    getAdditionalSymbolEdits?(symbolId: string, newName: string): MaybePromise<WorkspaceEdit | null>;
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
 * semantic analysis capabilities. All methods are required when implementing
 * this interface. For partial implementations, use PartialSemanticAnalyzer.
 *
 * Consumers should prefer depending on the minimal interface they need
 * (SymbolResolver, OccurrenceTracker, etc.) rather than this composite
 * interface when possible.
 */
export interface SemanticAnalyzer
    extends SymbolResolver,
        OccurrenceTracker,
        FileSymbolProvider,
        DependencyAnalyzer,
        KeywordProvider,
        EditValidator {}

/**
 * Partial semantic analyzer for dependency injection.
 *
 * Allows RefactorEngine and other consumers to accept semantic analyzers
 * that only implement a subset of capabilities. This maintains flexibility
 * while enforcing ISP: consumers must check capability availability at runtime
 * (e.g., typeof semantic?.getSymbolOccurrences === "function") but the type
 * system correctly represents that methods may be absent.
 *
 * Prefer depending on specific role interfaces (SymbolResolver, OccurrenceTracker)
 * when the required capabilities are known at design time.
 */
export type PartialSemanticAnalyzer = Partial<SymbolResolver> &
    Partial<OccurrenceTracker> &
    Partial<FileSymbolProvider> &
    Partial<DependencyAnalyzer> &
    Partial<KeywordProvider> &
    Partial<EditValidator>;

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
    renameFile?: (oldPath: string, newPath: string) => MaybePromise<void>;
    deleteFile?: (path: string) => MaybePromise<void>;
    prepareHotReload?: boolean;
}

export interface ExecuteBatchRenameRequest {
    renames: Array<RenameRequest>;
    readFile: WorkspaceReadFile;
    writeFile: WorkspaceWriteFile;
    renameFile?: (oldPath: string, newPath: string) => MaybePromise<void>;
    deleteFile?: (path: string) => MaybePromise<void>;
    prepareHotReload?: boolean;
}

export interface PrepareRenamePlanOptions {
    validateHotReload?: boolean;
    hotReloadOptions?: HotReloadValidationOptions;
}

export interface HotReloadValidationOptions {
    checkTranspiler?: boolean;
    readFile?: WorkspaceReadFile;
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

export interface BatchRenamePlanSummary {
    workspace: WorkspaceEdit;
    validation: ValidationSummary;
    hotReload: ValidationSummary | null;
    batchValidation: BatchRenameValidation;
    impactAnalyses: Map<string, RenameImpactAnalysis>;
    cascadeResult: HotReloadCascadeResult | null;
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
    fileRenames: Array<FileRename>;
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

export interface RefactorProjectAnalysisProvider {
    isIdentifierOccupied(
        identifierName: string,
        context: {
            semantic: PartialSemanticAnalyzer | null;
            prepareRenamePlan: (
                request: { symbolId: string; newName: string },
                options: { validateHotReload: boolean }
            ) => Promise<RenamePlanSummary>;
        }
    ): Promise<boolean>;
    listIdentifierOccurrences(
        identifierName: string,
        context: {
            semantic: PartialSemanticAnalyzer | null;
            prepareRenamePlan: (
                request: { symbolId: string; newName: string },
                options: { validateHotReload: boolean }
            ) => Promise<RenamePlanSummary>;
        }
    ): Promise<Set<string>>;
    planFeatherRenames(
        requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>,
        filePath: string | null,
        projectRoot: string,
        context: {
            semantic: PartialSemanticAnalyzer | null;
            prepareRenamePlan: (
                request: { symbolId: string; newName: string },
                options: { validateHotReload: boolean }
            ) => Promise<RenamePlanSummary>;
        }
    ): Promise<
        Array<{
            identifierName: string;
            mode: "local-fallback" | "project-aware";
            preferredReplacementName: string;
            replacementName: string | null;
            skipReason?: string;
        }>
    >;
    assessGlobalVarRewrite(
        filePath: string | null,
        hasInitializer: boolean
    ): {
        allowRewrite: boolean;
        initializerMode: "existing" | "undefined";
        mode: "project-aware";
    };
    resolveLoopHoistIdentifier(preferredName: string): {
        identifierName: string;
        mode: "project-aware";
    };
}

export interface RefactorEngineDependencies {
    parser: ParserBridge | null;
    semantic: PartialSemanticAnalyzer | null;
    formatter: TranspilerBridge | null;
    projectAnalysisProvider: RefactorProjectAnalysisProvider | null;
}

export interface ApplyWorkspaceEditOptions {
    dryRun?: boolean;
    readFile: WorkspaceReadFile;
    writeFile?: WorkspaceWriteFile;
    renameFile?: (oldPath: string, newPath: string) => MaybePromise<void>;
    deleteFile?: (path: string) => MaybePromise<void>;
}

export interface RenameImpactNode {
    symbolId: string;
    symbolName: string;
    distance: number;
    isDirectlyAffected: boolean;
    dependents: Array<string>;
    dependsOn: Array<string>;
    filePath?: string;
    estimatedReloadTime?: number;
}

export interface RenameImpactGraph {
    nodes: Map<string, RenameImpactNode>;
    rootSymbol: string;
    totalAffectedSymbols: number;
    maxDepth: number;
    criticalPath: Array<string>;
    estimatedTotalReloadTime: number;
}
