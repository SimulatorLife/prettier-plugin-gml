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

        // Check if semantic analyzer provides position-based lookup
        if (typeof this.semantic.getSymbolAtPosition === "function") {
            return this.semantic.getSymbolAtPosition(filePath, offset);
        }

        // Fallback: use parser if available
        if (this.parser && typeof this.parser.parse === "function") {
            try {
                const ast = await this.parser.parse(filePath);
                // Walk AST to find node at offset
                // This is a simplified implementation
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

        // Check if this node contains the offset
        if (node.start <= offset && offset <= node.end) {
            // Check children first (depth-first)
            if (node.children) {
                for (const child of node.children) {
                    const found = this.findNodeAtOffset(child, offset);
                    if (found) {
                        return found;
                    }
                }
            }

            // Return this node if it's an identifier
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

        // Check if semantic analyzer provides symbol lookup
        if (typeof this.semantic.hasSymbol === "function") {
            return this.semantic.hasSymbol(symbolId);
        }

        // Fallback: assume valid if semantic is present but doesn't provide validation
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

        // Check if semantic analyzer provides occurrence lookup
        if (typeof this.semantic.getSymbolOccurrences === "function") {
            return this.semantic.getSymbolOccurrences(symbolName);
        }

        // Fallback: return empty array if not available
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

        // Check if new name would shadow existing symbols
        if (this.semantic && typeof this.semantic.lookup === "function") {
            for (const occurrence of occurrences) {
                // Check if newName already exists in the same scope
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

        // Check for reserved keywords or built-in identifiers
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

        // Validate inputs
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

        // Validate symbol exists
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
}

export function createRefactorEngine(dependencies = {}) {
    return new RefactorEngine(dependencies);
}
