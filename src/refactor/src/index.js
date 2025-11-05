/**
 * WorkspaceEdit represents a set of text edits across one or more files.
 * Each edit specifies a file path, a range (start/end offset), and replacement text.
 */
export class WorkspaceEdit {
    constructor() {
        this.edits = [];
    }

    /**
     * Add a text edit to this workspace edit.
     * @param {string} path - File path
     * @param {number} start - Start offset
     * @param {number} end - End offset
     * @param {string} newText - Replacement text
     */
    addEdit(path, start, end, newText) {
        this.edits.push({ path, start, end, newText });
    }

    /**
     * Group edits by file path.
     * @returns {Map<string, Array<{start: number, end: number, newText: string}>>}
     */
    groupByFile() {
        const grouped = new Map();
        for (const edit of this.edits) {
            if (!grouped.has(edit.path)) {
                grouped.set(edit.path, []);
            }
            grouped.get(edit.path).push({
                start: edit.start,
                end: edit.end,
                newText: edit.newText
            });
        }
        // Sort edits in each file by start position (descending) for safe application
        for (const edits of grouped.values()) {
            edits.sort((a, b) => b.start - a.start);
        }
        return grouped;
    }
}

/**
 * RefactorEngine coordinates semantic-safe edits across the project.
 * It consumes parser spans and semantic bindings to plan WorkspaceEdits
 * that avoid scope capture or shadowing.
 */
export class RefactorEngine {
    constructor({ parser, semantic, formatter } = {}) {
        this.parser = parser;
        this.semantic = semantic;
        this.formatter = formatter;
    }

    /**
     * Find the symbol at a specific location in a file.
     * Useful for triggering refactorings from editor positions.
     * @param {string} filePath - File path
     * @param {number} offset - Character offset in the file
     * @returns {Promise<{symbolId: string, name: string, range: {start: number, end: number}} | null>}
     */
    async findSymbolAtLocation(filePath, offset) {
        if (!this.semantic) {
            return null;
        }

        // Attempt to use the semantic analyzer's position-based lookup if available.
        // This is the preferred method because it understands scope, binding, and
        // type information, allowing it to distinguish between identically-named
        // symbols in different contexts (e.g., local variables vs. global functions).
        if (typeof this.semantic.getSymbolAtPosition === "function") {
            return this.semantic.getSymbolAtPosition(filePath, offset);
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
    findNodeAtOffset(node, offset) {
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
    async validateSymbolExists(symbolId) {
        if (!this.semantic) {
            throw new Error(
                "RefactorEngine requires a semantic analyzer to validate symbols"
            );
        }

        // Query the semantic analyzer's symbol table to determine whether the given
        // symbolId exists. This check prevents rename operations from targeting
        // non-existent symbols, which would otherwise silently succeed but produce
        // no edits, confusing users who expect feedback when they mistype a name.
        if (typeof this.semantic.hasSymbol === "function") {
            return this.semantic.hasSymbol(symbolId);
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
    async gatherSymbolOccurrences(symbolName) {
        if (!this.semantic) {
            return [];
        }

        // Request all occurrences (definitions and references) of the symbol from
        // the semantic analyzer. This includes local variables, function parameters,
        // global functions, and any other binding sites. The semantic layer tracks
        // both the location (path, offset) and the kind (definition vs. reference)
        // of each occurrence, which later phases use to construct text edits.
        if (typeof this.semantic.getSymbolOccurrences === "function") {
            return this.semantic.getSymbolOccurrences(symbolName);
        }

        // If occurrence tracking isn't available, return an empty array so the
        // rename operation can proceed without edits, avoiding a hard error.
        return [];
    }

    /**
     * Check if a rename would introduce scope conflicts.
     * @param {string} oldName - Original symbol name
     * @param {string} newName - Proposed new name
     * @param {Array<{path: string, start: number, end: number, scopeId: string}>} occurrences - Symbol occurrences
     * @returns {Promise<Array<{type: string, message: string, path?: string}>>}
     */
    async detectRenameConflicts(oldName, newName, occurrences) {
        const conflicts = [];

        // Test whether renaming would introduce shadowing conflicts where the new
        // name collides with an existing symbol in the same scope. For example,
        // renaming a local variable `x` to `y` when `y` is already defined in that
        // scope would hide the original `y`, breaking references to it.
        if (this.semantic && typeof this.semantic.lookup === "function") {
            for (const occurrence of occurrences) {
                // Perform a scope-aware lookup for the new name at each occurrence
                // site. If we find an existing binding that isn't the symbol we're
                // renaming, record a conflict so the user can resolve it manually.
                const existing = await this.semantic.lookup(
                    newName,
                    occurrence.scopeId
                );
                if (existing && existing.name !== oldName) {
                    conflicts.push({
                        type: "shadow",
                        message: `Renaming '${oldName}' to '${newName}' would shadow existing symbol in scope`,
                        path: occurrence.path
                    });
                }
            }
        }

        // Reject renames that would overwrite GML reserved keywords (like `if`,
        // `function`) or built-in identifiers (like `self`, `global`). Allowing
        // such renames would cause syntax errors or silently bind user symbols to
        // language constructs, breaking both the parser and runtime semantics.
        const reservedKeywords = new Set([
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
        ]);

        if (reservedKeywords.has(newName)) {
            conflicts.push({
                type: "reserved",
                message: `'${newName}' is a reserved keyword and cannot be used as an identifier`
            });
        }

        return conflicts;
    }

    /**
     * Plan a rename refactoring for a symbol.
     * @param {Object} request - Rename request
     * @param {string} request.symbolId - Symbol to rename (e.g., "gml/script/scr_foo")
     * @param {string} request.newName - New name for the symbol
     * @returns {Promise<WorkspaceEdit>} Workspace edit with all necessary changes
     */
    async planRename(request) {
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

        if (typeof newName !== "string") {
            throw new TypeError(
                `newName must be a string, got ${typeof newName}`
            );
        }

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

        // Extract symbol name from ID (e.g., "gml/script/scr_foo" -> "scr_foo")
        const symbolName = symbolId.split("/").pop();

        // Gather all occurrences of this symbol
        const occurrences = await this.gatherSymbolOccurrences(symbolName);

        // Check for conflicts
        const conflicts = await this.detectRenameConflicts(
            symbolName,
            newName,
            occurrences
        );

        if (conflicts.length > 0) {
            const messages = conflicts.map((c) => c.message).join("; ");
            throw new Error(
                `Cannot rename '${symbolName}' to '${newName}': ${messages}`
            );
        }

        // Create workspace edit for the rename
        const workspace = new WorkspaceEdit();

        // Generate edits for all safe rename sites
        for (const occurrence of occurrences) {
            workspace.addEdit(
                occurrence.path,
                occurrence.start,
                occurrence.end,
                newName
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
    async validateRename(workspace) {
        const errors = [];
        const warnings = [];

        if (!workspace || !(workspace instanceof WorkspaceEdit)) {
            errors.push("Invalid workspace edit");
            return { valid: false, errors, warnings };
        }

        if (workspace.edits.length === 0) {
            errors.push("Workspace edit contains no changes");
            return { valid: false, errors, warnings };
        }

        // Group edits by file for validation
        const grouped = workspace.groupByFile();

        // Validate each file's edits don't overlap
        for (const [filePath, edits] of grouped.entries()) {
            for (let i = 0; i < edits.length - 1; i++) {
                const current = edits[i];
                const next = edits[i + 1];

                // Check for overlapping ranges (edits are sorted descending by start)
                // current.start >= next.start (since descending)
                // Overlap occurs if next.end > current.start
                if (next.end > current.start) {
                    errors.push(
                        `Overlapping edits detected in ${filePath} at positions ${current.start}-${next.end}`
                    );
                }
            }

            // Warn if file has many edits (potential large-scale rename)
            if (edits.length > 50) {
                warnings.push(
                    `Large number of edits (${edits.length}) planned for ${filePath}. ` +
                        `Consider reviewing the scope of this refactoring.`
                );
            }
        }

        // If semantic analyzer is available, perform deeper validation
        if (
            this.semantic &&
            typeof this.semantic.validateEdits === "function"
        ) {
            try {
                const semanticValidation =
                    await this.semantic.validateEdits(workspace);
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
    async applyWorkspaceEdit(workspace, options = {}) {
        const { dryRun = false, readFile, writeFile } = options;

        if (!workspace || !(workspace instanceof WorkspaceEdit)) {
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

        // Validate edits before applying
        const validation = await this.validateRename(workspace);
        if (!validation.valid) {
            throw new Error(
                `Cannot apply workspace edit: ${validation.errors.join("; ")}`
            );
        }

        // Group edits by file
        const grouped = workspace.groupByFile();
        const results = new Map();

        // Apply edits to each file
        for (const [filePath, edits] of grouped.entries()) {
            // Read current file content
            const originalContent = await readFile(filePath);

            // Apply edits in reverse order (high to low offset) to maintain positions
            let newContent = originalContent;
            for (const edit of edits) {
                newContent =
                    newContent.slice(0, edit.start) +
                    edit.newText +
                    newContent.slice(edit.end);
            }

            results.set(filePath, newContent);

            // Write file if not in dry-run mode
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
    async planBatchRename(renames) {
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

            if (typeof rename.newName !== "string") {
                throw new TypeError(
                    `newName must be a string, got ${typeof rename.newName}`
                );
            }
        }

        // Check for duplicate new names that would conflict
        const newNames = new Set();
        for (const rename of renames) {
            const symbolName = rename.symbolId.split("/").pop();
            if (newNames.has(rename.newName)) {
                throw new Error(
                    `Cannot rename multiple symbols to '${rename.newName}'`
                );
            }
            newNames.add(rename.newName);
        }

        // Plan each rename individually
        const workspaces = [];
        for (const rename of renames) {
            const workspace = await this.planRename(rename);
            workspaces.push(workspace);
        }

        // Merge all workspace edits
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
    async executeRename(request) {
        const {
            symbolId,
            newName,
            readFile,
            writeFile,
            prepareHotReload = false
        } = request ?? {};

        if (!symbolId || !newName) {
            throw new TypeError("executeRename requires symbolId and newName");
        }

        // Plan the rename
        const workspace = await this.planRename({ symbolId, newName });

        // Apply the edits
        const applied = await this.applyWorkspaceEdit(workspace, {
            readFile,
            writeFile,
            dryRun: false
        });

        // Prepare hot reload updates if requested
        let hotReloadUpdates = [];
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
    async executeBatchRename(request) {
        const {
            renames,
            readFile,
            writeFile,
            prepareHotReload = false
        } = request ?? {};

        if (!renames) {
            throw new TypeError("executeBatchRename requires renames array");
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
        let hotReloadUpdates = [];
        if (prepareHotReload) {
            hotReloadUpdates = await this.prepareHotReloadUpdates(workspace);
        }

        return { workspace, applied, hotReloadUpdates };
    }

    /**
     * Validate that workspace edits won't break hot reload functionality.
     * Checks for issues that could prevent patches from being applied correctly.
     * @param {WorkspaceEdit} workspace - The workspace edit to validate
     * @param {Object} options - Validation options
     * @param {boolean} options.checkTranspiler - Whether to validate transpiler compatibility
     * @returns {Promise<{valid: boolean, errors: Array<string>, warnings: Array<string>}>}
     */
    async validateHotReloadCompatibility(workspace, options = {}) {
        const { checkTranspiler = false } = options;
        const errors = [];
        const warnings = [];

        if (!workspace || !(workspace instanceof WorkspaceEdit)) {
            errors.push("Invalid workspace edit");
            return { valid: false, errors, warnings };
        }

        if (workspace.edits.length === 0) {
            warnings.push(
                "Workspace edit contains no changes - hot reload not needed"
            );
            return { valid: true, errors, warnings };
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

            // Check if edits affect critical constructs
            for (const edit of edits) {
                // Warn about edits that might break runtime state
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

            // Check for very large edits that might indicate structural changes
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

        return { valid: errors.length === 0, errors, warnings };
    }

    /**
     * Prepare integration data for hot reload after a refactor.
     * Analyzes changed files to determine which symbols need recompilation.
     * @param {WorkspaceEdit} workspace - Applied edits
     * @returns {Promise<Array<{symbolId: string, action: string, filePath: string, affectedRanges: Array<{start: number, end: number}>}>>}
     */
    async prepareHotReloadUpdates(workspace) {
        const updates = [];

        if (!workspace || workspace.edits.length === 0) {
            return updates;
        }

        // Group edits by file
        const grouped = workspace.groupByFile();

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
                    updates.push({
                        symbolId: symbol.id,
                        action: "recompile",
                        filePath,
                        affectedRanges: edits.map((e) => ({
                            start: e.start,
                            end: e.end
                        }))
                    });
                }
            } else {
                // Fallback: create a generic update for the file
                updates.push({
                    symbolId: `file://${filePath}`,
                    action: "recompile",
                    filePath,
                    affectedRanges: edits.map((e) => ({
                        start: e.start,
                        end: e.end
                    }))
                });
            }
        }

        // Query semantic index for dependents if available
        if (
            this.semantic &&
            typeof this.semantic.getDependents === "function"
        ) {
            const allSymbolIds = updates.map((u) => u.symbolId);
            const dependents = await this.semantic.getDependents(allSymbolIds);

            // Add dependent symbols that need hot reload notification
            for (const dependent of dependents) {
                if (!updates.some((u) => u.symbolId === dependent.symbolId)) {
                    updates.push({
                        symbolId: dependent.symbolId,
                        action: "notify",
                        filePath: dependent.filePath,
                        affectedRanges: []
                    });
                }
            }
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
    async analyzeRenameImpact(request) {
        const { symbolId, newName } = request ?? {};

        if (!symbolId || !newName) {
            throw new TypeError(
                "analyzeRenameImpact requires symbolId and newName"
            );
        }

        const summary = {
            symbolId,
            oldName: symbolId.split("/").pop(),
            newName,
            affectedFiles: new Set(),
            totalOccurrences: 0,
            definitionCount: 0,
            referenceCount: 0,
            hotReloadRequired: false,
            dependentSymbols: new Set()
        };

        const conflicts = [];
        const warnings = [];

        try {
            // Validate symbol exists
            const exists = await this.validateSymbolExists(symbolId);
            if (!exists) {
                conflicts.push({
                    type: "missing_symbol",
                    message: `Symbol '${symbolId}' not found in semantic index`,
                    severity: "error"
                });
                return { valid: false, summary, conflicts, warnings };
            }

            // Gather occurrences
            const occurrences = await this.gatherSymbolOccurrences(
                summary.oldName
            );
            summary.totalOccurrences = occurrences.length;

            // Track affected files
            for (const occ of occurrences) {
                summary.affectedFiles.add(occ.path);
                // Count definitions vs references
                if (occ.kind === "definition") {
                    summary.definitionCount++;
                } else {
                    summary.referenceCount++;
                }
            }

            // Check for conflicts
            const detectedConflicts = await this.detectRenameConflicts(
                summary.oldName,
                newName,
                occurrences
            );
            conflicts.push(...detectedConflicts);

            // Check if hot reload will be needed
            if (summary.totalOccurrences > 0) {
                summary.hotReloadRequired = true;

                // Identify dependent symbols
                if (
                    this.semantic &&
                    typeof this.semantic.getDependents === "function"
                ) {
                    const dependents = await this.semantic.getDependents([
                        symbolId
                    ]);
                    for (const dep of dependents) {
                        summary.dependentSymbols.add(dep.symbolId);
                    }
                }
            }

            // Generate warnings for large-scale renames
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

        // Convert sets to arrays for JSON serialization
        summary.affectedFiles = Array.from(summary.affectedFiles);
        summary.dependentSymbols = Array.from(summary.dependentSymbols);

        return {
            valid: conflicts.length === 0,
            summary,
            conflicts,
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
    async generateTranspilerPatches(hotReloadUpdates, readFile) {
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

        const patches = [];

        for (const update of hotReloadUpdates) {
            // Only generate patches for recompile actions
            if (update.action !== "recompile") {
                continue;
            }

            try {
                // Read the updated file content
                const sourceText = await readFile(update.filePath);

                // Generate transpiler patch if transpiler is available
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
                    // Create a basic patch structure without transpilation
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

export function createRefactorEngine(dependencies = {}) {
    return new RefactorEngine(dependencies);
}
