/**
 * Refactor engine for GML-native codemod transactions and semantic-safe code transformations.
 * Coordinates rename operations, batch renames, hot reload validation, and
 * workspace edits (via a Collection API) across the project while preventing
 * scope capture and shadowing.
 *
 * This class is a thin coordinator: all heavy computation is delegated to the
 * focused domain modules (impact-analysis, rename-executor, rename-planner,
 * rename-request-validator, hot-reload, symbol-queries, validation).
 */

import { Core } from "@gml-modules/core";

import * as HotReload from "./hot-reload.js";
import * as ImpactAnalysis from "./impact-analysis.js";
import { createRefactorProjectAnalysisProvider } from "./project-analysis-provider.js";
import * as RenameExecutor from "./rename-executor.js";
import * as RenamePlanner from "./rename-planner.js";
import * as RenameRequestValidator from "./rename-request-validator.js";
import { RenameValidationCache } from "./rename-validation-cache.js";
import { SemanticQueryCache } from "./semantic-cache.js";
import * as SymbolQueries from "./symbol-queries.js";
import {
    type ApplyWorkspaceEditOptions,
    type BatchRenamePlanSummary,
    type BatchRenameValidation,
    type ConflictEntry,
    ConflictType,
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
    type RefactorProjectAnalysisProvider,
    type RenameImpactAnalysis,
    type RenameImpactGraph,
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
import { detectCircularRenames, detectRenameConflicts } from "./validation.js";
import { assertRenameRequest, assertValidIdentifierName, extractSymbolName } from "./validation-utils.js";
import { getWorkspaceArrays, WorkspaceEdit } from "./workspace-edit.js";

/**
 * RefactorEngine coordinates semantic-safe edits across the project.
 * It consumes parser spans and semantic bindings to plan WorkspaceEdits
 * that avoid scope capture or shadowing.
 */
export class RefactorEngine {
    public readonly parser: ParserBridge | null;
    public readonly semantic: PartialSemanticAnalyzer | null;
    public readonly formatter: TranspilerBridge | null;
    private readonly projectAnalysisProvider: RefactorProjectAnalysisProvider;
    private readonly renameValidationCache: RenameValidationCache;
    private readonly semanticCache: SemanticQueryCache;

    constructor({
        parser = null,
        semantic = null,
        formatter = null,
        projectAnalysisProvider = null
    }: Partial<RefactorEngineDependencies> = {}) {
        this.parser = parser ?? null;
        this.semantic = semantic ?? null;
        this.formatter = formatter ?? null;
        this.projectAnalysisProvider = projectAnalysisProvider ?? createRefactorProjectAnalysisProvider();
        this.renameValidationCache = new RenameValidationCache();
        this.semanticCache = new SemanticQueryCache(semantic);
    }

    /**
     * Find the symbol at a specific location in a file.
     * Useful for triggering refactorings from editor positions.
     */
    findSymbolAtLocation(filePath: string, offset: number): Promise<SymbolLocation | null> {
        return SymbolQueries.findSymbolAtLocation(filePath, offset, this.semantic, this.parser);
    }

    /**
     * Validate symbol exists in the semantic index.
     */
    validateSymbolExists(symbolId: string): Promise<boolean> {
        return SymbolQueries.validateSymbolExists(symbolId, this.semantic);
    }

    /**
     * Gather all occurrences of a symbol from the semantic analyzer.
     */
    gatherSymbolOccurrences(symbolName: string): Promise<Array<SymbolOccurrence>> {
        return this.semanticCache.getSymbolOccurrences(symbolName);
    }

    /**
     * Query the semantic analyzer for symbols defined in a specific file.
     * This is useful for hot reload coordination to determine which symbols
     * need recompilation when a file changes.
     */
    getFileSymbols(filePath: string): Promise<Array<{ id: string }>> {
        Core.assertNonEmptyString(filePath, {
            errorMessage: "getFileSymbols requires a valid file path string"
        });
        return this.semanticCache.getFileSymbols(filePath);
    }

    /**
     * Query the semantic analyzer for symbols that depend on the given symbols.
     * This is essential for hot reload to determine which symbols need recompilation
     * when dependencies change.
     */
    getSymbolDependents(symbolIds: Array<string>): Promise<Array<{ symbolId: string; filePath: string }>> {
        Core.assertArray(symbolIds, {
            errorMessage: "getSymbolDependents requires an array of symbol IDs"
        });
        return this.semanticCache.getDependents(symbolIds);
    }

    /**
     * Check if an identifier name is already occupied in the project.
     * This is used by @gml-modules/lint and @gml-modules/refactor to
     * determine if a proposed variable name or identifier is safe to use.
     */
    async isIdentifierOccupied(identifierName: string): Promise<boolean> {
        return await this.projectAnalysisProvider.isIdentifierOccupied(identifierName, {
            semantic: this.semantic,
            prepareRenamePlan: async (request, options) => await this.prepareRenamePlan(request, options)
        });
    }

    /**
     * List all files where an identifier occurs.
     * This is used by @gml-modules/lint and @gml-modules/refactor to
     * determine if a rename or refactor would affect multiple files.
     */
    async listIdentifierOccurrences(identifierName: string): Promise<Set<string>> {
        return await this.projectAnalysisProvider.listIdentifierOccurrences(identifierName, {
            semantic: this.semantic,
            prepareRenamePlan: async (request, options) => await this.prepareRenamePlan(request, options)
        });
    }

    /**
     * Validate a rename request before planning edits.
     * Unlike planRename, this method returns validation results without throwing errors,
     * making it suitable for providing user feedback in IDE integrations and CLI tools.
     *
     * @param {Object} request - Rename request to validate
     * @param {string} request.symbolId - Symbol to rename (e.g., "gml/script/scr_foo")
     * @param {string} request.newName - Proposed new name for the symbol
     * @returns {Promise<ValidationSummary>}
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
        const includeHotReload = options?.includeHotReload ?? false;
        // Pass `this.checkHotReloadSafety` as the checker so subclass overrides are honoured.
        const checker = (req: RenameRequest) => this.checkHotReloadSafety(req);

        if (includeHotReload) {
            return await RenameRequestValidator.computeRenameValidation(
                request,
                options,
                this.semantic,
                this.semanticCache,
                checker
            );
        }

        if (!request || typeof request.symbolId !== "string" || typeof request.newName !== "string") {
            return await RenameRequestValidator.computeRenameValidation(
                request,
                options,
                this.semantic,
                this.semanticCache,
                checker
            );
        }

        return await this.renameValidationCache.getOrCompute(request.symbolId, request.newName, async () => {
            return await RenameRequestValidator.computeRenameValidation(
                request,
                options,
                this.semantic,
                this.semanticCache,
                checker
            );
        });
    }

    /**
     * Validate a batch of rename requests before planning edits.
     * Provides comprehensive validation feedback for multiple rename operations,
     * checking for conflicts between renames and ensuring batch consistency.
     *
     * @param {Array<{symbolId: string, newName: string}>} renames - Rename requests to validate
     * @param {Object} [options] - Validation options
     * @param {boolean} [options.includeHotReload=false] - Whether to check hot reload safety for each rename
     * @returns {Promise<BatchRenameValidation>} Aggregated validation results
     */
    async validateBatchRenameRequest(
        renames: Array<RenameRequest>,
        options?: ValidateRenameRequestOptions
    ): Promise<BatchRenameValidation> {
        return await RenameRequestValidator.validateBatchRenameRequests(
            renames,
            options,
            async (rename, opts) => await this.validateRenameRequest(rename, opts)
        );
    }

    /**
     * Plan a rename refactoring for a symbol.
     * @param {Object} request - Rename request
     * @param {string} request.symbolId - Symbol to rename (e.g., "gml/script/scr_foo")
     * @param {string} request.newName - New name for the symbol
     * @returns {Promise<WorkspaceEdit>} Workspace edit with all necessary changes
     */
    async planRename(request: RenameRequest): Promise<WorkspaceEdit> {
        return await RenamePlanner.buildRenameWorkspace(request, this.semantic, this.semanticCache);
    }

    /**
     * Validate a planned rename before applying it.
     * This performs a dry-run to detect conflicts.
     * @param {WorkspaceEdit} workspace - The planned edits
     * @returns {Promise<ValidationSummary>}
     */
    async validateRename(workspace: WorkspaceEdit): Promise<ValidationSummary> {
        return await RenameExecutor.validateWorkspaceEdit(workspace, this.semantic);
    }

    /**
     * Apply workspace edits to files.
     * @param {WorkspaceEdit} workspace - The edits to apply
     * @param {Object} options - Application options including readFile/writeFile callbacks
     * @returns {Promise<Map<string, string>>} Map of file paths to their new content
     */
    async applyWorkspaceEdit(
        workspace: WorkspaceEdit,
        options?: ApplyWorkspaceEditOptions
    ): Promise<Map<string, string>> {
        const opts: ApplyWorkspaceEditOptions = options ?? ({} as ApplyWorkspaceEditOptions);
        return await RenameExecutor.applyWorkspaceEdits(workspace, opts, this.semantic);
    }

    /**
     * Plan multiple rename operations that should be applied together.
     * @param {Array<{symbolId: string, newName: string}>} renames - Array of rename operations
     * @returns {Promise<WorkspaceEdit>} Combined workspace edit for all renames
     */
    async planBatchRename(renames: Array<RenameRequest>): Promise<WorkspaceEdit> {
        Core.assertArray(renames, {
            errorMessage: "planBatchRename requires an array of renames"
        });

        if (renames.length === 0) {
            throw new Error("planBatchRename requires at least one rename");
        }

        // Validate all rename requests and ensure no duplicates.
        const symbolIds = new Set<string>();
        for (const rename of renames) {
            assertRenameRequest(rename, "Each rename in planBatchRename");
            if (symbolIds.has(rename.symbolId)) {
                throw new Error(`Duplicate rename request for symbolId '${rename.symbolId}'`);
            }
            symbolIds.add(rename.symbolId);
            assertValidIdentifierName(rename.newName);
        }

        // Ensure no two renames target the same new name.
        const newNames = new Set<string>();
        for (const rename of renames) {
            const normalizedNewName = assertValidIdentifierName(rename.newName);
            if (newNames.has(normalizedNewName)) {
                throw new Error(`Cannot rename multiple symbols to '${normalizedNewName}'`);
            }
            newNames.add(normalizedNewName);
        }

        // Detect circular rename chains (A→B and B→A in the same batch).
        const circularChain = detectCircularRenames(renames);
        if (circularChain.length > 0) {
            const chain = circularChain.map((id) => extractSymbolName(id)).join(" → ");
            throw new Error(
                `Circular rename chain detected: ${chain}. ` +
                    `Cannot rename symbols in a cycle as it would create conflicts.`
            );
        }

        // Plan each rename independently then merge into a single atomic edit.
        const workspaces: Array<WorkspaceEdit> = [];
        await Core.runSequentially(renames, async (rename) => {
            const workspace = await this.planRename(rename);
            workspaces.push(workspace);
        });

        const merged = new WorkspaceEdit();
        for (const workspace of workspaces) {
            for (const edit of workspace.edits) {
                merged.addEdit(edit.path, edit.start, edit.end, edit.newText);
            }
            const { metadataEdits, fileRenames } = getWorkspaceArrays(workspace);
            for (const metadataEdit of metadataEdits) {
                merged.addMetadataEdit(metadataEdit.path, metadataEdit.content);
            }
            for (const fileRename of fileRenames) {
                merged.addFileRename(fileRename.oldPath, fileRename.newPath);
            }
        }

        const validation = await this.validateRename(merged);
        throwIfValidationFailed(validation, "Batch rename validation failed");

        return merged;
    }

    /**
     * Execute a rename refactoring with optional hot reload integration.
     * @param {ExecuteRenameRequest} request - Rename request including file I/O callbacks
     * @returns {Promise<ExecuteRenameResult>}
     */
    async executeRename(request: ExecuteRenameRequest): Promise<ExecuteRenameResult> {
        const {
            symbolId,
            newName,
            readFile,
            writeFile,
            prepareHotReload = false
        } = request ?? ({} as ExecuteRenameRequest);

        assertRenameRequest({ symbolId, newName }, "executeRename");
        Core.assertFunction(readFile, "readFile", {
            errorMessage: "executeRename requires a readFile function"
        });
        Core.assertFunction(writeFile, "writeFile", {
            errorMessage: "executeRename requires a writeFile function"
        });

        const workspace = await this.planRename({ symbolId, newName });
        const validation = await this.validateRename(workspace);
        throwIfValidationFailed(validation, "Rename validation failed");

        const applied = await this.applyWorkspaceEdit(workspace, {
            readFile,
            writeFile,
            renameFile: request.renameFile,
            deleteFile: request.deleteFile,
            dryRun: false
        });
        this.renameValidationCache.invalidateAll();

        let hotReloadUpdates: Array<HotReloadUpdate> = [];
        if (prepareHotReload) {
            hotReloadUpdates = await this.prepareHotReloadUpdates(workspace);
        }

        return { workspace, applied, hotReloadUpdates, fileRenames: [...workspace.fileRenames] };
    }

    /**
     * Execute multiple renames atomically with optional hot reload integration.
     * @param {ExecuteBatchRenameRequest} request - Batch rename request
     * @returns {Promise<ExecuteRenameResult>}
     */
    async executeBatchRename(request: ExecuteBatchRenameRequest): Promise<ExecuteRenameResult> {
        const { renames, readFile, writeFile, prepareHotReload = false } = request ?? ({} as ExecuteBatchRenameRequest);

        Core.assertArray(renames, { errorMessage: "executeBatchRename requires renames array" });
        Core.assertFunction(readFile, "readFile", {
            errorMessage: "executeBatchRename requires a readFile function"
        });
        Core.assertFunction(writeFile, "writeFile", {
            errorMessage: "executeBatchRename requires a writeFile function"
        });

        const workspace = await this.planBatchRename(renames);

        const applied = await this.applyWorkspaceEdit(workspace, {
            readFile,
            writeFile,
            renameFile: request.renameFile,
            deleteFile: request.deleteFile,
            dryRun: false
        });
        this.renameValidationCache.invalidateAll();

        let hotReloadUpdates: Array<HotReloadUpdate> = [];
        if (prepareHotReload) {
            hotReloadUpdates = await this.prepareHotReloadUpdates(workspace);
        }

        return { workspace, applied, hotReloadUpdates, fileRenames: [...workspace.fileRenames] };
    }

    /**
     * Prepare a rename plan with validation and optional hot reload checks.
     *
     * @param {RenameRequest} request - Rename request.
     * @param {PrepareRenamePlanOptions} [options] - Additional validation controls.
     * @returns {Promise<RenamePlanSummary>} Aggregated rename plan data.
     */
    async prepareRenamePlan(request: RenameRequest, options?: PrepareRenamePlanOptions): Promise<RenamePlanSummary> {
        const opts = options ?? {};
        const { validateHotReload = false, hotReloadOptions: rawHotOptions } = opts;
        const hotReloadOptions: HotReloadValidationOptions = rawHotOptions ?? {};

        const workspace = await this.planRename(request);
        const validation = await this.validateRename(workspace);

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

        const analysis = await this.analyzeRenameImpact(request);

        return { workspace, validation, hotReload: hotReloadValidation, analysis };
    }

    /**
     * Prepare a comprehensive batch rename plan with validation, impact analysis,
     * and hot reload metadata for multiple coordinated symbol renames.
     *
     * @param {Array<RenameRequest>} renames - Rename operations to plan
     * @param {PrepareRenamePlanOptions} [options] - Additional validation controls
     * @returns {Promise<BatchRenamePlanSummary>} Comprehensive batch rename plan
     */
    async prepareBatchRenamePlan(
        renames: Array<RenameRequest>,
        options?: PrepareRenamePlanOptions
    ): Promise<BatchRenamePlanSummary> {
        const opts = options ?? {};
        const { validateHotReload = false, hotReloadOptions: rawHotOptions } = opts;
        const hotReloadOptions: HotReloadValidationOptions = rawHotOptions ?? {};

        const batchValidation = await this.validateBatchRenameRequest(renames, {
            includeHotReload: validateHotReload
        });

        let workspace: WorkspaceEdit;
        let validation: ValidationSummary;
        let hotReloadValidation: ValidationSummary | null = null;
        let planningSucceeded = false;

        try {
            workspace = await this.planBatchRename(renames);
            validation = await this.validateRename(workspace);
            planningSucceeded = true;

            if (validateHotReload) {
                const compatibility = await this.validateHotReloadCompatibility(workspace, hotReloadOptions);
                hotReloadValidation = {
                    valid: compatibility.valid,
                    errors: [...compatibility.errors],
                    warnings: [...compatibility.warnings]
                };
            }
        } catch (error) {
            workspace = new WorkspaceEdit();
            validation = {
                valid: false,
                errors: [`Planning failed: ${Core.getErrorMessage(error)}`],
                warnings: []
            };

            if (validateHotReload) {
                hotReloadValidation = {
                    valid: false,
                    errors: [`Cannot validate hot reload: ${Core.getErrorMessage(error)}`],
                    warnings: []
                };
            }
        }

        const impactAnalyses = new Map<string, RenameImpactAnalysis>();
        await Core.runSequentially(renames, async (rename) => {
            try {
                const analysis = await this.analyzeRenameImpact(rename);
                impactAnalyses.set(rename.symbolId, analysis);
            } catch (error) {
                impactAnalyses.set(rename.symbolId, {
                    valid: false,
                    summary: {
                        symbolId: rename.symbolId,
                        oldName: extractSymbolName(rename.symbolId),
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
                            message: `Failed to analyze ${rename.symbolId}: ${Core.getErrorMessage(error)}`
                        }
                    ],
                    warnings: []
                });
            }
        });

        let cascadeResult: HotReloadCascadeResult | null = null;
        if (validateHotReload && planningSucceeded) {
            const changedSymbolIds = renames.map((r) => r.symbolId);
            try {
                cascadeResult = await this.computeHotReloadCascade(changedSymbolIds);
            } catch (error) {
                if (hotReloadValidation) {
                    hotReloadValidation.warnings.push(
                        `Failed to compute hot reload cascade: ${Core.getErrorMessage(error)}`
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
     * Checks for constructs that require a full restart (globalvar, #macro, enum).
     *
     * @param {WorkspaceEdit} workspace - The workspace edit to validate
     * @param {HotReloadValidationOptions} [options] - Validation options
     * @returns {Promise<ValidationSummary>}
     */
    async validateHotReloadCompatibility(
        workspace: WorkspaceEdit,
        options?: HotReloadValidationOptions
    ): Promise<ValidationSummary> {
        const opts = options ?? {};
        const { checkTranspiler = false, readFile } = opts;
        const errors: Array<string> = [];
        const warnings: Array<string> = [];

        if (!workspace || !Core.isWorkspaceEditLike(workspace)) {
            errors.push("Invalid workspace edit");
            return { valid: false, errors, warnings };
        }

        const { metadataEdits, fileRenames } = getWorkspaceArrays(workspace);
        const hasTextEdits = workspace.edits.length > 0;
        const hasMetadataEdits = metadataEdits.length > 0;
        const hasFileRenames = fileRenames.length > 0;

        if (!hasTextEdits && !hasMetadataEdits && !hasFileRenames) {
            warnings.push("Workspace edit contains no changes - hot reload not needed");
            return { valid: true, errors, warnings };
        }

        if (!hasTextEdits && hasMetadataEdits) {
            warnings.push("Workspace edit contains metadata-only changes - hot reload patching not required");
            return { valid: true, errors, warnings };
        }

        const grouped = workspace.groupByFile();

        // Flag constructs that GameMaker's runtime cannot patch without a full restart.
        for (const [filePath, edits] of grouped.entries()) {
            if (!filePath.endsWith(".gml")) {
                warnings.push(`File ${filePath} is not a GML script - hot reload may not apply`);
            }

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

            const totalCharsChanged = edits.reduce((sum, e) => sum + e.newText.length, 0);
            if (totalCharsChanged > 5000) {
                warnings.push(`Large edit in ${filePath} (${totalCharsChanged} characters) - consider full reload`);
            }
        }

        if (checkTranspiler) {
            const transpilerValidation = await RenameExecutor.validateTranspilerCompatibility(
                workspace,
                readFile,
                this.formatter,
                this.semantic
            );
            errors.push(...transpilerValidation.errors);
            warnings.push(...transpilerValidation.warnings);
        }

        return { valid: errors.length === 0, errors, warnings };
    }

    /**
     * Prepare hot reload updates from a workspace edit.
     */
    async prepareHotReloadUpdates(workspace: WorkspaceEdit): Promise<Array<HotReloadUpdate>> {
        return await HotReload.prepareHotReloadUpdates(workspace, this.semantic);
    }

    /**
     * Analyse the impact of a planned rename without applying it.
     */
    async analyzeRenameImpact(request: RenameRequest): Promise<RenameImpactAnalysis> {
        return await ImpactAnalysis.analyzeRenameImpact(request, this.semantic, this.semanticCache);
    }

    /**
     * Compute the full dependency cascade for hot reload operations.
     */
    async computeHotReloadCascade(changedSymbolIds: Array<string>): Promise<HotReloadCascadeResult> {
        return await HotReload.computeHotReloadCascade(changedSymbolIds, this.semantic);
    }

    /**
     * Check whether a rename operation is safe for hot reload.
     */
    async checkHotReloadSafety(request: RenameRequest): Promise<HotReloadSafetySummary> {
        return await HotReload.checkHotReloadSafety(request, this.semantic);
    }

    /**
     * Compute a detailed dependency impact graph for a rename operation.
     *
     * @param symbolId - The symbol being renamed
     * @returns Impact graph with nodes, edges, critical path, and timing estimates
     */
    async computeRenameImpactGraph(symbolId: string): Promise<RenameImpactGraph> {
        return await HotReload.computeRenameImpactGraph(symbolId, this.semantic);
    }

    /**
     * Verify semantic integrity after applying edits.
     * Validates that renamed symbols still resolve correctly and no accidental
     * shadowing or scope capture occurred.
     *
     * @param {Object} request - Verification inputs: symbolId, oldName, newName, workspace, readFile
     * @returns {Promise<ValidationSummary>}
     */
    async verifyPostEditIntegrity(request: {
        symbolId: string;
        oldName: string;
        newName: string;
        workspace: WorkspaceEdit;
        readFile: WorkspaceReadFile;
    }): Promise<ValidationSummary> {
        return await ImpactAnalysis.verifyPostEditIntegrity(request, this.semantic, this.parser);
    }

    /**
     * Integrate refactor results with the transpiler for hot reload.
     */
    async generateTranspilerPatches(
        hotReloadUpdates: Array<HotReloadUpdate>,
        readFile: WorkspaceReadFile
    ): Promise<Array<TranspilerPatch>> {
        return await HotReload.generateTranspilerPatches(hotReloadUpdates, readFile, this.formatter);
    }

    /**
     * Detect conflicts for a proposed rename operation.
     * Provides low-level conflict detection without throwing errors.
     */
    async detectRenameConflicts(request: {
        oldName: string;
        newName: string;
        occurrences: Array<SymbolOccurrence>;
    }): Promise<Array<ConflictEntry>> {
        const { oldName, newName, occurrences } = request ?? {};

        Core.assertNonEmptyString(oldName, {
            errorMessage: "detectRenameConflicts requires oldName as a non-empty string"
        });
        Core.assertNonEmptyString(newName, {
            errorMessage: "detectRenameConflicts requires newName as a non-empty string"
        });
        Core.assertArray(occurrences, {
            errorMessage: "detectRenameConflicts requires occurrences as an array"
        });

        return await detectRenameConflicts(oldName, newName, occurrences, this.semantic, this.semantic);
    }

    /**
     * Plan renames for Feather quick fixes.
     */
    async planFeatherRenames(
        requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>,
        filePath: string | null,
        projectRoot: string
    ): Promise<
        Array<{
            identifierName: string;
            mode: "local-fallback" | "project-aware";
            preferredReplacementName: string;
            replacementName: string | null;
            skipReason?: string;
        }>
    > {
        return await this.projectAnalysisProvider.planFeatherRenames(requests, filePath, projectRoot, {
            semantic: this.semantic,
            prepareRenamePlan: async (request, options) => await this.prepareRenamePlan(request, options)
        });
    }

    /**
     * Assess whether a global variable rewrite is safe/allowed.
     */
    assessGlobalVarRewrite(
        filePath: string | null,
        hasInitializer: boolean
    ): {
        allowRewrite: boolean;
        initializerMode: "existing" | "undefined";
        mode: "project-aware";
    } {
        return this.projectAnalysisProvider.assessGlobalVarRewrite(filePath, hasInitializer);
    }

    /**
     * Resolve identifier for loop hoisting.
     */
    resolveLoopHoistIdentifier(preferredName: string): {
        identifierName: string;
        mode: "project-aware";
    } {
        return this.projectAnalysisProvider.resolveLoopHoistIdentifier(preferredName);
    }

    /**
     * Invalidate semantic cache for a specific file.
     * Call this when a file changes during hot reload to ensure fresh semantic data.
     */
    invalidateSemanticCacheForFile(filePath: string): void {
        this.semanticCache.invalidateFile(filePath);
    }

    /**
     * Invalidate all semantic cache entries.
     * Call this when starting a new refactoring session or after major changes.
     */
    invalidateAllSemanticCache(): void {
        this.semanticCache.invalidateAll();
    }

    /**
     * Get semantic cache statistics for monitoring performance.
     */
    getSemanticCacheStats() {
        return this.semanticCache.getStats();
    }
}

/**
 * Throw an error if validation failed.
 * @param validation - The validation summary to check
 * @param context - Context string to include in the error message
 * @throws Error with formatted validation errors if validation failed
 */
function throwIfValidationFailed(validation: ValidationSummary, context: string): void {
    if (!validation.valid) {
        throw new Error(`${context}: ${validation.errors.join("; ")}`);
    }
}

export function createRefactorEngine(dependencies: Partial<RefactorEngineDependencies> = {}): RefactorEngine {
    return new RefactorEngine(dependencies);
}
