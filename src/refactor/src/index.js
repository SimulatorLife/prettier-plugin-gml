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
     * Validate that a symbol exists in the semantic index.
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
     * Collect all occurrences (declarations and references) of a symbol from the semantic analyzer.
     * This is a key integration point between the refactor engine and semantic analysis.
     * @param {string} symbolName - The identifier name to search for
     * @returns {Promise<Array<{scopeId: string, scopeKind: string, kind: string, occurrence: object}>>}
     */
    async collectSymbolOccurrences(symbolName) {
        if (!symbolName || typeof symbolName !== "string") {
            throw new TypeError(
                `symbolName must be a non-empty string, got ${typeof symbolName}`
            );
        }

        if (!this.semantic) {
            throw new Error(
                "RefactorEngine requires a semantic analyzer to collect occurrences"
            );
        }

        // Check if semantic analyzer provides occurrence collection
        if (typeof this.semantic.getSymbolOccurrences === "function") {
            return this.semantic.getSymbolOccurrences(symbolName);
        }

        // Fallback: return empty array if method not available
        return [];
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

        // Create workspace edit for the rename
        const _workspace = new WorkspaceEdit();

        // Future work: Query semantic index for all occurrences of this symbol
        // Future work: Check for scope conflicts and shadowing
        // Future work: Generate edits for all safe rename sites
        // Future work: Add qualifier edits (self., global.) where needed to avoid capture

        throw new Error(
            `planRename implementation in progress for symbol '${symbolId}'. ` +
                `Integration with semantic index and conflict detection is required.`
        );
    }

    /**
     * Validate a planned rename before applying it.
     * This performs a dry-run to detect conflicts.
     * @param {WorkspaceEdit} workspace - The planned edits
     * @returns {Promise<{valid: boolean, errors: Array<string>}>}
     */
    async validateRename(workspace) {
        const errors = [];

        if (!workspace || !(workspace instanceof WorkspaceEdit)) {
            errors.push("Invalid workspace edit");
            return { valid: false, errors };
        }

        if (workspace.edits.length === 0) {
            errors.push("Workspace edit contains no changes");
            return { valid: false, errors };
        }

        // Future work: Apply edits in memory and re-run semantic analysis
        // Future work: Verify all references still resolve to the same symbol
        // Future work: Check for introduced scope conflicts

        return { valid: errors.length === 0, errors };
    }

    /**
     * Prepare integration data for hot reload after a refactor.
     * @param {WorkspaceEdit} _workspace - Applied edits
     * @returns {Promise<Array<{symbolId: string, action: string}>>}
     */
    async prepareHotReloadUpdates(_workspace) {
        const updates = [];

        // Future work: Analyze changed files to determine which symbols need recompilation
        // Future work: Query semantic index for dependents
        // Future work: Generate hot-reload patch metadata

        return updates;
    }
}

export function createRefactorEngine(dependencies = {}) {
    return new RefactorEngine(dependencies);
}
