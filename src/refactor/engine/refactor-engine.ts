import { WorkspaceEdit, type GroupedTextEdits } from "./workspace-edit.js";
import { Core } from "@gml-modules/core";

type MaybePromise<T> = T | Promise<T>;

type Range = { start: number; end: number };

interface AstNode {
    type?: string;
    name?: string;
    start: number;
    end: number;
    children?: Array<AstNode>;
}

interface SymbolLocation {
    symbolId: string;
    name: string;
    range: Range;
}

interface SymbolOccurrence {
    path: string;
    start: number;
    end: number;
    scopeId?: string;
    kind?: string;
}

interface SymbolLookupResult {
    name: string;
}

interface FileSymbol {
    id: string;
}

interface DependentSymbol {
    symbolId: string;
    filePath: string;
}

interface ParserBridge {
    parse(filePath: string): MaybePromise<AstNode>;
}

interface SemanticValidationResult {
    errors?: Array<string>;
    warnings?: Array<string>;
}

interface SemanticAnalyzer {
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

interface TranspilerBridge {
    transpileScript(request: {
        sourceText: string;
        symbolId: string;
    }): MaybePromise<Record<string, unknown>>;
}

interface RenameRequest {
    symbolId: string;
    newName: string;
}

interface ExecuteRenameRequest extends RenameRequest {
    readFile: WorkspaceReadFile;
    writeFile: WorkspaceWriteFile;
    prepareHotReload?: boolean;
}

interface ExecuteBatchRenameRequest {
    renames: Array<RenameRequest>;
    readFile: WorkspaceReadFile;
    writeFile: WorkspaceWriteFile;
    prepareHotReload?: boolean;
}

interface PrepareRenamePlanOptions {
    validateHotReload?: boolean;
    hotReloadOptions?: HotReloadValidationOptions;
}

interface HotReloadValidationOptions {
    checkTranspiler?: boolean;
}

interface ValidationSummary {
    valid: boolean;
    errors: Array<string>;
    warnings: Array<string>;
}

interface RenamePlanSummary {
    workspace: WorkspaceEdit;
    validation: ValidationSummary;
    hotReload: ValidationSummary | null;
    analysis: RenameImpactAnalysis;
}

interface RenameImpactSummary {
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

interface RenameImpactAnalysis {
    valid: boolean;
    summary: RenameImpactSummary;
    conflicts: Array<ConflictEntry>;
    warnings: Array<ConflictEntry>;
}

interface HotReloadUpdate {
    symbolId: string;
    action: "recompile" | "notify";
    filePath: string;
    affectedRanges: Array<Range>;
}

interface ExecuteRenameResult {
    workspace: WorkspaceEdit;
    applied: Map<string, string>;
    hotReloadUpdates: Array<HotReloadUpdate>;
}

interface TranspilerPatch {
    symbolId: string;
    patch: Record<string, unknown>;
    filePath: string;
}

interface CascadeEntry {
    symbolId: string;
    distance: number;
    reason: string;
    filePath?: string;
}

interface HotReloadCascadeMetadata {
    totalSymbols: number;
    maxDistance: number;
    hasCircular: boolean;
}

interface HotReloadCascadeResult {
    cascade: Array<CascadeEntry>;
    order: Array<string>;
    circular: Array<Array<string>>;
    metadata: HotReloadCascadeMetadata;
}

interface HotReloadSafetySummary {
    safe: boolean;
    reason: string;
    requiresRestart: boolean;
    canAutoFix: boolean;
    suggestions: Array<string>;
}

interface ValidateRenameRequestOptions {
    includeHotReload?: boolean;
}

interface ConflictEntry {
    type: string;
    message: string;
    severity?: string;
    path?: string;
}

type WorkspaceReadFile = (path: string) => MaybePromise<string>;
type WorkspaceWriteFile = (path: string, content: string) => MaybePromise<void>;

interface RefactorEngineDependencies {
    parser: ParserBridge | null;
    semantic: SemanticAnalyzer | null;
    formatter: TranspilerBridge | null;
}

interface ApplyWorkspaceEditOptions {
    dryRun?: boolean;
    readFile: WorkspaceReadFile;
    writeFile?: WorkspaceWriteFile;
}

const IDENTIFIER_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertValidIdentifierName(name: unknown): string {
    if (typeof name !== "string") {
        throw new TypeError(
            `Identifier names must be strings. Received ${typeof name}.`
        );
    }

    const trimmed = name.trim();

    if (trimmed.length === 0) {
        throw new Error(
            "Identifier names must not be empty or whitespace-only"
        );
    }

    if (trimmed !== name) {
        throw new Error(
            "Identifier names must not include leading or trailing whitespace"
        );
    }

    if (!IDENTIFIER_NAME_PATTERN.test(name)) {
        throw new Error(
            `Identifier '${name}' is not a valid GML identifier (expected [A-Za-z_][A-Za-z0-9_]*)`
        );
    }

    return name;
}

/**
 * Escape special regex characters in an identifier name to use in regex patterns.
 * This allows searching for identifiers as whole words without accidentally
 * treating special characters as regex metacharacters.
 */
function escapeRegexIdentifier(name: string): string {
    return name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

/**
 * RefactorEngine coordinates semantic-safe edits across the project.
 * It consumes parser spans and semantic bindings to plan WorkspaceEdits
 * that avoid scope capture or shadowing.
 */
export class RefactorEngine {
    public readonly parser: ParserBridge | null;
    public readonly semantic: SemanticAnalyzer | null;
    public readonly formatter: TranspilerBridge | null;

    constructor({
        parser = null,
        semantic = null,
        formatter = null
    }: Partial<RefactorEngineDependencies> = {}) {
        this.parser = parser ?? null;
        this.semantic = semantic ?? null;
        this.formatter = formatter ?? null;
    }

    /**
     * Find the symbol at a specific location in a file.
     * Useful for triggering refactorings from editor positions.
     * @param {string} filePath - File path
     * @param {number} offset - Character offset in the file
     * @returns {Promise<{symbolId: string, name: string, range: {start: number, end: number}} | null>}
     */
    async findSymbolAtLocation(
        filePath: string,
        offset: number
    ): Promise<SymbolLocation | null> {
        if (!this.semantic) {
            return null;
        }

        // Attempt to use the semantic analyzer's position-based lookup if available.
        // This is the preferred method because it understands scope, binding, and
        // type information, allowing it to distinguish between identically-named
        // symbols in different contexts (e.g., local variables vs. global functions).
        const semantic = this.semantic;
        if (typeof semantic.getSymbolAtPosition === "function") {
            return semantic.getSymbolAtPosition(filePath, offset) ?? null;
        }

        // Fallback to parser-only AST traversal when the semantic analyzer doesn't
        // provide position-based lookup. This is less accurate because it can't
        // resolve bindings, but it still lets us find the syntactic node at the
        // given offset for basic rename operations.
        if (this.parser && typeof this.parser.parse === "function") {
            try {
                const ast = await this.parser.parse(filePath);
                return this.findNodeAtOffset(ast, offset);
            } catch {
                return null;
            }
        }

        return null;
    }

    /**
     * Helper to find AST node at a specific offset.
     * @private
     */
    private findNodeAtOffset(
        node: AstNode | null,
        offset: number
    ): SymbolLocation | null {
        if (!node || typeof node !== "object") {
            return null;
        }

        // Determine whether this node's source range encompasses the given offset.
        // We use closed-interval semantics (<=) so that offsets at the exact start
        // or end positions match the node, which is crucial for cursor-based
        // refactorings where the user clicks on the first or last character.
        if (node.start <= offset && offset <= node.end) {
            // Recurse into child nodes first (depth-first traversal) to find the
            // most specific node at the offset. This ensures we return the innermost
            // identifier or expression rather than a containing block statement.
            if (node.children) {
                for (const child of node.children) {
                    const found = this.findNodeAtOffset(child, offset);
                    if (found) {
                        return found;
                    }
                }
            }

            // If no child matches, return this node if it's an identifier. We filter
            // by type to avoid returning structural nodes like statements or blocks
            // that happen to contain the offset but aren't meaningful rename targets.
            if (node.type === "identifier" && node.name) {
                return {
                    symbolId: `gml/identifier/${node.name}`,
                    name: node.name,
                    range: { start: node.start, end: node.end }
                };
            }
        }

        return null;
    }

    /**
     * Validate symbol exists in the semantic index.
     * @param {string} symbolId - Symbol identifier (e.g., "gml/script/scr_name")
     * @returns {Promise<boolean>} True if symbol exists
     */
    async validateSymbolExists(symbolId: string): Promise<boolean> {
        if (!this.semantic) {
            throw new Error(
                "RefactorEngine requires a semantic analyzer to validate symbols"
            );
        }

        // Query the semantic analyzer's symbol table to determine whether the given
        // symbolId exists. This check prevents rename operations from targeting
        // non-existent symbols, which would otherwise silently succeed but produce
        // no edits, confusing users who expect feedback when they mistype a name.
        const semantic = this.semantic;
        if (typeof semantic.hasSymbol === "function") {
            return semantic.hasSymbol(symbolId);
        }

        // If the semantic analyzer doesn't expose a validation method, assume the
        // symbol exists. This fallback permits refactorings to proceed in
        // environments where the semantic layer is minimal or still initializing.
        return true;
    }

    /**
     * Gather all occurrences of a symbol from the semantic analyzer.
     * @param {string} symbolName - Symbol name to find
     * @returns {Promise<Array<{path: string, start: number, end: number, kind: string}>>}
     */
    async gatherSymbolOccurrences(
        symbolName: string
    ): Promise<Array<SymbolOccurrence>> {
        if (!this.semantic) {
            return [];
        }

        // Request all occurrences (definitions and references) of the symbol from
        // the semantic analyzer. This includes local variables, function parameters,
        // global functions, and any other binding sites. The semantic layer tracks
        // both the location (path, offset) and the kind (definition vs. reference)
        // of each occurrence, which later phases use to construct text edits.
        const semantic = this.semantic;
        if (typeof semantic.getSymbolOccurrences === "function") {
            return semantic.getSymbolOccurrences(symbolName);
        }

        // If occurrence tracking isn't available, return an empty array so the
        // rename operation can proceed without edits, avoiding a hard error.
        return [];
    }

    /**
     * Query the semantic analyzer for symbols defined in a specific file.
     * This is useful for hot reload coordination to determine which symbols
     * need recompilation when a file changes.
     *
     * @param {string} filePath - Path to the file to query
     * @returns {Promise<Array<{id: string}>>} Array of symbol objects with IDs
     *
     * @example
     * const symbols = await engine.getFileSymbols("scripts/scr_player.gml");
     * console.log(`File defines ${symbols.length} symbols`);
     * for (const symbol of symbols) {
     *     console.log(`  - ${symbol.id}`);
     * }
     */
    async getFileSymbols(filePath: string): Promise<Array<{ id: string }>> {
        if (!filePath || typeof filePath !== "string") {
            throw new TypeError(
                "getFileSymbols requires a valid file path string"
            );
        }

        if (!this.semantic) {
            return [];
        }

        const semantic = this.semantic;
        if (typeof semantic.getFileSymbols === "function") {
            return (await semantic.getFileSymbols(filePath)) ?? [];
        }

        return [];
    }

    /**
     * Query the semantic analyzer for symbols that depend on the given symbols.
     * This is essential for hot reload to determine which symbols need recompilation
     * when dependencies change.
     *
     * @param {Array<string>} symbolIds - Array of symbol IDs to query dependencies for
     * @returns {Promise<Array<{symbolId: string, filePath: string}>>} Dependent symbols
     *
     * @example
     * const dependents = await engine.getSymbolDependents([
     *     "gml/script/scr_base",
     *     "gml/script/scr_helper"
     * ]);
     * console.log(`Found ${dependents.length} dependent symbols`);
     */
    async getSymbolDependents(
        symbolIds: Array<string>
    ): Promise<Array<{ symbolId: string; filePath: string }>> {
        if (!Array.isArray(symbolIds)) {
            throw new TypeError(
                "getSymbolDependents requires an array of symbol IDs"
            );
        }

        if (symbolIds.length === 0) {
            return [];
        }

        if (!this.semantic) {
            return [];
        }

        const semantic = this.semantic;
        if (typeof semantic.getDependents === "function") {
            return (await semantic.getDependents(symbolIds)) ?? [];
        }

        return [];
    }

    /**
     * Check if a rename would introduce scope conflicts.
     * @param {string} oldName - Original symbol name
     * @param {string} newName - Proposed new name
     * @param {Array<{path: string, start: number, end: number, scopeId: string}>} occurrences - Symbol occurrences
     * @returns {Promise<Array<{type: string, message: string, path?: string}>>}
     */
    async detectRenameConflicts(
        oldName: string,
        newName: string,
        occurrences: Array<SymbolOccurrence>
    ): Promise<Array<ConflictEntry>> {
        const conflicts: Array<ConflictEntry> = [];
        let normalizedNewName: string;

        try {
            normalizedNewName = assertValidIdentifierName(newName);
        } catch (error) {
            conflicts.push({
                type: "invalid_identifier",
                message: error.message
            });
            return conflicts;
        }

        // Test whether renaming would introduce shadowing conflicts where the new
        // name collides with an existing symbol in the same scope. For example,
        // renaming a local variable `x` to `y` when `y` is already defined in that
        // scope would hide the original `y`, breaking references to it.
        const semantic = this.semantic;
        if (semantic && typeof semantic.lookup === "function") {
            for (const occurrence of occurrences) {
                // Perform a scope-aware lookup for the new name at each occurrence
                // site. If we find an existing binding that isn't the symbol we're
                // renaming, record a conflict so the user can resolve it manually.
                const existing = await semantic.lookup(
                    normalizedNewName,
                    occurrence.scopeId
                );
                if (existing && existing.name !== oldName) {
                    conflicts.push({
                        type: "shadow",
                        message: `Renaming '${oldName}' to '${normalizedNewName}' would shadow existing symbol in scope`,
                        path: occurrence.path
                    });
                }
            }
        }

        // Reject renames that would overwrite GML reserved keywords (like `if`,
        // `function`) or built-in identifiers (like `self`, `global`). Allowing
        // such renames would cause syntax errors or silently bind user symbols to
        // language constructs, breaking both the parser and runtime semantics.
        let reservedKeywords = new Set(
            [
                "if",
                "else",
                "while",
                "for",
                "do",
                "switch",
                "case",
                "default",
                "break",
                "continue",
                "return",
                "function",
                "var",
                "globalvar",
                "enum",
                "with",
                "repeat",
                "until",
                "exit",
                "self",
                "other",
                "all",
                "noone",
                "global"
            ].map((keyword) => keyword.toLowerCase())
        );

        if (semantic && typeof semantic.getReservedKeywords === "function") {
            const semanticReserved =
                (await semantic.getReservedKeywords()) ?? [];
            reservedKeywords = new Set([
                ...reservedKeywords,
                ...semanticReserved.map((keyword) => keyword.toLowerCase())
            ]);
        }

        if (reservedKeywords.has(normalizedNewName.toLowerCase())) {
            conflicts.push({
                type: "reserved",
                message: `'${normalizedNewName}' is a reserved keyword and cannot be used as an identifier`
            });
        }

        return conflicts;
    }

    /**
     * Build a directed graph of rename operations for cycle detection.
     * @private
     */
    private buildRenameGraph(
        renames: Array<RenameRequest>
    ): Map<string, string> {
        const graph = new Map<string, string>();

        for (const rename of renames) {
            const sourceId = rename.symbolId;
            const pathParts = sourceId.split("/");
            pathParts[pathParts.length - 1] = rename.newName;
            const targetId = pathParts.join("/");
            graph.set(sourceId, targetId);
        }

        return graph;
    }

    /**
     * Detect circular rename chains in a batch of rename operations.
     * Returns the first detected cycle as an array of symbol IDs, or an empty array if no cycles exist.
     *
     * A circular chain occurs when renames form a cycle, such as:
     * - A→B, B→A (simple 2-cycle)
     * - A→B, B→C, C→A (3-cycle)
     *
     * These chains are problematic because after applying the first rename, subsequent
     * renames in the cycle reference symbols that no longer exist by their original names.
     *
     * @private
     * @param {Array<{symbolId: string, newName: string}>} renames - Rename operations to check
     * @returns {Array<string>} First detected cycle as symbol IDs, or empty array if no cycles
     */
    private detectCircularRenames(
        renames: Array<RenameRequest>
    ): Array<string> {
        const graph = this.buildRenameGraph(renames);

        // Use depth-first search to detect cycles. We maintain a "visiting" set to
        // track nodes currently on the recursion stack, which allows us to identify
        // back edges that indicate cycles.
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const path: Array<string> = [];

        const dfs = (nodeId: string): Array<string> | null => {
            if (visiting.has(nodeId)) {
                // Found a back edge - extract the cycle from the current path.
                // We append nodeId to close the cycle for clearer visualization
                // in error messages (e.g., "A → B → C → A" instead of "A → B → C").
                const cycleStart = path.indexOf(nodeId);
                return [...path.slice(cycleStart), nodeId];
            }

            if (visited.has(nodeId)) {
                return null;
            }

            visiting.add(nodeId);
            path.push(nodeId);

            // Follow the rename edge to the next node (target of this rename).
            // We only recurse if the target is itself a source of another rename,
            // allowing us to detect chains like A→B→C where B is also being renamed.
            const nextId = graph.get(nodeId);
            if (nextId && graph.has(nextId)) {
                const cycle = dfs(nextId);
                if (cycle) {
                    return cycle;
                }
            }

            path.pop();
            visiting.delete(nodeId);
            visited.add(nodeId);

            return null;
        };

        // Check each rename operation as a potential cycle starting point
        for (const sourceId of graph.keys()) {
            if (!visited.has(sourceId)) {
                const cycle = dfs(sourceId);
                if (cycle) {
                    return cycle;
                }
            }
        }

        return [];
    }

    /**
     * Validate a rename request before planning edits.
     * Unlike planRename, this method returns validation results without throwing errors,
     * making it suitable for providing user feedback in IDE integrations and CLI tools.
     *
     * @param {Object} request - Rename request to validate
     * @param {string} request.symbolId - Symbol to rename (e.g., "gml/script/scr_foo")
     * @param {string} request.newName - Proposed new name for the symbol
     * @returns {Promise<{valid: boolean, errors: Array<string>, warnings: Array<string>, symbolName?: string, occurrenceCount?: number}>}
     *
     * @example
     * const validation = await engine.validateRenameRequest({
     *     symbolId: "gml/script/scr_player",
     *     newName: "scr_hero"
     * });
     *
     * if (!validation.valid) {
     *     console.error("Rename validation failed:", validation.errors);
     * } else if (validation.warnings.length > 0) {
     *     console.warn("Rename warnings:", validation.warnings);
     * }
     */
    async validateRenameRequest(
        request: RenameRequest,
        options?: ValidateRenameRequestOptions
    ): Promise<
        ValidationSummary & {
            symbolName?: string;
            occurrenceCount?: number;
            hotReload?: HotReloadSafetySummary;
        }
    > {
        const { symbolId, newName } = request ?? {};
        const opts = options ?? {};
        const errors: Array<string> = [];
        const warnings: Array<string> = [];
        let hotReload: HotReloadSafetySummary | undefined;

        // Validate request structure
        if (!symbolId || !newName) {
            errors.push("Both symbolId and newName are required");
            return { valid: false, errors, warnings };
        }

        if (typeof symbolId !== "string") {
            errors.push(
                `symbolId must be a string, received ${typeof symbolId}`
            );
            return { valid: false, errors, warnings };
        }

        if (typeof newName !== "string") {
            errors.push(`newName must be a string, received ${typeof newName}`);
            return { valid: false, errors, warnings };
        }

        // Validate identifier syntax
        let normalizedNewName: string;
        try {
            normalizedNewName = assertValidIdentifierName(newName);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            errors.push(errorMessage);
            return { valid: false, errors, warnings };
        }

        // Check if symbol exists in semantic index
        if (this.semantic) {
            const exists = await this.validateSymbolExists(symbolId);
            if (!exists) {
                errors.push(
                    `Symbol '${symbolId}' not found in semantic index. Ensure the project has been analyzed.`
                );
                return { valid: false, errors, warnings };
            }
        } else {
            warnings.push(
                "No semantic analyzer available - cannot verify symbol existence"
            );
        }

        // Extract the symbol's base name from its fully-qualified ID.
        // Symbol IDs follow the pattern "gml/{kind}/{name}" where {name} is the
        // last path component (e.g., "gml/script/scr_foo" → "scr_foo").
        // This name is used to search for all occurrences in the codebase.
        const symbolName = symbolId.split("/").pop() ?? symbolId;

        if (symbolName === normalizedNewName) {
            errors.push(
                `The new name '${normalizedNewName}' matches the existing identifier`
            );
            return { valid: false, errors, warnings };
        }

        // Gather occurrences to check for conflicts
        const occurrences = await this.gatherSymbolOccurrences(symbolName);

        if (occurrences.length === 0) {
            warnings.push(
                `No occurrences found for symbol '${symbolName}' - rename will have no effect`
            );
        }

        // Check for conflicts
        const conflicts = await this.detectRenameConflicts(
            symbolName,
            normalizedNewName,
            occurrences
        );

        for (const conflict of conflicts) {
            if (conflict.type === "reserved" || conflict.type === "shadow") {
                errors.push(conflict.message);
            } else {
                warnings.push(conflict.message);
            }
        }

        if (opts.includeHotReload && errors.length === 0) {
            hotReload = await this.checkHotReloadSafety(request);

            if (!hotReload.safe) {
                const hotReloadMessage = hotReload.requiresRestart
                    ? `Hot reload unavailable: ${hotReload.reason}`
                    : `Hot reload limitations detected: ${hotReload.reason}`;
                warnings.push(hotReloadMessage);
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            symbolName,
            occurrenceCount: occurrences.length,
            hotReload
        };
    }

    /**
     * Plan a rename refactoring for a symbol.
     * @param {Object} request - Rename request
     * @param {string} request.symbolId - Symbol to rename (e.g., "gml/script/scr_foo")
     * @param {string} request.newName - New name for the symbol
     * @returns {Promise<WorkspaceEdit>} Workspace edit with all necessary changes
     */
    async planRename(request: RenameRequest): Promise<WorkspaceEdit> {
        const { symbolId, newName } = request ?? {};

        // Ensure both symbolId and newName are provided and have the correct types.
        // Early validation prevents downstream failures and gives clear error messages
        // when callers pass incorrect arguments (e.g., undefined or numeric values).
        if (!symbolId || !newName) {
            throw new TypeError("planRename requires symbolId and newName");
        }

        if (typeof symbolId !== "string") {
            throw new TypeError(
                `symbolId must be a string, got ${typeof symbolId}`
            );
        }

        const normalizedNewName = assertValidIdentifierName(newName);

        // Confirm the symbol exists in the semantic index before proceeding. This
        // prevents wasted work gathering occurrences for non-existent symbols and
        // provides a clear error message when the user mistypes a symbol name.
        const exists = await this.validateSymbolExists(symbolId);
        if (!exists) {
            throw new Error(
                `Symbol '${symbolId}' not found in semantic index. ` +
                    `Ensure the project has been analyzed before attempting renames.`
            );
        }

        // Extract the symbol's base name from its fully-qualified ID by taking the
        // last path component. For example, "gml/script/scr_foo" becomes "scr_foo",
        // which we use to search for all occurrences in the codebase.
        const symbolName = symbolId.split("/").pop() ?? symbolId;

        if (symbolName === normalizedNewName) {
            throw new Error(
                `The new name '${normalizedNewName}' matches the existing identifier`
            );
        }

        // Collect all occurrences (definitions and references) of the symbol across
        // the workspace. This includes every location where the symbol appears, so
        // the rename operation can update all references simultaneously.
        const occurrences = await this.gatherSymbolOccurrences(symbolName);

        // Detect potential conflicts (shadowing, reserved keywords, etc.) before
        // applying edits. If conflicts exist, we abort the rename to prevent
        // introducing scope errors or breaking existing code.
        const conflicts = await this.detectRenameConflicts(
            symbolName,
            normalizedNewName,
            occurrences
        );

        if (conflicts.length > 0) {
            const messages = conflicts.map((c) => c.message).join("; ");
            throw new Error(
                `Cannot rename '${symbolName}' to '${normalizedNewName}': ${messages}`
            );
        }

        // Build a workspace edit containing text edits for every occurrence. Each
        // edit replaces the old symbol name with the new name at its source location.
        const workspace = new WorkspaceEdit();

        for (const occurrence of occurrences) {
            workspace.addEdit(
                occurrence.path,
                occurrence.start,
                occurrence.end,
                normalizedNewName
            );
        }

        return workspace;
    }

    /**
     * Validate a planned rename before applying it.
     * This performs a dry-run to detect conflicts.
     * @param {WorkspaceEdit} workspace - The planned edits
     * @returns {Promise<{valid: boolean, errors: Array<string>, warnings: Array<string>}>}
     */
    async validateRename(workspace: WorkspaceEdit): Promise<ValidationSummary> {
        const errors: Array<string> = [];
        const warnings: Array<string> = [];

        if (!workspace || !Core.isWorkspaceEditLike(workspace)) {
            errors.push("Invalid workspace edit");
            return { valid: false, errors, warnings };
        }

        if (workspace.edits.length === 0) {
            errors.push("Workspace edit contains no changes");
            return { valid: false, errors, warnings };
        }

        // Organize edits by file path so we can validate that edits within the same
        // file don't overlap or conflict. Overlapping edits would produce ambiguous
        // results (which edit wins?) and likely indicate a logic error in the rename.
        const grouped: GroupedTextEdits = workspace.groupByFile();

        // Examine each file's edit list for overlapping ranges. Since edits are
        // sorted in descending order by start position, we can detect overlaps by
        // checking whether the next edit's end position exceeds the current edit's
        // start position. Overlaps indicate that two edits target overlapping or
        // adjacent text spans, which would corrupt the output if applied naively.
        for (const [filePath, edits] of grouped.entries()) {
            for (let i = 0; i < edits.length - 1; i++) {
                const current = edits[i];
                const next = edits[i + 1];

                if (next.end > current.start) {
                    errors.push(
                        `Overlapping edits detected in ${filePath} at positions ${current.start}-${next.end}`
                    );
                }
            }

            // Warn when a single file receives an unusually large number of edits,
            // which could indicate that the rename is broader than intended (e.g.,
            // renaming a common identifier like "i" across an entire project).
            if (edits.length > 50) {
                warnings.push(
                    `Large number of edits (${edits.length}) planned for ${filePath}. ` +
                        `Consider reviewing the scope of this refactoring.`
                );
            }
        }

        // If semantic analyzer is available, perform deeper validation
        const semantic = this.semantic;
        if (semantic && typeof semantic.validateEdits === "function") {
            try {
                const semanticValidation =
                    (await semantic.validateEdits(workspace)) ?? {};
                errors.push(...(semanticValidation.errors || []));
                warnings.push(...(semanticValidation.warnings || []));
            } catch (error) {
                warnings.push(
                    `Semantic validation failed: ${error.message}. Proceeding with basic validation only.`
                );
            }
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    /**
     * Apply workspace edits to files.
     * This method executes the planned changes, applying edits to source files.
     * @param {WorkspaceEdit} workspace - The edits to apply
     * @param {Object} options - Application options
     * @param {boolean} options.dryRun - If true, return modified content without writing files
     * @param {Function} options.readFile - Function to read file content (path) => string
     * @param {Function} options.writeFile - Function to write file content (path, content) => void
     * @returns {Promise<Map<string, string>>} Map of file paths to their new content
     */
    async applyWorkspaceEdit(
        workspace: WorkspaceEdit,
        options?: ApplyWorkspaceEditOptions
    ): Promise<Map<string, string>> {
        const opts: ApplyWorkspaceEditOptions =
            options ?? ({} as ApplyWorkspaceEditOptions);
        const { dryRun = false, readFile, writeFile } = opts;

        if (!workspace || !Core.isWorkspaceEditLike(workspace)) {
            throw new TypeError("applyWorkspaceEdit requires a WorkspaceEdit");
        }

        if (!readFile || typeof readFile !== "function") {
            throw new TypeError(
                "applyWorkspaceEdit requires a readFile function"
            );
        }

        if (!dryRun && (!writeFile || typeof writeFile !== "function")) {
            throw new TypeError(
                "applyWorkspaceEdit requires a writeFile function when not in dry-run mode"
            );
        }

        // Verify the workspace edit is structurally sound and free of conflicts
        // before modifying any files. This prevents partial application of invalid
        // edits that could leave the codebase in an inconsistent state.
        const validation = await this.validateRename(workspace);
        if (!validation.valid) {
            throw new Error(
                `Cannot apply workspace edit: ${validation.errors.join("; ")}`
            );
        }

        // Organize edits by file so we can process each file independently. This
        // allows us to load, edit, and save one file at a time, reducing memory
        // usage and enabling incremental progress reporting.
        const grouped = workspace.groupByFile();
        const results = new Map<string, string>();

        // Process each file by loading its current content, applying all edits for
        // that file, and optionally writing the modified content back to disk.
        for (const [filePath, edits] of grouped.entries()) {
            const originalContent = await readFile(filePath);

            // Apply edits from high to low offset (reverse order) so that earlier
            // edits don't invalidate the offsets of later edits. When edits are
            // sorted descending, modifying the end of the file first keeps positions
            // at the beginning stable, eliminating the need to recalculate offsets.
            let newContent = originalContent;
            for (const edit of edits) {
                newContent =
                    newContent.slice(0, edit.start) +
                    edit.newText +
                    newContent.slice(edit.end);
            }

            results.set(filePath, newContent);

            // Write the modified content to disk unless we're in dry-run mode, which
            // lets callers preview changes before committing them.
            if (!dryRun) {
                await writeFile(filePath, newContent);
            }
        }

        return results;
    }

    /**
     * Plan multiple rename operations that should be applied together.
     * This is useful for refactoring related symbols atomically.
     * @param {Array<{symbolId: string, newName: string}>} renames - Array of rename operations
     * @returns {Promise<WorkspaceEdit>} Combined workspace edit for all renames
     */
    async planBatchRename(
        renames: Array<RenameRequest>
    ): Promise<WorkspaceEdit> {
        if (!Array.isArray(renames)) {
            throw new TypeError("planBatchRename requires an array of renames");
        }

        if (renames.length === 0) {
            throw new Error("planBatchRename requires at least one rename");
        }

        // Validate all rename requests first
        for (const rename of renames) {
            if (!rename.symbolId || !rename.newName) {
                throw new TypeError(
                    "Each rename requires symbolId and newName"
                );
            }

            if (typeof rename.symbolId !== "string") {
                throw new TypeError(
                    `symbolId must be a string, got ${typeof rename.symbolId}`
                );
            }

            assertValidIdentifierName(rename.newName);
        }

        // Ensure no two renames target the same new name, which would cause
        // multiple symbols to collide after the refactoring. For example, renaming
        // both `foo` and `bar` to `baz` would leave only one symbol named `baz`,
        // breaking references to the other. We detect this early to avoid
        // generating a corrupted workspace edit.
        const newNames = new Set<string>();
        for (const rename of renames) {
            const normalizedNewName = assertValidIdentifierName(rename.newName);
            if (newNames.has(normalizedNewName)) {
                throw new Error(
                    `Cannot rename multiple symbols to '${normalizedNewName}'`
                );
            }
            newNames.add(normalizedNewName);
        }

        // Detect circular rename chains where symbol names form a cycle, such as
        // renaming A→B and B→A simultaneously. These chains create conflicts because
        // after applying the first rename, the second rename's source symbol no longer
        // exists by its original name, causing the batch operation to fail or produce
        // incorrect results. We detect cycles by building a directed graph of renames
        // and checking for strongly connected components.
        const circularChain = this.detectCircularRenames(renames);
        if (circularChain.length > 0) {
            const chain = circularChain
                .map((id) => id.split("/").pop())
                .join(" → ");
            throw new Error(
                `Circular rename chain detected: ${chain}. ` +
                    `Cannot rename symbols in a cycle as it would create conflicts.`
            );
        }

        // Plan each rename independently, collecting the resulting workspace edits.
        // We defer merging until all renames are validated so that a single invalid
        // rename doesn't invalidate the entire batch.
        const workspaces: Array<WorkspaceEdit> = [];
        for (const rename of renames) {
            const workspace = await this.planRename(rename);
            workspaces.push(workspace);
        }

        // Combine all workspace edits into a single merged edit that can be applied
        // atomically. This ensures either all renames succeed together or none are
        // applied, maintaining consistency.
        const merged = new WorkspaceEdit();
        for (const workspace of workspaces) {
            for (const edit of workspace.edits) {
                merged.addEdit(edit.path, edit.start, edit.end, edit.newText);
            }
        }

        // Validate the merged result for overlapping edits
        const validation = await this.validateRename(merged);
        if (!validation.valid) {
            throw new Error(
                `Batch rename validation failed: ${validation.errors.join("; ")}`
            );
        }

        return merged;
    }

    /**
     * Execute a rename refactoring with optional hot reload integration.
     * This is a high-level method that combines planning, validation, application, and hot reload preparation.
     * @param {Object} request - Rename request
     * @param {string} request.symbolId - Symbol to rename
     * @param {string} request.newName - New name for the symbol
     * @param {Function} request.readFile - Function to read file content
     * @param {Function} request.writeFile - Function to write file content
     * @param {boolean} request.prepareHotReload - Whether to prepare hot reload updates
     * @returns {Promise<{workspace: WorkspaceEdit, applied: Map<string, string>, hotReloadUpdates: Array}>}
     */
    async executeRename(
        request: ExecuteRenameRequest
    ): Promise<ExecuteRenameResult> {
        const {
            symbolId,
            newName,
            readFile,
            writeFile,
            prepareHotReload = false
        } = request ?? ({} as ExecuteRenameRequest);

        if (!symbolId || !newName) {
            throw new TypeError("executeRename requires symbolId and newName");
        }

        if (!readFile || typeof readFile !== "function") {
            throw new TypeError(
                "executeRename requires a readFile function to load files"
            );
        }

        if (!writeFile || typeof writeFile !== "function") {
            throw new TypeError(
                "executeRename requires a writeFile function to save files"
            );
        }

        // Plan the rename
        const workspace = await this.planRename({ symbolId, newName });

        // Validate the planned edits before touching the filesystem. This ensures
        // overlapping or otherwise invalid edits are caught early, preventing
        // partial writes that could leave the workspace in an inconsistent state.
        const validation = await this.validateRename(workspace);
        if (!validation.valid) {
            throw new Error(
                `Rename validation failed: ${validation.errors.join("; ")}`
            );
        }

        // Apply the edits
        const applied = await this.applyWorkspaceEdit(workspace, {
            readFile,
            writeFile,
            dryRun: false
        });

        // Prepare hot reload updates if requested
        let hotReloadUpdates: Array<HotReloadUpdate> = [];
        if (prepareHotReload) {
            hotReloadUpdates = await this.prepareHotReloadUpdates(workspace);
        }

        return { workspace, applied, hotReloadUpdates };
    }

    /**
     * Execute multiple renames atomically with optional hot reload integration.
     * @param {Object} request - Batch rename request
     * @param {Array<{symbolId: string, newName: string}>} request.renames - Rename operations
     * @param {Function} request.readFile - Function to read file content
     * @param {Function} request.writeFile - Function to write file content
     * @param {boolean} request.prepareHotReload - Whether to prepare hot reload updates
     * @returns {Promise<{workspace: WorkspaceEdit, applied: Map<string, string>, hotReloadUpdates: Array}>}
     */
    async executeBatchRename(
        request: ExecuteBatchRenameRequest
    ): Promise<ExecuteRenameResult> {
        const {
            renames,
            readFile,
            writeFile,
            prepareHotReload = false
        } = request ?? ({} as ExecuteBatchRenameRequest);

        if (!renames) {
            throw new TypeError("executeBatchRename requires renames array");
        }

        if (!readFile || typeof readFile !== "function") {
            throw new TypeError(
                "executeBatchRename requires a readFile function"
            );
        }

        if (!writeFile || typeof writeFile !== "function") {
            throw new TypeError(
                "executeBatchRename requires a writeFile function"
            );
        }

        // Plan the batch rename
        const workspace = await this.planBatchRename(renames);

        // Apply the edits
        const applied = await this.applyWorkspaceEdit(workspace, {
            readFile,
            writeFile,
            dryRun: false
        });

        // Prepare hot reload updates if requested
        let hotReloadUpdates: Array<HotReloadUpdate> = [];
        if (prepareHotReload) {
            hotReloadUpdates = await this.prepareHotReloadUpdates(workspace);
        }

        return { workspace, applied, hotReloadUpdates };
    }

    /**
     * Prepare a rename plan with validation and optional hot reload checks.
     * Bundles the planning, validation, and impact analysis phases so callers
     * can present a complete preview before writing any files.
     *
     * @param {Object} request - Rename request forwarded to {@link planRename}.
     * @param {string} request.symbolId - Symbol identifier to rename.
     * @param {string} request.newName - Proposed new identifier name.
     * @param {Object} [options] - Additional validation controls.
     * @param {boolean} [options.validateHotReload=false] - Whether to perform hot reload compatibility checks.
     * @param {Object} [options.hotReloadOptions] - Options forwarded to {@link validateHotReloadCompatibility}.
     * @returns {Promise<{workspace: WorkspaceEdit, validation: {valid: boolean, errors: Array<string>, warnings: Array<string>}, hotReload: {valid: boolean, errors: Array<string>, warnings: Array<string>} | null, analysis: {valid: boolean, summary: Object, conflicts: Array, warnings: Array}}>} Aggregated rename plan data.
     */
    async prepareRenamePlan(
        request: RenameRequest,
        options?: PrepareRenamePlanOptions
    ): Promise<RenamePlanSummary> {
        const opts = options ?? {};
        const { validateHotReload = false, hotReloadOptions: rawHotOptions } =
            opts;
        const hotReloadOptions: HotReloadValidationOptions =
            rawHotOptions ?? {};

        // Plan the rename to capture all edits up front.
        const workspace = await this.planRename(request);

        // Run structural validation so callers can surface blocking issues
        // without attempting to apply the edits.
        const validation = await this.validateRename(workspace);

        // Only perform the more expensive hot reload compatibility checks when
        // explicitly requested. This keeps the helper lightweight for callers
        // that only need static validation feedback.
        let hotReloadValidation: ValidationSummary | null = null;
        if (validateHotReload) {
            hotReloadValidation = await this.validateHotReloadCompatibility(
                workspace,
                hotReloadOptions
            );
        }

        // Provide an impact analysis snapshot so UIs can preview how many files
        // will change and whether dependent symbols need attention.
        const analysis = await this.analyzeRenameImpact(request);

        return {
            workspace,
            validation,
            hotReload: hotReloadValidation,
            analysis
        };
    }

    /**
     * Validate that workspace edits won't break hot reload functionality.
     * Checks for issues that could prevent patches from being applied correctly.
     * @param {WorkspaceEdit} workspace - The workspace edit to validate
     * @param {Object} options - Validation options
     * @param {boolean} options.checkTranspiler - Whether to validate transpiler compatibility
     * @returns {Promise<{valid: boolean, errors: Array<string>, warnings: Array<string>}>}
     */
    validateHotReloadCompatibility(
        workspace: WorkspaceEdit,
        options?: HotReloadValidationOptions
    ): Promise<ValidationSummary> {
        const opts = options ?? {};
        const { checkTranspiler = false } = opts;
        const errors: Array<string> = [];
        const warnings: Array<string> = [];

        if (!workspace || !Core.isWorkspaceEditLike(workspace)) {
            errors.push("Invalid workspace edit");
            return Promise.resolve({ valid: false, errors, warnings });
        }

        if (workspace.edits.length === 0) {
            warnings.push(
                "Workspace edit contains no changes - hot reload not needed"
            );
            return Promise.resolve({ valid: true, errors, warnings });
        }

        // Group edits by file
        const grouped = workspace.groupByFile();

        // Check each file for hot reload compatibility
        for (const [filePath, edits] of grouped.entries()) {
            // Validate file is a GML script (hot reloadable)
            if (!filePath.endsWith(".gml")) {
                warnings.push(
                    `File ${filePath} is not a GML script - hot reload may not apply`
                );
            }

            // Examine each edit to detect whether it introduces language constructs
            // that GameMaker's runtime can't hot-reload safely. Global variables,
            // macros, and enums affect compile-time state or global scope, so
            // modifying them typically requires restarting the game to ensure the
            // runtime re-initializes these declarations with updated values.
            for (const edit of edits) {
                if (edit.newText.includes("globalvar")) {
                    warnings.push(
                        `Edit in ${filePath} introduces 'globalvar' - may require full reload`
                    );
                }

                if (edit.newText.includes("#macro")) {
                    warnings.push(
                        `Edit in ${filePath} introduces '#macro' - may require full reload`
                    );
                }

                if (edit.newText.includes("enum ")) {
                    warnings.push(
                        `Edit in ${filePath} introduces 'enum' - may require full reload`
                    );
                }
            }

            // Measure the total size of the replacement text across all edits to
            // identify large-scale changes. Edits that introduce thousands of
            // characters likely represent substantial rewrites (e.g., refactoring an
            // entire function body), which may confuse GameMaker's hot-reload engine
            // and benefit from a full restart to ensure clean initialization.
            const totalCharsChanged = edits.reduce(
                (sum, e) => sum + e.newText.length,
                0
            );
            if (totalCharsChanged > 5000) {
                warnings.push(
                    `Large edit in ${filePath} (${totalCharsChanged} characters) - consider full reload`
                );
            }
        }

        // If transpiler check is requested, validate transpilation will work
        if (
            checkTranspiler &&
            this.formatter &&
            typeof this.formatter.transpileScript === "function"
        ) {
            // We'll check if any symbols being edited can be transpiled
            // This is a placeholder for more sophisticated checks
            warnings.push(
                "Transpiler compatibility check requested - ensure changed symbols can be transpiled"
            );
        }

        return Promise.resolve({
            valid: errors.length === 0,
            errors,
            warnings
        });
    }

    /**
     * Prepare integration data for hot reload after a refactor.
     * Analyzes changed files to determine which symbols need recompilation.
     * @param {WorkspaceEdit} workspace - Applied edits
     * @returns {Promise<Array<{symbolId: string, action: string, filePath: string, affectedRanges: Array<{start: number, end: number}>}>>}
     */
    async prepareHotReloadUpdates(
        workspace: WorkspaceEdit
    ): Promise<Array<HotReloadUpdate>> {
        const updates: Array<HotReloadUpdate> = [];

        if (!workspace || workspace.edits.length === 0) {
            return updates;
        }

        // Group edits by file
        const grouped = workspace.groupByFile();
        const updatesBySymbol = new Map<string, HotReloadUpdate>();

        for (const [filePath, edits] of grouped.entries()) {
            // Determine which symbols are defined in this file
            let affectedSymbols = [];

            if (
                this.semantic &&
                typeof this.semantic.getFileSymbols === "function"
            ) {
                affectedSymbols = await this.semantic.getFileSymbols(filePath);
            }

            // If we have specific symbol information, create targeted updates
            if (affectedSymbols.length > 0) {
                for (const symbol of affectedSymbols) {
                    const update: HotReloadUpdate = {
                        symbolId: symbol.id,
                        action: "recompile",
                        filePath,
                        affectedRanges: edits.map((e) => ({
                            start: e.start,
                            end: e.end
                        }))
                    };
                    updates.push(update);
                    updatesBySymbol.set(symbol.id, update);
                }
            } else {
                // Fallback: create a generic update for the file
                const update: HotReloadUpdate = {
                    symbolId: `file://${filePath}`,
                    action: "recompile",
                    filePath,
                    affectedRanges: edits.map((e) => ({
                        start: e.start,
                        end: e.end
                    }))
                };
                updates.push(update);
                updatesBySymbol.set(update.symbolId, update);
            }
        }

        // Expand to transitive dependents using the cascade helper so hot reload
        // consumers receive a full picture of which symbols should be refreshed.
        const cascade = await this.computeHotReloadCascade(
            Array.from(updatesBySymbol.keys())
        );
        for (const entry of cascade.cascade) {
            if (updatesBySymbol.has(entry.symbolId)) {
                continue;
            }

            if (!entry.filePath) {
                continue;
            }

            const dependentUpdate: HotReloadUpdate = {
                symbolId: entry.symbolId,
                action: "notify",
                filePath: entry.filePath,
                affectedRanges: []
            };
            updates.push(dependentUpdate);
            updatesBySymbol.set(entry.symbolId, dependentUpdate);
        }

        return updates;
    }

    /**
     * Analyze the impact of a planned rename without applying it.
     * Provides detailed information about what will be changed.
     * @param {Object} request - Analysis request
     * @param {string} request.symbolId - Symbol to analyze
     * @param {string} request.newName - Proposed new name
     * @returns {Promise<{valid: boolean, summary: Object, conflicts: Array, warnings: Array}>}
     */
    async analyzeRenameImpact(
        request: RenameRequest
    ): Promise<RenameImpactAnalysis> {
        const { symbolId, newName } = request ?? {};

        if (!symbolId || !newName) {
            throw new TypeError(
                "analyzeRenameImpact requires symbolId and newName"
            );
        }

        if (typeof symbolId !== "string") {
            throw new TypeError(
                `symbolId must be a string, got ${typeof symbolId}`
            );
        }

        const normalizedNewName = assertValidIdentifierName(newName);

        const oldName = symbolId.split("/").pop() ?? symbolId;
        const summary = {
            symbolId,
            oldName,
            newName: normalizedNewName,
            affectedFiles: new Set<string>(),
            totalOccurrences: 0,
            definitionCount: 0,
            referenceCount: 0,
            hotReloadRequired: false,
            dependentSymbols: new Set<string>()
        };

        const serializeSummary = () => ({
            symbolId: summary.symbolId,
            oldName: summary.oldName,
            newName: summary.newName,
            affectedFiles: Array.from(summary.affectedFiles),
            totalOccurrences: summary.totalOccurrences,
            definitionCount: summary.definitionCount,
            referenceCount: summary.referenceCount,
            hotReloadRequired: summary.hotReloadRequired,
            dependentSymbols: Array.from(summary.dependentSymbols)
        });

        const conflicts: Array<ConflictEntry> = [];
        const warnings: Array<ConflictEntry> = [];

        try {
            // Validate symbol exists
            const exists = await this.validateSymbolExists(symbolId);
            if (!exists) {
                conflicts.push({
                    type: "missing_symbol",
                    message: `Symbol '${symbolId}' not found in semantic index`,
                    severity: "error"
                });
                return {
                    valid: false,
                    summary: serializeSummary(),
                    conflicts,
                    warnings
                };
            }

            // Gather occurrences
            const occurrences = await this.gatherSymbolOccurrences(
                summary.oldName
            );
            summary.totalOccurrences = occurrences.length;

            // Record which files will be modified by this rename so the user can
            // review the scope before applying changes. We also categorize each
            // occurrence as either a definition (where the symbol is declared) or a
            // reference (where it's used), giving insight into the symbol's role.
            for (const occ of occurrences) {
                summary.affectedFiles.add(occ.path);
                if (occ.kind === "definition") {
                    summary.definitionCount++;
                } else {
                    summary.referenceCount++;
                }
            }

            // Test for potential rename conflicts (shadowing, reserved keywords) that
            // would break the code if applied. We collect all conflicts across all
            // renames in the batch so the user can see the complete picture before
            // deciding whether to proceed or adjust the new names.
            const detectedConflicts = await this.detectRenameConflicts(
                summary.oldName,
                normalizedNewName,
                occurrences
            );
            conflicts.push(...detectedConflicts);

            // Determine whether the GameMaker runtime can hot-reload these changes
            // without a full restart. If occurrences exist, we assume hot reload is
            // needed and query the semantic analyzer to identify dependent symbols
            // that also need reloading to maintain consistency.
            if (summary.totalOccurrences > 0) {
                summary.hotReloadRequired = true;

                if (
                    this.semantic &&
                    typeof this.semantic.getDependents === "function"
                ) {
                    const dependents =
                        (await this.semantic.getDependents([symbolId])) ?? [];
                    for (const dep of dependents) {
                        summary.dependentSymbols.add(dep.symbolId);
                    }
                }
            }

            // Alert the user when a rename affects many occurrences or has widespread
            // dependencies. Large-scale renames increase the risk of unintended
            // side effects (e.g., renaming a common utility function breaks dozens of
            // call sites), so these warnings encourage the user to review the scope.
            if (summary.totalOccurrences > 50) {
                warnings.push({
                    type: "large_rename",
                    message: `This rename will affect ${summary.totalOccurrences} occurrences across ${summary.affectedFiles.size} files`,
                    severity: "warning"
                });
            }

            if (summary.dependentSymbols.size > 10) {
                warnings.push({
                    type: "many_dependents",
                    message: `${summary.dependentSymbols.size} other symbols depend on this symbol`,
                    severity: "info"
                });
            }
        } catch (error) {
            conflicts.push({
                type: "analysis_error",
                message: `Failed to analyze impact: ${error.message}`,
                severity: "error"
            });
        }

        const serializedSummary = serializeSummary();

        return {
            valid: conflicts.length === 0,
            summary: serializedSummary,
            conflicts,
            warnings
        };
    }

    /**
     * Compute the full dependency cascade for hot reload operations.
     * Takes a set of changed symbols and computes all transitive dependents
     * that need to be reloaded, ordered for safe application.
     * @param {Array<string>} changedSymbolIds - Symbol IDs that have changed
     * @returns {Promise<{
     *   cascade: Array<{symbolId: string, distance: number, reason: string}>,
     *   order: Array<string>,
     *   circular: Array<Array<string>>,
     *   metadata: {totalSymbols: number, maxDistance: number, hasCircular: boolean}
     * }>}
     */
    async computeHotReloadCascade(
        changedSymbolIds: Array<string>
    ): Promise<HotReloadCascadeResult> {
        if (!Array.isArray(changedSymbolIds)) {
            throw new TypeError(
                "computeHotReloadCascade requires an array of symbol IDs"
            );
        }

        if (changedSymbolIds.length === 0) {
            return {
                cascade: [],
                order: [],
                circular: [],
                metadata: {
                    totalSymbols: 0,
                    maxDistance: 0,
                    hasCircular: false
                }
            };
        }

        // Track visited symbols to detect cycles and compute transitive closure
        const visited = new Set<string>();
        const visiting = new Set<string>(); // For cycle detection
        const cascade = new Map<string, CascadeEntry>(); // symbolId -> entry
        const circular: Array<Array<string>> = [];
        const dependencyGraph = new Map<string, Array<string>>();

        // Initialize changed symbols at distance 0
        for (const symbolId of changedSymbolIds) {
            cascade.set(symbolId, {
                symbolId,
                distance: 0,
                reason: "direct change"
            });
            visited.add(symbolId);
        }

        // Track the traversal path during DFS for complete cycle reconstruction.
        // This array is intentionally shared across all recursive calls to maintain
        // the full call stack, enabling accurate cycle path tracing when a back edge
        // is detected (e.g., A→B→C→A results in visitPath = [A, B, C] at the moment
        // we discover C depends on A).
        const visitPath: Array<string> = [];

        // Helper to reconstruct a complete cycle path from the current traversal state.
        // When we detect a symbol already in the visiting set, we know we've found a
        // back edge. This function extracts the cycle from visitPath by finding where
        // the cycle starts and appending the re-encountered symbol to close the loop.
        const reconstructCyclePath = (
            cycleStartSymbol: string
        ): Array<string> => {
            const cycleStartIndex = visitPath.indexOf(cycleStartSymbol);
            if (cycleStartIndex !== -1) {
                return [...visitPath.slice(cycleStartIndex), cycleStartSymbol];
            }
            // Fallback if symbol isn't in path (shouldn't happen, but be defensive)
            return [cycleStartSymbol];
        };

        // Helper to explore dependencies recursively
        const exploreDependents = async (
            symbolId: string,
            currentDistance: number,
            parentReason: string
        ): Promise<{ cycleDetected: boolean; cycle?: Array<string> }> => {
            // Check if we're already exploring this symbol (cycle detection)
            if (visiting.has(symbolId)) {
                // Found a cycle - reconstruct the full cycle path from visitPath.
                // The cycle starts at the first occurrence of symbolId in visitPath
                // and extends to the current position where we re-encountered it.
                const cyclePath = reconstructCyclePath(symbolId);
                return { cycleDetected: true, cycle: cyclePath };
            }

            visiting.add(symbolId);
            visitPath.push(symbolId);

            try {
                // Query semantic analyzer for symbols that depend on this one
                if (
                    this.semantic &&
                    typeof this.semantic.getDependents === "function"
                ) {
                    const dependents =
                        (await this.semantic.getDependents([symbolId])) ?? [];

                    for (const dep of dependents) {
                        const depId = dep.symbolId;

                        // Track the dependency edge for topological sort
                        if (!dependencyGraph.has(symbolId)) {
                            dependencyGraph.set(symbolId, []);
                        }
                        dependencyGraph.get(symbolId).push(depId);

                        // Check if this creates a cycle by looking at the visiting set.
                        // The visiting set contains symbols currently on the call stack,
                        // so finding a dependent in that set means we've encountered a cycle.
                        if (visiting.has(depId)) {
                            // Reconstruct and record the complete cycle path
                            const cyclePath = reconstructCyclePath(depId);
                            circular.push(cyclePath);
                            continue;
                        }

                        // If we haven't visited this dependent yet, explore it
                        if (!visited.has(depId)) {
                            const newDistance = currentDistance + 1;
                            const reason = `depends on ${symbolId.split("/").pop()} (${parentReason})`;

                            cascade.set(depId, {
                                symbolId: depId,
                                distance: newDistance,
                                reason,
                                filePath: dep.filePath
                            });
                            visited.add(depId);

                            // Recursively explore this dependent's dependents
                            const result = await exploreDependents(
                                depId,
                                newDistance,
                                reason
                            );
                            if (
                                result &&
                                result.cycleDetected &&
                                result.cycle
                            ) {
                                circular.push(result.cycle);
                            }
                        }
                    }
                }
            } finally {
                visiting.delete(symbolId);
                visitPath.pop();
            }

            return { cycleDetected: false };
        };

        // Explore from each changed symbol
        for (const symbolId of changedSymbolIds) {
            await exploreDependents(symbolId, 0, "initial change");
        }

        // Convert cascade to array and compute topological order
        const cascadeArray = Array.from(cascade.values());

        // Topological sort using Kahn's algorithm
        // Build in-degree map
        const inDegree = new Map();
        for (const item of cascadeArray) {
            inDegree.set(item.symbolId, 0);
        }

        for (const [, toList] of dependencyGraph.entries()) {
            for (const to of toList) {
                if (inDegree.has(to)) {
                    inDegree.set(to, inDegree.get(to) + 1);
                }
            }
        }

        // Process symbols with no incoming edges first (leaves of dependency tree)
        const queue: Array<string> = [];
        for (const [symbolId, degree] of inDegree.entries()) {
            if (degree === 0) {
                queue.push(symbolId);
            }
        }

        const order: Array<string> = [];
        while (queue.length > 0) {
            const current = queue.shift();
            order.push(current);

            // Reduce in-degree for dependents
            const dependents = dependencyGraph.get(current) || [];
            for (const dep of dependents) {
                if (inDegree.has(dep)) {
                    const newDegree = inDegree.get(dep) - 1;
                    inDegree.set(dep, newDegree);
                    if (newDegree === 0) {
                        queue.push(dep);
                    }
                }
            }
        }

        // If order doesn't include all symbols, we have cycles
        const hasUnorderedSymbols = order.length < cascadeArray.length;

        // Add any remaining symbols (those in cycles) to the end of the order
        for (const item of cascadeArray) {
            if (!order.includes(item.symbolId)) {
                order.push(item.symbolId);
            }
        }

        // Compute metadata
        const maxDistance = cascadeArray.reduce(
            (max, item) => Math.max(max, item.distance),
            0
        );

        return {
            cascade: cascadeArray,
            order,
            circular,
            metadata: {
                totalSymbols: cascadeArray.length,
                maxDistance,
                hasCircular: circular.length > 0 || hasUnorderedSymbols
            }
        };
    }

    /**
     * Check whether a rename operation is safe for hot reload.
     * This method performs a comprehensive analysis of whether a rename can be
     * applied without requiring a full game restart, taking into account symbol
     * types, scope changes, and runtime implications.
     *
     * @param {Object} request - Rename request to validate
     * @param {string} request.symbolId - Symbol to rename
     * @param {string} request.newName - Proposed new name
     * @returns {Promise<{
     *   safe: boolean,
     *   reason: string,
     *   requiresRestart: boolean,
     *   canAutoFix: boolean,
     *   suggestions: Array<string>
     * }>} Hot reload safety assessment
     */
    async checkHotReloadSafety(
        request: RenameRequest
    ): Promise<HotReloadSafetySummary> {
        const { symbolId, newName } = request ?? {};
        const suggestions: Array<string> = [];

        if (!symbolId || !newName) {
            return {
                safe: false,
                reason: "Invalid rename request: missing symbolId or newName",
                requiresRestart: true,
                canAutoFix: false,
                suggestions
            };
        }

        // Validate identifier format first
        try {
            assertValidIdentifierName(newName);
        } catch (error) {
            return {
                safe: false,
                reason: `Invalid identifier name: ${error.message}`,
                requiresRestart: true,
                canAutoFix: false,
                suggestions
            };
        }

        // Hot reload safety analysis relies on semantic knowledge to confirm the
        // symbol exists and to reason about scope conflicts. When the semantic
        // analyzer is unavailable, return a guarded failure instead of throwing so
        // callers receive actionable feedback they can surface to users.
        if (!this.semantic) {
            return {
                safe: false,
                reason: "Hot reload safety checks require a semantic analyzer to verify the rename",
                requiresRestart: true,
                canAutoFix: false,
                suggestions: [
                    "Run the semantic analysis pass before requesting hot reload safety",
                    "Provide a semantic analyzer implementation when constructing RefactorEngine"
                ]
            };
        }

        // Check if symbol exists
        const exists = await this.validateSymbolExists(symbolId);
        if (!exists) {
            return {
                safe: false,
                reason: `Symbol '${symbolId}' not found in semantic index`,
                requiresRestart: true,
                canAutoFix: false,
                suggestions: [
                    "Ensure the project has been analyzed before attempting renames",
                    "Verify the symbolId is correct"
                ]
            };
        }

        // Extract symbol metadata from the ID
        const symbolParts = symbolId.split("/");
        const symbolKind = symbolParts[1]; // e.g., "script", "var", "event"
        const symbolName = symbolParts.at(-1);

        // Check for name conflict
        if (symbolName === newName) {
            return {
                safe: false,
                reason: "New name matches the existing identifier",
                requiresRestart: false,
                canAutoFix: false,
                suggestions: ["Choose a different name"]
            };
        }

        // Gather occurrences to analyze scope and usage patterns
        const occurrences = await this.gatherSymbolOccurrences(symbolName);

        // Detect potential conflicts
        const conflicts = await this.detectRenameConflicts(
            symbolName,
            newName,
            occurrences
        );

        if (conflicts.length > 0) {
            const hasReservedConflict = conflicts.some(
                (c) => c.type === "reserved"
            );
            const hasShadowConflict = conflicts.some(
                (c) => c.type === "shadow"
            );

            if (hasReservedConflict) {
                return {
                    safe: false,
                    reason: "Cannot rename to a reserved keyword",
                    requiresRestart: true,
                    canAutoFix: false,
                    suggestions: [
                        "Choose a different name that isn't a reserved keyword"
                    ]
                };
            }

            if (hasShadowConflict) {
                return {
                    safe: false,
                    reason: "Rename would introduce shadowing conflicts",
                    requiresRestart: false,
                    canAutoFix: true,
                    suggestions: [
                        "The refactor engine can automatically qualify identifiers to avoid shadowing",
                        "Consider using a less common name to avoid conflicts"
                    ]
                };
            }

            return {
                safe: false,
                reason: `Rename has ${conflicts.length} conflict(s)`,
                requiresRestart: false,
                canAutoFix: false,
                suggestions: conflicts.map((c) => c.message)
            };
        }

        // Analyze hot reload implications based on symbol kind
        switch (symbolKind) {
            case "script": {
                // Script renames are generally safe for hot reload as long as
                // we update all call sites simultaneously
                return {
                    safe: true,
                    reason: "Script renames are hot-reload-safe",
                    requiresRestart: false,
                    canAutoFix: true,
                    suggestions: [
                        "All script call sites will be updated atomically",
                        "The hot reload system will recompile dependent scripts"
                    ]
                };
            }

            case "var": {
                // Instance and global variable renames are safe if we update
                // all references, but need careful handling of self/other context
                if (symbolId.includes("::")) {
                    // Instance variable (e.g., gml/var/obj_enemy::hp)
                    return {
                        safe: true,
                        reason: "Instance variable renames are hot-reload-safe",
                        requiresRestart: false,
                        canAutoFix: true,
                        suggestions: [
                            "All references will be updated with proper scope qualification",
                            "Existing instances will retain their current values"
                        ]
                    };
                } else {
                    // Global variable
                    return {
                        safe: true,
                        reason: "Global variable renames are hot-reload-safe",
                        requiresRestart: false,
                        canAutoFix: true,
                        suggestions: [
                            "Global state will be preserved during hot reload"
                        ]
                    };
                }
            }

            case "event": {
                // Event renames require special handling but are generally safe
                return {
                    safe: true,
                    reason: "Event renames are hot-reload-safe with reinit",
                    requiresRestart: false,
                    canAutoFix: true,
                    suggestions: [
                        "Event dispatch will be updated to use the new name",
                        "Existing instances will have their event handlers updated"
                    ]
                };
            }

            case "macro":
            case "enum": {
                // Macros and enums are compile-time constructs, so renaming them
                // requires recompiling all dependent code
                return {
                    safe: false,
                    reason: "Macro/enum renames require dependent script recompilation",
                    requiresRestart: false,
                    canAutoFix: true,
                    suggestions: [
                        "The hot reload system will automatically recompile all dependent scripts",
                        "Consider using the batch rename API to update multiple related symbols"
                    ]
                };
            }

            default: {
                // Unknown symbol kind - be conservative
                suggestions.push(
                    "Symbol kind not recognized, proceeding with caution"
                );
                return {
                    safe: true,
                    reason: `Symbol kind '${symbolKind}' can be renamed`,
                    requiresRestart: false,
                    canAutoFix: true,
                    suggestions
                };
            }
        }
    }

    /**
     * Verify semantic integrity after applying edits.
     * This validates that renamed symbols still resolve correctly and no accidental
     * shadowing or scope capture occurred. Essential for ensuring hot reload safety.
     *
     * Usage pattern:
     * 1. Plan rename with planRename()
     * 2. Apply edits with applyWorkspaceEdit()
     * 3. Verify integrity with verifyPostEditIntegrity()
     * 4. If validation fails, the caller can revert or report errors
     *
     * @param {Object} request - Verification request
     * @param {string} request.symbolId - The symbol that was renamed
     * @param {string} request.oldName - Original symbol name
     * @param {string} request.newName - New symbol name
     * @param {WorkspaceEdit} request.workspace - The applied workspace edit
     * @param {Function} request.readFile - Function to read file contents after edits
     * @returns {Promise<{valid: boolean, errors: Array<string>, warnings: Array<string>}>}
     */
    async verifyPostEditIntegrity(request: {
        symbolId: string;
        oldName: string;
        newName: string;
        workspace: WorkspaceEdit;
        readFile: WorkspaceReadFile;
    }): Promise<ValidationSummary> {
        const { symbolId, oldName, newName, workspace, readFile } = request;
        const errors: Array<string> = [];
        const warnings: Array<string> = [];

        // Validate inputs - check both existence and type
        if (
            symbolId === null ||
            symbolId === undefined ||
            typeof symbolId !== "string" ||
            symbolId.trim() === ""
        ) {
            errors.push("Invalid symbolId");
            return { valid: false, errors, warnings };
        }

        if (
            oldName === null ||
            oldName === undefined ||
            typeof oldName !== "string" ||
            oldName.trim() === ""
        ) {
            errors.push("Invalid oldName");
            return { valid: false, errors, warnings };
        }

        if (
            newName === null ||
            newName === undefined ||
            typeof newName !== "string" ||
            newName.trim() === ""
        ) {
            errors.push("Invalid newName");
            return { valid: false, errors, warnings };
        }

        if (!workspace || !(workspace instanceof WorkspaceEdit)) {
            errors.push("Invalid workspace edit");
            return { valid: false, errors, warnings };
        }

        if (!readFile || typeof readFile !== "function") {
            errors.push("Invalid readFile function");
            return { valid: false, errors, warnings };
        }

        // Group edits by file to process each affected file once
        const grouped = workspace.groupByFile();
        const affectedFiles = Array.from(grouped.keys());

        // Perform basic file content checks regardless of semantic analyzer availability
        // These catch obvious issues like lingering old names or missing new names

        // Verify the old name no longer exists in edited files
        for (const filePath of affectedFiles) {
            let content: string;
            try {
                content = await readFile(filePath);
            } catch (error) {
                errors.push(
                    `Failed to read ${filePath} for post-edit validation: ${error.message}`
                );
                continue;
            }

            // Simple heuristic: check if the old name still appears as an identifier
            // This is a basic check - full validation would require re-parsing
            const identifierPattern = new RegExp(
                String.raw`\b${escapeRegexIdentifier(oldName)}\b`,
                "g"
            );
            const oldNameMatches = content.match(identifierPattern);

            if (oldNameMatches && oldNameMatches.length > 0) {
                // Check if these are in comments by examining each line
                let allInComments = true;
                const lines = content.split("\n");
                for (const line of lines) {
                    if (line.includes(oldName)) {
                        const trimmed = line.trim();
                        // Check if line is a comment or if oldName appears after //
                        const commentIndex = line.indexOf("//");
                        const oldNameIndex = line.indexOf(oldName);
                        const isInLineComment =
                            commentIndex !== -1 && commentIndex < oldNameIndex;
                        const isCommentLine = trimmed.startsWith("//");
                        const isInBlockComment =
                            line.includes("/*") || line.includes("*/");

                        if (
                            !isCommentLine &&
                            !isInLineComment &&
                            !isInBlockComment
                        ) {
                            allInComments = false;
                            break;
                        }
                    }
                }

                if (allInComments) {
                    warnings.push(
                        `Old name '${oldName}' still appears in comments in ${filePath} - may need manual update`
                    );
                } else {
                    errors.push(
                        `Old name '${oldName}' still exists in ${filePath} after rename - edits may be incomplete`
                    );
                }
            }

            // Verify the new name appears in the file
            const newIdentifierPattern = new RegExp(
                String.raw`\b${escapeRegexIdentifier(newName)}\b`,
                "g"
            );
            const newNameMatches = content.match(newIdentifierPattern);

            if (!newNameMatches || newNameMatches.length === 0) {
                warnings.push(
                    `New name '${newName}' does not appear in ${filePath} - verify edits were applied`
                );
            }
        }

        // Use semantic analyzer to check for new conflicts or shadowing
        if (
            this.semantic &&
            typeof this.semantic.getSymbolOccurrences === "function"
        ) {
            try {
                // Query occurrences of the new name to detect any potential conflicts
                const newOccurrences =
                    await this.semantic.getSymbolOccurrences(newName);

                // Look for occurrences outside our edited files - these could be conflicts
                const unexpectedOccurrences = newOccurrences.filter(
                    (occ) => !affectedFiles.includes(occ.path)
                );

                if (unexpectedOccurrences.length > 0) {
                    const conflictPaths = Array.from(
                        new Set(unexpectedOccurrences.map((o) => o.path))
                    );
                    warnings.push(
                        `New name '${newName}' already exists in ${conflictPaths.length} other file(s): ${conflictPaths.join(", ")} - verify no shadowing occurred`
                    );
                }
            } catch (error) {
                warnings.push(
                    `Could not verify occurrences of new name: ${error.message}`
                );
            }
        }

        // Use semantic analyzer to check for reserved keyword violations
        if (
            this.semantic &&
            typeof this.semantic.getReservedKeywords === "function"
        ) {
            try {
                const keywords = await this.semantic.getReservedKeywords();
                if (keywords.includes(newName.toLowerCase())) {
                    errors.push(
                        `New name '${newName}' conflicts with reserved keyword`
                    );
                }
            } catch (error) {
                warnings.push(
                    `Could not verify reserved keywords: ${error.message}`
                );
            }
        }

        // If parser is available, we could re-parse files and verify binding integrity
        // This is more expensive but provides the strongest guarantee
        if (this.parser && typeof this.parser.parse === "function") {
            for (const filePath of affectedFiles) {
                try {
                    // Attempt to parse the file to ensure syntax is still valid
                    await this.parser.parse(filePath);
                } catch (parseError) {
                    errors.push(
                        `Parse error in ${filePath} after rename: ${parseError.message} - edits may have broken syntax`
                    );
                }
            }
        }

        // Warn if no semantic analyzer for deeper validation
        if (!this.semantic) {
            warnings.push(
                "No semantic analyzer available - skipping deep semantic validation"
            );
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Integrate refactor results with the transpiler for hot reload.
     * Takes hot reload updates and generates transpiled patches.
     * @param {Array<{symbolId: string, action: string, filePath: string}>} hotReloadUpdates - Updates from prepareHotReloadUpdates
     * @param {Function} readFile - Function to read file content
     * @returns {Promise<Array<{symbolId: string, patch: Object, filePath: string}>>}
     */
    async generateTranspilerPatches(
        hotReloadUpdates: Array<HotReloadUpdate>,
        readFile: WorkspaceReadFile
    ): Promise<Array<TranspilerPatch>> {
        if (!Array.isArray(hotReloadUpdates)) {
            throw new TypeError(
                "generateTranspilerPatches requires an array of hot reload updates"
            );
        }

        if (!readFile || typeof readFile !== "function") {
            throw new TypeError(
                "generateTranspilerPatches requires a readFile function"
            );
        }

        const patches: Array<TranspilerPatch> = [];

        for (const update of hotReloadUpdates) {
            // Filter to recompile actions since only script recompilations produce
            // runtime patches that can be hot-reloaded. Asset renames and other
            // non-code changes don't require transpilation or runtime updates.
            if (update.action !== "recompile") {
                continue;
            }

            try {
                const sourceText = await readFile(update.filePath);

                // Transpile the updated script into a hot-reload patch if a transpiler
                // is available. The patch contains executable JavaScript code that the
                // GameMaker runtime can inject without restarting the game.
                if (
                    this.formatter &&
                    typeof this.formatter.transpileScript === "function"
                ) {
                    const patch = await this.formatter.transpileScript({
                        sourceText,
                        symbolId: update.symbolId
                    });

                    patches.push({
                        symbolId: update.symbolId,
                        patch,
                        filePath: update.filePath
                    });
                } else {
                    // Fall back to a basic patch structure containing only the source
                    // text when transpilation isn't available. This still allows the
                    // caller to process the updated files, though it won't be directly
                    // executable by GameMaker's runtime without manual intervention.
                    patches.push({
                        symbolId: update.symbolId,
                        patch: {
                            kind: "script",
                            id: update.symbolId,
                            sourceText,
                            version: Date.now()
                        },
                        filePath: update.filePath
                    });
                }
            } catch (error) {
                // Log error but continue processing other updates
                if (typeof console !== "undefined" && console.warn) {
                    console.warn(
                        `Failed to generate patch for ${update.symbolId}: ${error.message}`
                    );
                }
            }
        }

        return patches;
    }
}

export function createRefactorEngine(
    dependencies: Partial<RefactorEngineDependencies> = {}
): RefactorEngine {
    return new RefactorEngine(dependencies);
}

export type {
    ParserBridge,
    SemanticAnalyzer,
    WorkspaceReadFile,
    WorkspaceWriteFile,
    HotReloadUpdate,
    ExecuteRenameRequest,
    ExecuteBatchRenameRequest,
    RenameRequest,
    TranspilerPatch,
    RenameImpactAnalysis,
    ValidationSummary,
    ValidateRenameRequestOptions,
    HotReloadSafetySummary
};
