/**
 * Preview-then-commit rename workflows.
 *
 * Provides high-level orchestration for rename operations that need to show
 * users a complete preview (validation + dry-run + integrity check) before
 * committing changes to disk. Essential for IDE integrations and CLI tools
 * that want to present full impact analysis and allow user confirmation.
 */

import type { RefactorEngine } from "./refactor-engine.js";
import type { WorkspaceEdit } from "./workspace-edit.js";
import type {
    RenameRequest,
    ValidationSummary,
    WorkspaceReadFile,
    WorkspaceWriteFile,
    RenameImpactAnalysis
} from "./types.js";

/**
 * Complete rename preview including validation, dry-run results, and integrity check.
 *
 * @property workspace - The planned workspace edit
 * @property validation - Structural validation results (overlaps, conflicts)
 * @property impact - Detailed impact analysis (affected files, dependencies)
 * @property preview - Map of file paths to their post-rename content (dry-run results)
 * @property integrity - Post-edit integrity check results
 * @property hotReload - Optional hot reload compatibility check
 */
export interface RenamePreview {
    workspace: WorkspaceEdit;
    validation: ValidationSummary;
    impact: RenameImpactAnalysis;
    preview: Map<string, string>;
    integrity: ValidationSummary;
    hotReload: ValidationSummary | null;
}

/**
 * Options for rename preview generation.
 */
export interface GenerateRenamePreviewOptions {
    /**
     * Function to read file contents.
     */
    readFile: WorkspaceReadFile;

    /**
     * Whether to include hot reload compatibility checks.
     * @default false
     */
    includeHotReload?: boolean;

    /**
     * Whether to check transpiler compatibility during hot reload validation.
     * Only used if includeHotReload is true.
     * @default false
     */
    checkTranspiler?: boolean;
}

/**
 * Options for committing a rename preview.
 */
export interface CommitRenamePreviewOptions {
    /**
     * The preview to commit.
     */
    preview: RenamePreview;

    /**
     * Function to write file contents.
     */
    writeFile: WorkspaceWriteFile;

    /**
     * Whether to prepare hot reload updates after committing.
     * @default false
     */
    prepareHotReload?: boolean;
}

/**
 * Generate a complete rename preview without modifying any files.
 *
 * This method orchestrates all pre-commit validation and preview generation
 * steps into a single call, making it easy for IDE integrations and CLI tools
 * to present a complete picture to users before they commit to the rename.
 *
 * The preview includes:
 * - Planned workspace edit
 * - Structural validation (overlaps, invalid edits)
 * - Impact analysis (affected files, dependencies, occurrence counts)
 * - Dry-run results (what each file will look like after the rename)
 * - Post-edit integrity check (ensuring no semantic breakage)
 * - Optional hot reload compatibility check
 *
 * @param engine - The refactor engine to use for planning and validation
 * @param request - The rename request to preview
 * @param options - Preview generation options
 * @returns Complete rename preview with all validation and preview data
 *
 * @example
 * const preview = await generateRenamePreview(engine, {
 *     symbolId: "gml/script/scr_player",
 *     newName: "scr_hero"
 * }, {
 *     readFile: async (path) => await fs.readFile(path, 'utf8'),
 *     includeHotReload: true
 * });
 *
 * // Present preview to user
 * console.log(`This rename will affect ${preview.impact.summary.affectedFiles.length} files`);
 * console.log(`Total occurrences: ${preview.impact.summary.totalOccurrences}`);
 *
 * // Show what each file will look like
 * for (const [filePath, newContent] of preview.preview) {
 *     console.log(`\n=== ${filePath} ===`);
 *     console.log(newContent);
 * }
 *
 * // Check for issues
 * if (!preview.validation.valid) {
 *     console.error("Validation errors:", preview.validation.errors);
 * }
 * if (!preview.integrity.valid) {
 *     console.error("Integrity errors:", preview.integrity.errors);
 * }
 *
 * // User confirms, then commit
 * if (userConfirms) {
 *     await commitRenamePreview(engine, {
 *         preview,
 *         writeFile: async (path, content) => await fs.writeFile(path, content)
 *     });
 * }
 */
export async function generateRenamePreview(
    engine: RefactorEngine,
    request: RenameRequest,
    options: GenerateRenamePreviewOptions
): Promise<RenamePreview> {
    const {
        readFile,
        includeHotReload = false,
        checkTranspiler = false
    } = options;

    if (!engine || typeof engine.planRename !== "function") {
        throw new TypeError(
            "generateRenamePreview requires a valid RefactorEngine"
        );
    }

    if (!readFile || typeof readFile !== "function") {
        throw new TypeError(
            "generateRenamePreview requires a readFile function"
        );
    }

    // Step 1: Plan the rename and gather all edits
    const workspace = await engine.planRename(request);

    // Step 2: Run structural validation (overlaps, invalid edits)
    const validation = await engine.validateRename(workspace);

    // Step 3: Analyze the impact (affected files, dependencies, scope)
    const impact = await engine.analyzeRenameImpact(request);

    // Step 4: Perform a dry-run to show what files will look like
    // Only perform dry-run if workspace has edits to avoid validation error
    let preview = new Map<string, string>();
    if (
        workspace.edits.length > 0 && // If validation already failed, don't attempt to apply edits
        // (e.g., overlapping edits would corrupt the output)
        validation.valid
    ) {
        preview = await engine.applyWorkspaceEdit(workspace, {
            readFile,
            dryRun: true
        });
    }
    // If validation failed, preview remains empty - user will see validation errors

    // Step 5: Verify post-edit integrity using dry-run results
    const dryRunReadFile: WorkspaceReadFile = (
        path: string
    ): Promise<string> => {
        // If we have a preview for this file, return the preview content
        // Otherwise fall back to the original file
        if (preview.has(path)) {
            return Promise.resolve(preview.get(path));
        }
        return Promise.resolve(readFile(path));
    };

    const integrity = await engine.verifyPostEditIntegrity({
        symbolId: request.symbolId,
        oldName: request.symbolId.split("/").pop() ?? request.symbolId,
        newName: request.newName,
        workspace,
        readFile: dryRunReadFile
    });

    // Step 6: Optional hot reload compatibility check
    let hotReload: ValidationSummary | null = null;
    if (includeHotReload) {
        hotReload = await engine.validateHotReloadCompatibility(workspace, {
            checkTranspiler
        });
    }

    return {
        workspace,
        validation,
        impact,
        preview,
        integrity,
        hotReload
    };
}

/**
 * Commit a rename preview by writing changes to disk.
 *
 * This method writes the preview content that was previously
 * generated with `generateRenamePreview`. It's designed to be called after
 * the user has reviewed and confirmed the preview.
 *
 * @param engine - The refactor engine to use for hot reload preparation
 * @param options - Commit options including the preview and write function
 * @returns Map of file paths to their new content (same as preview.preview)
 *
 * @example
 * // Generate preview
 * const preview = await generateRenamePreview(engine, request, { readFile });
 *
 * // User reviews and confirms
 * if (userConfirms) {
 *     const result = await commitRenamePreview(engine, {
 *         preview,
 *         writeFile: async (path, content) => await fs.writeFile(path, content),
 *         prepareHotReload: true
 *     });
 *
 *     console.log(`Successfully renamed in ${result.size} files`);
 * }
 */
export async function commitRenamePreview(
    engine: RefactorEngine,
    options: CommitRenamePreviewOptions
): Promise<Map<string, string>> {
    const { preview, writeFile, prepareHotReload = false } = options;

    if (!engine || typeof engine.prepareHotReloadUpdates !== "function") {
        throw new TypeError(
            "commitRenamePreview requires a valid RefactorEngine"
        );
    }

    if (!preview || typeof preview !== "object") {
        throw new TypeError(
            "commitRenamePreview requires a valid RenamePreview"
        );
    }

    if (!writeFile || typeof writeFile !== "function") {
        throw new TypeError(
            "commitRenamePreview requires a writeFile function"
        );
    }

    // Write the preview content to disk
    // The preview already contains the final content after applying edits
    // We write sequentially to avoid file system race conditions
     
    for (const [path, content] of preview.preview) {
        await writeFile(path, content);
    }

    // Optionally prepare hot reload updates
    if (prepareHotReload) {
        await engine.prepareHotReloadUpdates(preview.workspace);
    }

    // Return the preview content (what was written)
    return new Map(preview.preview);
}
