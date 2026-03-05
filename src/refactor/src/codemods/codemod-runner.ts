/**
 * Project-wide codemod runner for the refactor engine.
 *
 * Applies a single-file codemod function across a list of project files,
 * collects the results into a structured report, and builds a WorkspaceEdit
 * that can be previewed or applied via `RefactorEngine.applyWorkspaceEdit`.
 *
 * This module bridges the gap between the single-file codemod functions (such
 * as `applyLoopLengthHoistingCodemod`) and the multi-file `WorkspaceEdit`
 * system used by the rest of the refactor engine. By going through a
 * WorkspaceEdit, callers gain access to dry-run support, overlap validation,
 * and the standard application pipeline.
 *
 * @example
 * import { applyLoopLengthHoistingCodemod } from "./loop-length-hoisting/index.js";
 *
 * const result = await runCodemodAcrossFiles(
 *     ["scripts/scr_player.gml", "scripts/scr_enemy.gml"],
 *     applyLoopLengthHoistingCodemod,
 *     fs.promises.readFile
 * );
 * console.log(`Changed ${result.summary.changed} of ${result.summary.total} files`);
 * await engine.applyWorkspaceEdit(result.workspace, { readFile, writeFile });
 */

import { Core } from "@gml-modules/core";

import type { WorkspaceReadFile } from "../types.js";
import { WorkspaceEdit } from "../workspace-edit.js";

/**
 * Minimal contract for a single-file codemod function.
 *
 * The function receives the full source text of one file and returns whether
 * the source was modified together with the (possibly unchanged) output text.
 * Throwing from inside the codemod is safe—the runner records the error and
 * continues with the remaining files.
 */
export type SingleFileCodemod = (sourceText: string) => {
    readonly changed: boolean;
    readonly outputText: string;
};

/**
 * High-level statistics produced by `runCodemodAcrossFiles`.
 */
export interface CodemodRunSummary {
    /** Total number of file paths that were submitted to the runner. */
    total: number;
    /** Number of files that were actually modified by the codemod. */
    changed: number;
    /** Number of files that were processed but left unchanged. */
    skipped: number;
    /** Number of files that could not be processed due to read or codemod errors. */
    failed: number;
}

/**
 * Result returned by `runCodemodAcrossFiles`.
 */
export interface CodemodRunnerResult {
    /**
     * WorkspaceEdit containing a full-file replacement edit for every file
     * that was modified. Each edit spans the entire original file
     * (`start: 0`, `end: originalContent.length`) so it can be applied
     * directly by `RefactorEngine.applyWorkspaceEdit` without additional
     * offset bookkeeping.
     */
    readonly workspace: WorkspaceEdit;
    /** Ordered list of file paths that were modified. */
    readonly changedFiles: ReadonlyArray<string>;
    /** Ordered list of file paths that were processed but not changed. */
    readonly skippedFiles: ReadonlyArray<string>;
    /**
     * Map of file paths to human-readable error messages for files that
     * could not be read or caused the codemod to throw. The runner always
     * completes the full batch—individual failures never abort remaining files.
     */
    readonly errors: ReadonlyMap<string, string>;
    /** Aggregate statistics for the run. */
    readonly summary: CodemodRunSummary;
}

/**
 * Applies a single-file codemod to every file in `filePaths` and collects
 * the results into a `WorkspaceEdit` that can be reviewed and applied.
 *
 * Processing is sequential so that the caller's `readFile` implementation
 * is never overwhelmed by a large number of concurrent I/O requests.
 * Individual file failures (read errors or codemod exceptions) are recorded
 * in `errors` and do not interrupt the rest of the batch.
 *
 * @param filePaths - Ordered list of GML file paths to process.
 * @param codemod - Single-file transformation function to apply to each file.
 * @param readFile - Async-capable function that returns the source text for a path.
 * @returns A structured result containing the workspace edit and run statistics.
 *
 * @throws {TypeError} When `filePaths` is not an array, `codemod` is not a
 *   function, or `readFile` is not a function.
 *
 * @example
 * const result = await runCodemodAcrossFiles(
 *     allGmlPaths,
 *     (src) => applyLoopLengthHoistingCodemod(src),
 *     async (p) => fs.promises.readFile(p, "utf8")
 * );
 *
 * if (result.summary.changed > 0) {
 *     // Apply changes via the existing applyWorkspaceEdit pipeline
 *     await engine.applyWorkspaceEdit(result.workspace, {
 *         readFile,
 *         writeFile,
 *     });
 * }
 */
export async function runCodemodAcrossFiles(
    filePaths: ReadonlyArray<string>,
    codemod: SingleFileCodemod,
    readFile: WorkspaceReadFile
): Promise<CodemodRunnerResult> {
    Core.assertArray(filePaths as Array<string>, {
        errorMessage: "runCodemodAcrossFiles requires an array of file paths"
    });

    if (typeof codemod !== "function") {
        throw new TypeError("runCodemodAcrossFiles requires a codemod function");
    }

    Core.assertFunction(readFile, "readFile", {
        errorMessage: "runCodemodAcrossFiles requires a readFile function"
    });

    const workspace = new WorkspaceEdit();
    const changedFiles: Array<string> = [];
    const skippedFiles: Array<string> = [];
    const errors = new Map<string, string>();

    await Core.runSequentially(filePaths, async (filePath) => {
        // Skip non-string or empty entries rather than throwing, because a
        // malformed path in a large batch should not abort all remaining work.
        if (!Core.isNonEmptyString(filePath)) {
            return;
        }

        let sourceText: string;
        try {
            sourceText = await readFile(filePath);
        } catch (error) {
            errors.set(filePath, Core.getErrorMessage(error));
            return;
        }

        let result: { changed: boolean; outputText: string };
        try {
            result = codemod(sourceText);
        } catch (error) {
            errors.set(filePath, Core.getErrorMessage(error));
            return;
        }

        if (!result.changed) {
            skippedFiles.push(filePath);
            return;
        }

        // Record a full-file replacement edit so the workspace can be applied
        // using the standard RefactorEngine.applyWorkspaceEdit pipeline.
        // Using [0, originalLength] as the range ensures that the edit covers
        // the entire file content regardless of what the codemod changed.
        workspace.addEdit(filePath, 0, sourceText.length, result.outputText);
        changedFiles.push(filePath);
    });

    const summary: CodemodRunSummary = {
        total: filePaths.length,
        changed: changedFiles.length,
        skipped: skippedFiles.length,
        failed: errors.size
    };

    return {
        workspace,
        changedFiles,
        skippedFiles,
        errors,
        summary
    };
}
