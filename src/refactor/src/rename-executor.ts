/**
 * Workspace edit validation and application (executor layer).
 *
 * Provides standalone functions for structurally validating a `WorkspaceEdit`,
 * applying content edits to source strings, and writing changes to the filesystem.
 * Transpiler-compatibility validation lives here too so that it can be shared by
 * both the apply path and the hot-reload planning path.
 */

import { Core } from "@gml-modules/core";

import {
    type ApplyWorkspaceEditOptions,
    type PartialSemanticAnalyzer,
    type TranspilerBridge,
    type ValidationSummary,
    type WorkspaceReadFile
} from "./types.js";
import { getWorkspaceArrays, type GroupedTextEdits, type TextEdit, type WorkspaceEdit } from "./workspace-edit.js";

/**
 * Validate the structural integrity of a `WorkspaceEdit`.
 *
 * Checks for overlapping edit ranges, duplicate metadata paths, mixed
 * text/metadata edits on the same file, and optionally invokes the semantic
 * analyzer's `validateEdits` method for deeper validation.
 *
 * @param workspace - The workspace edit to validate.
 * @param semantic - Optional semantic analyzer for deep validation.
 * @returns Validation summary with errors and warnings.
 */
export async function validateWorkspaceEdit(
    workspace: WorkspaceEdit,
    semantic: PartialSemanticAnalyzer | null
): Promise<ValidationSummary> {
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
        errors.push("Workspace edit contains no changes");
        return { valid: false, errors, warnings };
    }

    const grouped: GroupedTextEdits = workspace.groupByFile();

    // Detect overlapping ranges within each file. Edits are sorted descending by
    // start position so overlaps show up as `next.end > current.start`.
    for (const [filePath, edits] of grouped.entries()) {
        for (let i = 0; i < edits.length - 1; i++) {
            const current = edits[i];
            const next = edits[i + 1];

            if (next.end > current.start) {
                errors.push(`Overlapping edits detected in ${filePath} at positions ${current.start}-${next.end}`);
            }
        }

        if (edits.length > 50) {
            warnings.push(
                `Large number of edits (${edits.length}) planned for ${filePath}. ` +
                    `Consider reviewing the scope of this refactoring.`
            );
        }
    }

    const metadataPaths = new Set<string>();
    for (const metadataEdit of metadataEdits) {
        if (!Core.isNonEmptyString(metadataEdit.path)) {
            errors.push("Metadata edit path must be a non-empty string");
            continue;
        }

        if (metadataPaths.has(metadataEdit.path)) {
            errors.push(`Duplicate metadata edit detected for ${metadataEdit.path}`);
            continue;
        }

        metadataPaths.add(metadataEdit.path);

        if (typeof metadataEdit.content !== "string") {
            errors.push(`Metadata edit content for ${metadataEdit.path} must be a string`);
        }
    }

    for (const metadataPath of metadataPaths) {
        if (grouped.has(metadataPath)) {
            errors.push(`Cannot combine text and metadata edits for ${metadataPath}`);
        }
    }

    if (Core.hasMethods(semantic, "validateEdits")) {
        try {
            const semanticValidation = (await semantic.validateEdits(workspace)) ?? {};
            errors.push(...(semanticValidation.errors || []));
            warnings.push(...(semanticValidation.warnings || []));
        } catch (error) {
            warnings.push(
                `Semantic validation failed: ${Core.getErrorMessage(error)}. Proceeding with basic validation only.`
            );
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Apply a series of text edits (sorted descending by start) to a source string.
 *
 * Edits must be pre-sorted in descending order by start position (as returned
 * by `WorkspaceEdit.groupByFile()`) so that applying each edit from the end of
 * the string does not shift the offsets of earlier edits.
 *
 * @param originalContent - The original file content.
 * @param edits - Edits sorted descending by start position.
 * @returns The modified content string.
 */
export function applyEditsToContent(
    originalContent: string,
    edits: Array<Pick<TextEdit, "start" | "end" | "newText">>
): string {
    let content = originalContent;

    for (const edit of edits) {
        const before = content.slice(0, Math.max(0, edit.start));
        const after = content.slice(Math.max(0, edit.end));
        content = before + edit.newText + after;
    }

    return content;
}

/**
 * Validate that modified symbols can be successfully transpiled.
 *
 * For each GML file in the workspace edit, applies the edits to reconstruct
 * the modified content and attempts to transpile each symbol defined in that
 * file. Errors indicate that hot reload patches cannot be generated.
 *
 * @param workspace - The workspace edit containing pending changes.
 * @param readFile - Function to read current file content.
 * @param formatter - Transpiler bridge used to validate transpilation.
 * @param semantic - Optional semantic analyzer to query per-file symbols.
 * @returns Object with errors and warnings arrays.
 */
export async function validateTranspilerCompatibility(
    workspace: WorkspaceEdit,
    readFile: WorkspaceReadFile | undefined,
    formatter: TranspilerBridge | null,
    semantic: PartialSemanticAnalyzer | null
): Promise<{ errors: Array<string>; warnings: Array<string> }> {
    const errors: Array<string> = [];
    const warnings: Array<string> = [];

    if (!Core.hasMethods(formatter, "transpileScript")) {
        warnings.push("No transpiler available - cannot validate transpilation compatibility");
        return { errors, warnings };
    }

    const grouped = workspace.groupByFile();
    let validatedFiles = 0;
    let validatedSymbols = 0;

    await Core.runSequentially(grouped.entries(), async ([filePath, edits]) => {
        if (!filePath.endsWith(".gml")) {
            return;
        }

        let symbolsInFile: Array<{ id: string }> = [];
        if (Core.hasMethods(semantic, "getFileSymbols")) {
            try {
                symbolsInFile = await semantic.getFileSymbols(filePath);
            } catch (error) {
                warnings.push(`Could not query symbols for ${filePath}: ${Core.getErrorMessage(error)}`);
                return;
            }
        }

        if (symbolsInFile.length === 0) {
            const fileName =
                filePath
                    .split("/")
                    .pop()
                    ?.replace(/\.gml$/, "") ?? "unknown";
            symbolsInFile = [{ id: `gml/script/${fileName}` }];
        }

        let modifiedContent: string;
        try {
            const originalContent = readFile ? await readFile(filePath) : "";
            modifiedContent = applyEditsToContent(originalContent, edits);
        } catch (error) {
            errors.push(`Failed to apply edits to ${filePath}: ${Core.getErrorMessage(error)}`);
            return;
        }

        await Core.runSequentially(symbolsInFile, async (symbol) => {
            try {
                await formatter.transpileScript({
                    sourceText: modifiedContent,
                    symbolId: symbol.id
                });
                validatedSymbols++;
            } catch (error) {
                const errorMessage = Core.getErrorMessage(error);
                errors.push(`Transpilation failed for ${symbol.id} in ${filePath}: ${errorMessage}`);
            }
        });

        validatedFiles++;
    });

    if (validatedFiles > 0 && errors.length === 0) {
        warnings.push(
            `Transpiler compatibility validated for ${validatedSymbols} symbol(s) in ${validatedFiles} file(s)`
        );
    } else if (validatedFiles === 0) {
        warnings.push("No GML files found for transpiler compatibility validation");
    }

    return { errors, warnings };
}

/**
 * Apply workspace edits to the filesystem.
 *
 * Validates the edit set, processes text edits and metadata edits by reading and
 * re-writing each file, and optionally executes file renames last. In dry-run
 * mode the modified contents are returned but no files are written or renamed.
 *
 * @param workspace - The workspace edit to apply.
 * @param options - Application options including readFile/writeFile callbacks.
 * @param semantic - Optional semantic analyzer used during structural validation.
 * @returns Map of file paths to their new content strings.
 * @throws If validation fails or required callbacks are missing.
 */
export async function applyWorkspaceEdits(
    workspace: WorkspaceEdit,
    options: ApplyWorkspaceEditOptions,
    semantic: PartialSemanticAnalyzer | null
): Promise<Map<string, string>> {
    const { dryRun = false, readFile, writeFile } = options;

    if (!workspace || !Core.isWorkspaceEditLike(workspace)) {
        throw new TypeError("applyWorkspaceEdit requires a WorkspaceEdit");
    }

    Core.assertFunction(readFile, "readFile", {
        errorMessage: "applyWorkspaceEdit requires a readFile function"
    });

    if (!dryRun) {
        Core.assertFunction(writeFile, "writeFile", {
            errorMessage: "applyWorkspaceEdit (when not in dry-run mode) requires a writeFile function"
        });
    }

    // Validate structural integrity before touching the filesystem.
    const validation = await validateWorkspaceEdit(workspace, semantic);
    if (!validation.valid) {
        throw new Error(`Cannot apply workspace edit: ${validation.errors.join("; ")}`);
    }

    const grouped = workspace.groupByFile();
    const results = new Map<string, string>();

    await Core.runSequentially(grouped.entries(), async ([filePath, edits]) => {
        const originalContent = await readFile(filePath);

        // Edits are sorted descending so applying from end-of-file preserves offsets.
        const newContent = applyEditsToContent(originalContent, edits);
        results.set(filePath, newContent);

        if (!dryRun) {
            await writeFile(filePath, newContent);
        }
    });

    const { metadataEdits, fileRenames } = getWorkspaceArrays(workspace);
    await Core.runSequentially(metadataEdits, async (metadataEdit) => {
        results.set(metadataEdit.path, metadataEdit.content);

        if (!dryRun) {
            await writeFile(metadataEdit.path, metadataEdit.content);
        }
    });

    // File renames are processed last to ensure all text edits complete first.
    if (!dryRun && fileRenames.length > 0) {
        const { renameFile } = options;
        if (typeof renameFile !== "function") {
            throw new TypeError("applyWorkspaceEdit requires a renameFile implementation to process file renames");
        }

        await Core.runSequentially(fileRenames, async (rename) => {
            await renameFile(rename.oldPath, rename.newPath);
        });
    }

    return results;
}
