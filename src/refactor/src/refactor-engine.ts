import { WorkspaceEdit, type GroupedTextEdits } from "./workspace-edit.js";
import { Core } from "@gml-modules/core";
import {
    ConflictType,
    type ApplyWorkspaceEditOptions,
    type BatchRenamePlanSummary,
    type BatchRenameValidation,
    type ConflictEntry,
    type ExecuteBatchRenameRequest,
    type ExecuteRenameRequest,
    type ExecuteRenameResult,
    type HotReloadCascadeResult,
    type HotReloadSafetySummary,
    type HotReloadUpdate,
    type HotReloadValidationOptions,
    type ParserBridge,
    type PartialSemanticAnalyzer,
    type PrepareRenamePlanOptions,
    type RefactorEngineDependencies,
    type RenameImpactAnalysis,
    type RenamePlanSummary,
    type RenameRequest,
    type SymbolLocation,
    type SymbolOccurrence,
    type TranspilerBridge,
    type TranspilerPatch,
    type ValidateRenameRequestOptions,
    type ValidationSummary,
    type WorkspaceReadFile
} from "./types.js";
import { assertValidIdentifierName } from "./validation-utils.js";
import { detectCircularRenames, detectRenameConflicts } from "./validation.js";
import * as SymbolQueries from "./symbol-queries.js";
import * as HotReload from "./hot-reload.js";

/**
 * RefactorEngine coordinates semantic-safe edits across the project.
 * It consumes parser spans and semantic bindings to plan WorkspaceEdits
 * that avoid scope capture or shadowing.
 */
export class RefactorEngine {
    public readonly parser: ParserBridge | null;
    public readonly semantic: PartialSemanticAnalyzer | null;
    public readonly formatter: TranspilerBridge | null;

    constructor({ parser = null, semantic = null, formatter = null }: Partial<RefactorEngineDependencies> = {}) {
        this.parser = parser ?? null;
        this.semantic = semantic ?? null;
        this.formatter = formatter ?? null;
    }

    /**
     * Find the symbol at a specific location in a file.
     * Useful for triggering refactorings from editor positions.
     */
    async findSymbolAtLocation(filePath: string, offset: number): Promise<SymbolLocation | null> {
        return SymbolQueries.findSymbolAtLocation(filePath, offset, this.semantic, this.parser);
    }

    /**
     * Validate symbol exists in the semantic index.
     */
    async validateSymbolExists(symbolId: string): Promise<boolean> {
        return SymbolQueries.validateSymbolExists(symbolId, this.semantic);
    }

    /**
     * Gather all occurrences of a symbol from the semantic analyzer.
     */
    async gatherSymbolOccurrences(symbolName: string): Promise<Array<SymbolOccurrence>> {
        return SymbolQueries.gatherSymbolOccurrences(symbolName, this.semantic);
    }

    /**
     * Query the semantic analyzer for symbols defined in a specific file.
     * This is useful for hot reload coordination to determine which symbols
     * need recompilation when a file changes.
     */
    async getFileSymbols(filePath: string): Promise<Array<{ id: string }>> {
        return SymbolQueries.getFileSymbols(filePath, this.semantic);
    }

    /**
     * Query the semantic analyzer for symbols that depend on the given symbols.
     * This is essential for hot reload to determine which symbols need recompilation
     * when dependencies change.
     */
    async getSymbolDependents(symbolIds: Array<string>): Promise<Array<{ symbolId: string; filePath: string }>> {
        return SymbolQueries.getSymbolDependents(symbolIds, this.semantic);
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
            errors.push(`symbolId must be a string, received ${typeof symbolId}`);
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
            const errorMessage = Core.isErrorLike(error) ? error.message : String(error);
            errors.push(errorMessage);
            return { valid: false, errors, warnings };
        }

        // Check if symbol exists in semantic index
        if (this.semantic) {
            const exists = await this.validateSymbolExists(symbolId);
            if (!exists) {
                errors.push(`Symbol '${symbolId}' not found in semantic index. Ensure the project has been analyzed.`);
                return { valid: false, errors, warnings };
            }
        } else {
            warnings.push("No semantic analyzer available - cannot verify symbol existence");
        }

        // Extract the symbol's base name from its fully-qualified ID.
        // Symbol IDs follow the pattern "gml/{kind}/{name}" where {name} is the
        // last path component (e.g., "gml/script/scr_foo" → "scr_foo").
        // This name is used to search for all occurrences in the codebase.
        const symbolName = symbolId.split("/").pop() ?? symbolId;

        if (symbolName === normalizedNewName) {
            errors.push(`The new name '${normalizedNewName}' matches the existing identifier`);
            return { valid: false, errors, warnings };
        }

        // Gather occurrences to check for conflicts
        const occurrences = await this.gatherSymbolOccurrences(symbolName);

        if (occurrences.length === 0) {
            warnings.push(`No occurrences found for symbol '${symbolName}' - rename will have no effect`);
        }

        // Check for conflicts
        const conflicts = await detectRenameConflicts(
            symbolName,
            normalizedNewName,
            occurrences,
            this.semantic,
            this.semantic
        );

        for (const conflict of conflicts) {
            if (conflict.type === ConflictType.RESERVED || conflict.type === ConflictType.SHADOW) {
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
     * Validate a batch of rename requests before planning edits.
     * Provides comprehensive validation feedback for multiple rename operations,
     * checking for conflicts between renames and ensuring batch consistency.
     *
     * @param {Array<{symbolId: string, newName: string}>} renames - Rename requests to validate
     * @param {Object} [options] - Validation options
     * @param {boolean} [options.includeHotReload=false] - Whether to check hot reload safety for each rename
     * @returns {Promise<{
     *   valid: boolean,
     *   errors: Array<string>,
     *   warnings: Array<string>,
     *   renameValidations: Map<string, ValidationSummary>,
     *   conflictingSets: Array<Array<string>>
     * }>} Aggregated validation results
     *
     * @example
     * const validation = await engine.validateBatchRenameRequest([
     *     { symbolId: "gml/script/scr_a", newName: "scr_x" },
     *     { symbolId: "gml/script/scr_b", newName: "scr_y" }
     * ]);
     *
     * if (!validation.valid) {
     *     console.error("Batch rename has errors:", validation.errors);
     *     for (const [symbolId, result] of validation.renameValidations) {
     *         if (!result.valid) {
     *             console.error(`  ${symbolId}:`, result.errors);
     *         }
     *     }
     * }
     */
    async validateBatchRenameRequest(
        renames: Array<RenameRequest>,
        options?: ValidateRenameRequestOptions
    ): Promise<BatchRenameValidation> {
        const errors: Array<string> = [];
        const warnings: Array<string> = [];
        const renameValidations = new Map<string, ValidationSummary>();
        const conflictingSets: Array<Array<string>> = [];

        // Validate input structure
        if (!Array.isArray(renames)) {
            errors.push("Batch rename requires an array of rename requests");
            return {
                valid: false,
                errors,
                warnings,
                renameValidations,
                conflictingSets
            };
        }

        if (renames.length === 0) {
            errors.push("Batch rename requires at least one rename request");
            return {
                valid: false,
                errors,
                warnings,
                renameValidations,
                conflictingSets
            };
        }

        // Validate each rename request individually
        for (const rename of renames) {
            if (!rename || typeof rename !== "object") {
                errors.push("Each rename must be a valid request object");
                continue;
            }

            const { symbolId } = rename;
            if (!symbolId || typeof symbolId !== "string") {
                errors.push("Each rename must have a valid symbolId string property");
                continue;
            }

            // Validate individual rename request
            const validation = await this.validateRenameRequest(rename, options);
            renameValidations.set(symbolId, validation);

            if (!validation.valid) {
                errors.push(`Rename validation failed for '${symbolId}': ${validation.errors.join(", ")}`);
            }

            if (validation.warnings.length > 0) {
                warnings.push(...validation.warnings.map((w) => `${symbolId}: ${w}`));
            }
        }

        // Check for duplicate target names across the batch
        const newNameToSymbols = new Map<string, Array<string>>();
        for (const rename of renames) {
            if (
                !rename ||
                typeof rename !== "object" ||
                !rename.newName ||
                typeof rename.newName !== "string" ||
                !rename.symbolId ||
                typeof rename.symbolId !== "string"
            ) {
                // Skip structural validation failures that were already flagged in the
                // first pass. Continuing here prevents the duplicate-name detection logic
                // from crashing on malformed entries while still letting the overall
                // validation summary report the original structural errors.
                continue;
            }

            try {
                const normalizedNewName = assertValidIdentifierName(rename.newName);
                if (!newNameToSymbols.has(normalizedNewName)) {
                    newNameToSymbols.set(normalizedNewName, []);
                }
                newNameToSymbols.get(normalizedNewName).push(rename.symbolId);
            } catch {
                // Skip invalid identifier names (e.g., reserved keywords, names with
                // illegal characters) because they will be reported by the per-rename
                // validation pass below. Continuing here allows the batch validator
                // to collect duplicate-name conflicts for the valid subset without
                // cascading failures from syntactically invalid targets.
                continue;
            }
        }

        // Detect conflicting renames (multiple symbols renamed to the same name)
        for (const [newName, symbolIds] of newNameToSymbols.entries()) {
            if (symbolIds.length > 1) {
                errors.push(`Multiple symbols cannot be renamed to '${newName}': ${symbolIds.join(", ")}`);
                conflictingSets.push(symbolIds);
            }
        }

        // Detect circular rename chains - filter out invalid renames first
        const validRenames = renames.filter(
            (rename) =>
                rename &&
                typeof rename === "object" &&
                rename.symbolId &&
                typeof rename.symbolId === "string" &&
                rename.newName &&
                typeof rename.newName === "string"
        );

        const circularChain = detectCircularRenames(validRenames);
        if (circularChain.length > 0) {
            const chain = circularChain.map((id) => id.split("/").pop()).join(" → ");
            errors.push(`Circular rename chain detected: ${chain}. Cannot rename symbols in a cycle.`);
            conflictingSets.push(circularChain);
        }

        // Check for cross-rename conflicts where one rename's new name matches another's old name
        // (but not in a circular way - that's already handled above)
        const oldNames = new Set<string>();
        const newNames = new Set<string>();

        // First pass: collect all old and new names
        for (const rename of validRenames) {
            const oldName = rename.symbolId.split("/").pop();
            if (oldName) {
                oldNames.add(oldName);
            }

            try {
                const normalizedNewName = assertValidIdentifierName(rename.newName);
                newNames.add(normalizedNewName);
            } catch {
                // Skip invalid identifier names during the collection phase.
                // These will be caught and reported as errors in the individual
                // rename validation pass, so continuing here lets the confusion-
                // detection logic operate on the well-formed subset without failing.
                continue;
            }
        }

        // Second pass: detect confusion where new name was an old name
        for (const rename of validRenames) {
            const oldName = rename.symbolId.split("/").pop();
            if (!oldName) {
                continue;
            }

            try {
                const normalizedNewName = assertValidIdentifierName(rename.newName);

                // Warn if this new name matches any old name in the batch (potential confusion)
                // but exclude the case where it's the same symbol (already caught as same-name rename)
                if (oldNames.has(normalizedNewName) && oldName !== normalizedNewName) {
                    warnings.push(
                        `Rename introduces potential confusion: '${rename.symbolId}' renamed to '${normalizedNewName}' which was an original symbol name in this batch`
                    );
                }
            } catch {
                // Skip invalid identifier names during the confusion-detection pass.
                // Errors for these names will be surfaced in the main validation
                // results, so continuing here prevents duplicate error reporting while
                // still allowing the logic to warn about valid renames that might shadow
                // original symbol names.
                continue;
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            renameValidations,
            conflictingSets
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
            throw new TypeError(`symbolId must be a string, got ${typeof symbolId}`);
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
            throw new Error(`The new name '${normalizedNewName}' matches the existing identifier`);
        }

        // Collect all occurrences (definitions and references) of the symbol across
        // the workspace. This includes every location where the symbol appears, so
        // the rename operation can update all references simultaneously.
        const occurrences = await this.gatherSymbolOccurrences(symbolName);

        // Detect potential conflicts (shadowing, reserved keywords, etc.) before
        // applying edits. If conflicts exist, we abort the rename to prevent
        // introducing scope errors or breaking existing code.
        const conflicts = await detectRenameConflicts(
            symbolName,
            normalizedNewName,
            occurrences,
            this.semantic,
            this.semantic
        );

        if (conflicts.length > 0) {
            const messages = conflicts.map((c) => c.message).join("; ");
            throw new Error(`Cannot rename '${symbolName}' to '${normalizedNewName}': ${messages}`);
        }

        // Build a workspace edit containing text edits for every occurrence. Each
        // edit replaces the old symbol name with the new name at its source location.
        const workspace = new WorkspaceEdit();

        for (const occurrence of occurrences) {
            workspace.addEdit(occurrence.path, occurrence.start, occurrence.end, normalizedNewName);
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
                    errors.push(`Overlapping edits detected in ${filePath} at positions ${current.start}-${next.end}`);
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
                const semanticValidation = (await semantic.validateEdits(workspace)) ?? {};
                errors.push(...(semanticValidation.errors || []));
                warnings.push(...(semanticValidation.warnings || []));
            } catch (error) {
                warnings.push(`Semantic validation failed: ${error.message}. Proceeding with basic validation only.`);
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
        const opts: ApplyWorkspaceEditOptions = options ?? ({} as ApplyWorkspaceEditOptions);
        const { dryRun = false, readFile, writeFile } = opts;

        if (!workspace || !Core.isWorkspaceEditLike(workspace)) {
            throw new TypeError("applyWorkspaceEdit requires a WorkspaceEdit");
        }

        if (!readFile || typeof readFile !== "function") {
            throw new TypeError("applyWorkspaceEdit requires a readFile function");
        }

        if (!dryRun && (!writeFile || typeof writeFile !== "function")) {
            throw new TypeError("applyWorkspaceEdit requires a writeFile function when not in dry-run mode");
        }

        // Verify the workspace edit is structurally sound and free of conflicts
        // before modifying any files. This prevents partial application of invalid
        // edits that could leave the codebase in an inconsistent state.
        const validation = await this.validateRename(workspace);
        if (!validation.valid) {
            throw new Error(`Cannot apply workspace edit: ${validation.errors.join("; ")}`);
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
                newContent = newContent.slice(0, edit.start) + edit.newText + newContent.slice(edit.end);
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
    async planBatchRename(renames: Array<RenameRequest>): Promise<WorkspaceEdit> {
        if (!Array.isArray(renames)) {
            throw new TypeError("planBatchRename requires an array of renames");
        }

        if (renames.length === 0) {
            throw new Error("planBatchRename requires at least one rename");
        }

        // Validate all rename requests first
        for (const rename of renames) {
            if (!rename.symbolId || !rename.newName) {
                throw new TypeError("Each rename requires symbolId and newName");
            }

            if (typeof rename.symbolId !== "string") {
                throw new TypeError(`symbolId must be a string, got ${typeof rename.symbolId}`);
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
                throw new Error(`Cannot rename multiple symbols to '${normalizedNewName}'`);
            }
            newNames.add(normalizedNewName);
        }

        // Detect circular rename chains where symbol names form a cycle, such as
        // renaming A→B and B→A simultaneously. These chains create conflicts because
        // after applying the first rename, the second rename's source symbol no longer
        // exists by its original name, causing the batch operation to fail or produce
        // incorrect results. We detect cycles by building a directed graph of renames
        // and checking for strongly connected components.
        const circularChain = detectCircularRenames(renames);
        if (circularChain.length > 0) {
            const chain = circularChain.map((id) => id.split("/").pop()).join(" → ");
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
            throw new Error(`Batch rename validation failed: ${validation.errors.join("; ")}`);
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
    async executeRename(request: ExecuteRenameRequest): Promise<ExecuteRenameResult> {
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
            throw new TypeError("executeRename requires a readFile function to load files");
        }

        if (!writeFile || typeof writeFile !== "function") {
            throw new TypeError("executeRename requires a writeFile function to save files");
        }

        // Plan the rename
        const workspace = await this.planRename({ symbolId, newName });

        // Validate the planned edits before touching the filesystem. This ensures
        // overlapping or otherwise invalid edits are caught early, preventing
        // partial writes that could leave the workspace in an inconsistent state.
        const validation = await this.validateRename(workspace);
        if (!validation.valid) {
            throw new Error(`Rename validation failed: ${validation.errors.join("; ")}`);
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
    async executeBatchRename(request: ExecuteBatchRenameRequest): Promise<ExecuteRenameResult> {
        const { renames, readFile, writeFile, prepareHotReload = false } = request ?? ({} as ExecuteBatchRenameRequest);

        if (!renames) {
            throw new TypeError("executeBatchRename requires renames array");
        }

        if (!readFile || typeof readFile !== "function") {
            throw new TypeError("executeBatchRename requires a readFile function");
        }

        if (!writeFile || typeof writeFile !== "function") {
            throw new TypeError("executeBatchRename requires a writeFile function");
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
    async prepareRenamePlan(request: RenameRequest, options?: PrepareRenamePlanOptions): Promise<RenamePlanSummary> {
        const opts = options ?? {};
        const { validateHotReload = false, hotReloadOptions: rawHotOptions } = opts;
        const hotReloadOptions: HotReloadValidationOptions = rawHotOptions ?? {};

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
            const safety = await this.checkHotReloadSafety(request);
            const compatibility = await this.validateHotReloadCompatibility(workspace, hotReloadOptions);

            const errors = [...compatibility.errors];
            const warnings = [...compatibility.warnings];

            if (!safety.safe) {
                const safetyMessage = safety.requiresRestart
                    ? `Hot reload requires restart: ${safety.reason}`
                    : `Hot reload limitations: ${safety.reason}`;

                warnings.push(safetyMessage);

                if (safety.requiresRestart) {
                    errors.push(safetyMessage);
                }
            }

            hotReloadValidation = {
                valid: compatibility.valid && safety.safe,
                errors,
                warnings,
                hotReload: safety
            };
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
     * Prepare a comprehensive batch rename plan with validation, impact analysis,
     * and hot reload metadata for multiple coordinated symbol renames.
     *
     * This method extends {@link prepareBatchRename} by bundling all validation,
     * impact analysis, and hot reload cascade computation into a single call,
     * providing a complete preview of the batch operation before any files are modified.
     *
     * Unlike {@link planBatchRename}, this method does not throw errors for invalid
     * renames; instead, it returns a comprehensive summary that includes all validation
     * errors, warnings, and partial results to help callers understand what would happen.
     *
     * @param {Array<{symbolId: string, newName: string}>} renames - Rename operations to plan
     * @param {Object} [options] - Additional validation controls
     * @param {boolean} [options.validateHotReload=false] - Whether to perform hot reload compatibility checks
     * @param {Object} [options.hotReloadOptions] - Options forwarded to {@link validateHotReloadCompatibility}
     * @returns {Promise<{
     *   workspace: WorkspaceEdit,
     *   validation: ValidationSummary,
     *   hotReload: ValidationSummary | null,
     *   batchValidation: BatchRenameValidation,
     *   impactAnalyses: Map<string, RenameImpactAnalysis>,
     *   cascadeResult: HotReloadCascadeResult | null
     * }>} Comprehensive batch rename plan
     *
     * @example
     * const plan = await engine.prepareBatchRenamePlan([
     *     { symbolId: "gml/script/scr_enemy_old", newName: "scr_enemy_new" },
     *     { symbolId: "gml/script/scr_helper_old", newName: "scr_helper_new" }
     * ], { validateHotReload: true });
     *
     * // Check batch-level conflicts
     * if (!plan.batchValidation.valid) {
     *     console.error("Batch validation failed:", plan.batchValidation.errors);
     *     for (const set of plan.batchValidation.conflictingSets) {
     *         console.error("Conflicting symbols:", set);
     *     }
     *     return;
     * }
     *
     * // Review hot reload cascade to see all affected symbols
     * if (plan.cascadeResult) {
     *     console.log(`Total symbols to reload: ${plan.cascadeResult.metadata.totalSymbols}`);
     *     console.log(`Max dependency distance: ${plan.cascadeResult.metadata.maxDistance}`);
     *     if (plan.cascadeResult.metadata.hasCircular) {
     *         console.warn("Circular dependencies detected:");
     *         for (const cycle of plan.cascadeResult.circular) {
     *             console.warn("  Cycle:", cycle.join(" → "));
     *         }
     *     }
     * }
     *
     * // Review per-rename impact
     * for (const [symbolId, analysis] of plan.impactAnalyses) {
     *     console.log(`${symbolId}:`);
     *     console.log(`  Files affected: ${analysis.summary.affectedFiles.length}`);
     *     console.log(`  Occurrences: ${analysis.summary.totalOccurrences}`);
     *     if (analysis.conflicts.length > 0) {
     *         console.warn("  Conflicts:", analysis.conflicts);
     *     }
     * }
     */
    async prepareBatchRenamePlan(
        renames: Array<RenameRequest>,
        options?: PrepareRenamePlanOptions
    ): Promise<BatchRenamePlanSummary> {
        const opts = options ?? {};
        const { validateHotReload = false, hotReloadOptions: rawHotOptions } = opts;
        const hotReloadOptions: HotReloadValidationOptions = rawHotOptions ?? {};

        // Validate the batch structure and individual renames up front, detecting
        // conflicts like duplicate target names or circular rename chains before
        // planning any workspace edits. This prevents wasted work when the batch
        // is malformed.
        const batchValidation = await this.validateBatchRenameRequest(renames, {
            includeHotReload: validateHotReload
        });

        // Try to plan the batch rename to capture all edits across all symbols in a
        // single merged workspace edit. If planning fails (e.g., due to conflicts),
        // we'll still return validation results to show the caller what went wrong.
        let workspace: WorkspaceEdit;
        let validation: ValidationSummary;
        let hotReloadValidation: ValidationSummary | null = null;
        let planningSucceeded = false;

        try {
            workspace = await this.planBatchRename(renames);
            validation = await this.validateRename(workspace);
            planningSucceeded = true;

            // Perform hot reload compatibility checks if requested
            if (validateHotReload) {
                const compatibility = await this.validateHotReloadCompatibility(workspace, hotReloadOptions);
                hotReloadValidation = {
                    valid: compatibility.valid,
                    errors: [...compatibility.errors],
                    warnings: [...compatibility.warnings]
                };
            }
        } catch (error) {
            // Planning failed, create an empty workspace and record the error
            workspace = new WorkspaceEdit();
            const errorMessage = Core.isErrorLike(error) ? error.message : String(error);
            validation = {
                valid: false,
                errors: [`Planning failed: ${errorMessage}`],
                warnings: []
            };

            // Initialize hot reload validation with the error if requested
            if (validateHotReload) {
                hotReloadValidation = {
                    valid: false,
                    errors: [`Cannot validate hot reload: ${errorMessage}`],
                    warnings: []
                };
            }
        }

        // Analyze the impact of each individual rename so callers can show
        // per-symbol statistics (files affected, occurrence counts, conflicts).
        const impactAnalyses = new Map<string, RenameImpactAnalysis>();
        for (const rename of renames) {
            try {
                const analysis = await this.analyzeRenameImpact(rename);
                impactAnalyses.set(rename.symbolId, analysis);
            } catch (error) {
                // If analysis fails for one rename, record a minimal error result
                // so the caller still receives feedback about what went wrong.
                impactAnalyses.set(rename.symbolId, {
                    valid: false,
                    summary: {
                        symbolId: rename.symbolId,
                        oldName: rename.symbolId.split("/").pop() ?? rename.symbolId,
                        newName: rename.newName,
                        affectedFiles: [],
                        totalOccurrences: 0,
                        definitionCount: 0,
                        referenceCount: 0,
                        hotReloadRequired: false,
                        dependentSymbols: []
                    },
                    conflicts: [
                        {
                            type: ConflictType.ANALYSIS_ERROR,
                            message: `Failed to analyze ${rename.symbolId}: ${Core.isErrorLike(error) ? error.message : String(error)}`
                        }
                    ],
                    warnings: []
                });
            }
        }

        // Compute the full hot reload dependency cascade for all changed symbols
        // to determine which other symbols need reloading and in what order.
        // Only compute if hot reload validation was requested and planning succeeded.
        let cascadeResult: HotReloadCascadeResult | null = null;
        if (validateHotReload && planningSucceeded) {
            const changedSymbolIds = renames.map((r) => r.symbolId);
            try {
                cascadeResult = await this.computeHotReloadCascade(changedSymbolIds);
            } catch (error) {
                // If cascade computation fails, add a warning to the hot reload
                // validation instead of failing the entire batch plan.
                if (hotReloadValidation) {
                    hotReloadValidation.warnings.push(
                        `Failed to compute hot reload cascade: ${Core.isErrorLike(error) ? error.message : String(error)}`
                    );
                }
            }
        }

        return {
            workspace,
            validation,
            hotReload: hotReloadValidation,
            batchValidation,
            impactAnalyses,
            cascadeResult
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
            warnings.push("Workspace edit contains no changes - hot reload not needed");
            return Promise.resolve({ valid: true, errors, warnings });
        }

        // Group edits by file
        const grouped = workspace.groupByFile();

        // Check each file for hot reload compatibility
        for (const [filePath, edits] of grouped.entries()) {
            // Validate file is a GML script (hot reloadable)
            if (!filePath.endsWith(".gml")) {
                warnings.push(`File ${filePath} is not a GML script - hot reload may not apply`);
            }

            // Examine each edit to detect whether it introduces language constructs
            // that GameMaker's runtime can't hot-reload safely. Global variables,
            // macros, and enums affect compile-time state or global scope, so
            // modifying them typically requires restarting the game to ensure the
            // runtime re-initializes these declarations with updated values.
            for (const edit of edits) {
                if (edit.newText.includes("globalvar")) {
                    warnings.push(`Edit in ${filePath} introduces 'globalvar' - may require full reload`);
                }

                if (edit.newText.includes("#macro")) {
                    warnings.push(`Edit in ${filePath} introduces '#macro' - may require full reload`);
                }

                if (edit.newText.includes("enum ")) {
                    warnings.push(`Edit in ${filePath} introduces 'enum' - may require full reload`);
                }
            }

            // Measure the total size of the replacement text across all edits to
            // identify large-scale changes. Edits that introduce thousands of
            // characters likely represent substantial rewrites (e.g., refactoring an
            // entire function body), which may confuse GameMaker's hot-reload engine
            // and benefit from a full restart to ensure clean initialization.
            const totalCharsChanged = edits.reduce((sum, e) => sum + e.newText.length, 0);
            if (totalCharsChanged > 5000) {
                warnings.push(`Large edit in ${filePath} (${totalCharsChanged} characters) - consider full reload`);
            }
        }

        // If transpiler check is requested, validate transpilation will work
        if (checkTranspiler && this.formatter && typeof this.formatter.transpileScript === "function") {
            // We'll check if any symbols being edited can be transpiled
            // This is a placeholder for more sophisticated checks
            warnings.push("Transpiler compatibility check requested - ensure changed symbols can be transpiled");
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
    /**
     * Prepare hot reload updates from a workspace edit.
     */
    async prepareHotReloadUpdates(workspace: WorkspaceEdit): Promise<Array<HotReloadUpdate>> {
        return HotReload.prepareHotReloadUpdates(workspace, this.semantic);
    }

    /**
     * Analyze the impact of a planned rename without applying it.
     * Provides detailed information about what will be changed.
     * @param {Object} request - Analysis request
     * @param {string} request.symbolId - Symbol to analyze
     * @param {string} request.newName - Proposed new name
     * @returns {Promise<{valid: boolean, summary: Object, conflicts: Array, warnings: Array}>}
     */
    async analyzeRenameImpact(request: RenameRequest): Promise<RenameImpactAnalysis> {
        const { symbolId, newName } = request ?? {};

        if (!symbolId || !newName) {
            throw new TypeError("analyzeRenameImpact requires symbolId and newName");
        }

        if (typeof symbolId !== "string") {
            throw new TypeError(`symbolId must be a string, got ${typeof symbolId}`);
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
                    type: ConflictType.MISSING_SYMBOL,
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
            const occurrences = await this.gatherSymbolOccurrences(summary.oldName);
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
            const detectedConflicts = await detectRenameConflicts(
                summary.oldName,
                normalizedNewName,
                occurrences,
                this.semantic,
                this.semantic
            );
            conflicts.push(...detectedConflicts);

            // Determine whether the GameMaker runtime can hot-reload these changes
            // without a full restart. If occurrences exist, we assume hot reload is
            // needed and query the semantic analyzer to identify dependent symbols
            // that also need reloading to maintain consistency.
            if (summary.totalOccurrences > 0) {
                summary.hotReloadRequired = true;

                if (this.semantic && typeof this.semantic.getDependents === "function") {
                    const dependents = (await this.semantic.getDependents([symbolId])) ?? [];
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
                    type: ConflictType.LARGE_RENAME,
                    message: `This rename will affect ${summary.totalOccurrences} occurrences across ${summary.affectedFiles.size} files`,
                    severity: "warning"
                });
            }

            if (summary.dependentSymbols.size > 10) {
                warnings.push({
                    type: ConflictType.MANY_DEPENDENTS,
                    message: `${summary.dependentSymbols.size} other symbols depend on this symbol`,
                    severity: "info"
                });
            }
        } catch (error) {
            conflicts.push({
                type: ConflictType.ANALYSIS_ERROR,
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
     */
    async computeHotReloadCascade(changedSymbolIds: Array<string>): Promise<HotReloadCascadeResult> {
        return HotReload.computeHotReloadCascade(changedSymbolIds, this.semantic);
    }

    /**
     * Check whether a rename operation is safe for hot reload.
     */
    async checkHotReloadSafety(request: RenameRequest): Promise<HotReloadSafetySummary> {
        return HotReload.checkHotReloadSafety(request, this.semantic);
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
        if (!Core.isNonEmptyTrimmedString(symbolId)) {
            errors.push("Invalid symbolId");
            return { valid: false, errors, warnings };
        }

        if (!Core.isNonEmptyTrimmedString(oldName)) {
            errors.push("Invalid oldName");
            return { valid: false, errors, warnings };
        }

        if (!Core.isNonEmptyTrimmedString(newName)) {
            errors.push("Invalid newName");
            return { valid: false, errors, warnings };
        }

        if (!workspace || !Core.isWorkspaceEditLike(workspace)) {
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
                errors.push(`Failed to read ${filePath} for post-edit validation: ${error.message}`);
                continue;
            }

            // Simple heuristic: check if the old name still appears as an identifier
            // This is a basic check - full validation would require re-parsing
            const identifierPattern = new RegExp(String.raw`\b${Core.escapeRegExp(oldName)}\b`, "g");
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
                        const isInLineComment = commentIndex !== -1 && commentIndex < oldNameIndex;
                        const isCommentLine = trimmed.startsWith("//");
                        const isInBlockComment = line.includes("/*") || line.includes("*/");

                        if (!isCommentLine && !isInLineComment && !isInBlockComment) {
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
            const newIdentifierPattern = new RegExp(String.raw`\b${Core.escapeRegExp(newName)}\b`, "g");
            const newNameMatches = content.match(newIdentifierPattern);

            if (!newNameMatches || newNameMatches.length === 0) {
                warnings.push(`New name '${newName}' does not appear in ${filePath} - verify edits were applied`);
            }
        }

        // Use semantic analyzer to check for new conflicts or shadowing
        if (this.semantic && typeof this.semantic.getSymbolOccurrences === "function") {
            try {
                // Query occurrences of the new name to detect any potential conflicts
                const newOccurrences = await this.semantic.getSymbolOccurrences(newName);

                // Look for occurrences outside our edited files - these could be conflicts
                const unexpectedOccurrences = newOccurrences.filter((occ) => !affectedFiles.includes(occ.path));

                if (unexpectedOccurrences.length > 0) {
                    const conflictPaths = Array.from(new Set(unexpectedOccurrences.map((o) => o.path)));
                    warnings.push(
                        `New name '${newName}' already exists in ${conflictPaths.length} other file(s): ${conflictPaths.join(", ")} - verify no shadowing occurred`
                    );
                }
            } catch (error) {
                warnings.push(`Could not verify occurrences of new name: ${error.message}`);
            }
        }

        // Use semantic analyzer to check for reserved keyword violations
        if (this.semantic && typeof this.semantic.getReservedKeywords === "function") {
            try {
                const keywords = await this.semantic.getReservedKeywords();
                if (keywords.includes(newName.toLowerCase())) {
                    errors.push(`New name '${newName}' conflicts with reserved keyword`);
                }
            } catch (error) {
                warnings.push(`Could not verify reserved keywords: ${error.message}`);
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
            warnings.push("No semantic analyzer available - skipping deep semantic validation");
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
     */
    async generateTranspilerPatches(
        hotReloadUpdates: Array<HotReloadUpdate>,
        readFile: WorkspaceReadFile
    ): Promise<Array<TranspilerPatch>> {
        return HotReload.generateTranspilerPatches(hotReloadUpdates, readFile, this.formatter);
    }

    /**
     * Detect conflicts for a proposed rename operation.
     * This method provides low-level conflict detection without throwing errors,
     * making it ideal for IDE integrations that need to show inline warnings
     * or CLI tools that want to preview potential issues before planning edits.
     */
    async detectRenameConflicts(request: {
        oldName: string;
        newName: string;
        occurrences: Array<SymbolOccurrence>;
    }): Promise<Array<ConflictEntry>> {
        const { oldName, newName, occurrences } = request ?? {};

        if (typeof oldName !== "string" || oldName.length === 0) {
            throw new TypeError("detectRenameConflicts requires oldName as a non-empty string");
        }

        if (typeof newName !== "string" || newName.length === 0) {
            throw new TypeError("detectRenameConflicts requires newName as a non-empty string");
        }

        if (!Array.isArray(occurrences)) {
            throw new TypeError("detectRenameConflicts requires occurrences as an array");
        }

        // Pass semantic analyzer twice: once as SymbolResolver for scope lookups,
        // once as KeywordProvider for reserved keyword checks. The SemanticAnalyzer
        // interface supports both roles through optional method implementations.
        return detectRenameConflicts(oldName, newName, occurrences, this.semantic, this.semantic);
    }
}

export function createRefactorEngine(dependencies: Partial<RefactorEngineDependencies> = {}): RefactorEngine {
    return new RefactorEngine(dependencies);
}
