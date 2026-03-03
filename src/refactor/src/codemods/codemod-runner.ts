/**
 * Codemod runner for applying single-file transforms across multiple project files.
 * Executes a codemod transform on each provided file and accumulates results
 * into a single WorkspaceEdit for review or application.
 *
 * This module follows the JSCodeshift / recast model: a codemod is a pure
 * function `(sourceText, options) => { changed, outputText }`, and the runner
 * handles all the multi-file orchestration, skipping, and workspace-edit
 * accumulation so individual codemods stay focused on single-file transforms.
 */

import { Core } from "@gml-modules/core";

import { WorkspaceEdit } from "../workspace-edit.js";

/**
 * Minimum contract for the result of a single-file codemod transform.
 *
 * Any codemod function that returns `{ changed, outputText }` (or a superset)
 * is compatible with the runner. The `changed` flag tells the runner whether
 * any modifications were made; `outputText` is the transformed source.
 */
export interface CodemodTransformResult {
    readonly changed: boolean;
    readonly outputText: string;
}

/**
 * A single-file codemod transform function.
 *
 * Receives the current source text of a file and a typed options object.
 * Must return a `CodemodTransformResult` describing whether the file was
 * modified and, when it was, the new source text to write.
 *
 * @template TOptions - Shape of the options forwarded by the runner.
 */
export type CodemodTransform<TOptions> = (sourceText: string, options: TOptions) => CodemodTransformResult;

/**
 * A source file supplied as input to the codemod runner.
 */
export interface CodemodFileInput {
    /** Relative or absolute path that identifies the file. */
    readonly path: string;
    /** Current text content of the file. */
    readonly content: string;
}

/**
 * Summary returned after running a codemod across multiple files.
 */
export interface RunCodemodResult {
    /** Paths of files where the codemod reported at least one change. */
    readonly changedFiles: ReadonlyArray<string>;
    /** Total number of file inputs that were processed (including unchanged). */
    readonly totalFilesProcessed: number;
    /**
     * WorkspaceEdit containing whole-file replacement edits for every changed
     * file. Apply with `RefactorEngine.applyWorkspaceEdit` or any compatible
     * workspace-edit consumer.
     */
    readonly workspace: WorkspaceEdit;
}

/**
 * Apply a single-file codemod transform across multiple files and collect the
 * results into a single `WorkspaceEdit`.
 *
 * Each file is processed independently. Files where the transform reports
 * `changed === true` are represented in the returned workspace as whole-file
 * replacement edits (`start: 0, end: content.length`). Files that are
 * unchanged are skipped. Files with an empty path or non-string content are
 * also skipped without error.
 *
 * The returned `WorkspaceEdit` is ready to pass to `applyWorkspaceEdit`.
 * Calling `runCodemod` does not write to disk or mutate any input.
 *
 * @param files     - Array of files to transform.
 * @param transform - Single-file codemod transform function.
 * @param options   - Options forwarded verbatim to every `transform` call.
 * @returns A frozen result object with changed-file list, processed count,
 *          and the accumulated workspace edit.
 *
 * @example
 * ```ts
 * const result = runCodemod(
 *     [{ path: "scripts/scr_player.gml", content: sourceText }],
 *     applyLoopLengthHoistingCodemod,
 *     {}
 * );
 * for (const file of result.changedFiles) {
 *     console.log(`Will modify: ${file}`);
 * }
 * ```
 */
export function runCodemod<TOptions>(
    files: ReadonlyArray<CodemodFileInput>,
    transform: CodemodTransform<TOptions>,
    options: TOptions
): RunCodemodResult {
    Core.assertArray(files as Array<CodemodFileInput>, {
        errorMessage: "runCodemod requires an array of file inputs"
    });

    if (typeof transform !== "function") {
        throw new TypeError("runCodemod requires a transform function");
    }

    const workspace = new WorkspaceEdit();
    const changedFiles: Array<string> = [];

    for (const file of files) {
        if (!file || typeof file.path !== "string" || file.path.length === 0) {
            continue;
        }

        if (typeof file.content !== "string") {
            continue;
        }

        const result = transform(file.content, options);

        if (!result || !result.changed) {
            continue;
        }

        // Represent the change as a whole-file replacement so the runner works
        // with any codemod regardless of whether it provides granular edits.
        // The consumer can choose to diff or apply the edit as needed.
        workspace.addEdit(file.path, 0, file.content.length, result.outputText);
        changedFiles.push(file.path);
    }

    return Object.freeze({
        changedFiles: Object.freeze(changedFiles),
        totalFilesProcessed: files.length,
        workspace
    });
}
