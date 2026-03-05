/**
 * Generic codemod runner for applying single-file transforms across a project.
 *
 * Provides `runCodemodAcrossFiles`, which accepts any `SingleFileCodemod`
 * and executes it against a list of file paths, accumulating changed files
 * into a `WorkspaceEdit` and producing a structured `CodemodRunnerResult`
 * summary. Write-back to disk is opt-in via the `writeFile` option.
 */

import type { WorkspaceReadFile, WorkspaceWriteFile } from "../types.js";
import { WorkspaceEdit } from "../workspace-edit.js";

/**
 * Minimal contract for the per-file result returned by a {@link SingleFileCodemod}.
 *
 * The runner uses `changed` to decide whether to include the file in the
 * workspace edit, and `outputText` as the replacement content.
 */
export interface CodemodFileResult {
    /** Whether the codemod produced any changes for this file. */
    changed: boolean;
    /** The transformed source text (identical to the input when `changed` is false). */
    outputText: string;
}

/**
 * A transform function applied to one file at a time.
 *
 * Modelled after JSCodeshift's codemod signature so that the runner is
 * generic over both the options type and the richer result type each
 * codemod may return (e.g., `LoopLengthHoistingCodemodResult`).
 *
 * @typeParam TOptions - Codemod-specific configuration.
 * @typeParam TResult - Structured result; must include `changed` and `outputText`.
 *
 * @param sourceText - Current content of the file.
 * @param filePath - Absolute (or project-relative) path to the file being processed.
 * @param options - Codemod configuration forwarded from `RunCodemodOptions`.
 * @returns Transformed result for the file.
 */
export type SingleFileCodemod<TOptions, TResult extends CodemodFileResult> = (
    sourceText: string,
    filePath: string,
    options: TOptions
) => TResult;

/**
 * Per-run statistics returned alongside the `WorkspaceEdit`.
 */
export interface CodemodRunnerResult {
    /** Number of files where the codemod was successfully executed. */
    processedFiles: number;
    /** Number of files where the codemod produced at least one change. */
    changedFiles: number;
    /**
     * Number of files skipped due to read errors or codemod exceptions.
     * Skipped files are never included in the `WorkspaceEdit`.
     */
    skippedFiles: number;
    /**
     * Map from file path to a human-readable error message for every file
     * that could not be processed. Empty when no errors occurred.
     */
    errors: Map<string, string>;
}

/**
 * Options forwarded to {@link runCodemodAcrossFiles}.
 *
 * @typeParam TOptions - Codemod-specific configuration type.
 */
export interface RunCodemodOptions<TOptions> {
    /** Codemod-specific configuration forwarded to each {@link SingleFileCodemod} call. */
    codemodOptions: TOptions;
    /**
     * Optional write function. When provided and `dryRun` is not `true`,
     * changed files are written back to disk after all codemods complete.
     */
    writeFile?: WorkspaceWriteFile;
    /**
     * When `true`, the runner still populates the returned `WorkspaceEdit` with
     * all changes but never calls `writeFile`. Useful for previewing the impact
     * of a codemod before committing.
     *
     * @default false
     */
    dryRun?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type FileReadOk = { kind: "read-ok"; filePath: string; sourceText: string };
type FileReadError = { kind: "read-error"; filePath: string; message: string };
type FileReadOutcome = FileReadOk | FileReadError;

async function readOneFile(filePath: string, readFile: WorkspaceReadFile): Promise<FileReadOutcome> {
    try {
        const sourceText = await readFile(filePath);
        return { kind: "read-ok", filePath, sourceText };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { kind: "read-error", filePath, message: `Failed to read file: ${message}` };
    }
}

type CodemodOk<TResult> = { kind: "codemod-ok"; filePath: string; sourceText: string; result: TResult };
type CodemodError = { kind: "codemod-error"; filePath: string; message: string };
type CodemodOutcome<TResult> = CodemodOk<TResult> | CodemodError;

function runOneCodemod<TOptions, TResult extends CodemodFileResult>(
    readOutcome: FileReadOk,
    codemod: SingleFileCodemod<TOptions, TResult>,
    codemodOptions: TOptions
): CodemodOutcome<TResult> {
    try {
        const result = codemod(readOutcome.sourceText, readOutcome.filePath, codemodOptions);
        return { kind: "codemod-ok", filePath: readOutcome.filePath, sourceText: readOutcome.sourceText, result };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { kind: "codemod-error", filePath: readOutcome.filePath, message: `Codemod error: ${message}` };
    }
}

async function writeChangedFiles(
    toWrite: ReadonlyArray<{ filePath: string; content: string }>,
    writeFile: WorkspaceWriteFile,
    errors: Map<string, string>
): Promise<void> {
    const settled = await Promise.allSettled(
        toWrite.map(({ filePath, content }) => Promise.resolve(writeFile(filePath, content)))
    );

    for (const [i, element] of settled.entries()) {
        const outcome = element;
        if (outcome.status === "rejected") {
            const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
            errors.set(toWrite[i]?.filePath ?? "", `Failed to write file: ${message}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply a single-file codemod across a set of files.
 *
 * All files are read and transformed in parallel. When `options.writeFile` is
 * provided and `options.dryRun` is not `true`, changed files are written back
 * to disk concurrently after all codemods have run.
 *
 * Files that fail at the read or codemod stage are recorded in
 * `summary.errors` and counted in `summary.skippedFiles`; they are
 * never included in the workspace edit.
 *
 * @param filePaths - Ordered list of file paths to process.
 * @param codemod - Transform applied to each file.
 * @param readFile - Async-capable file reader.
 * @param options - Runner options including codemod config and optional write-back.
 * @returns Workspace edit, per-file results, and run summary.
 *
 * @example
 * ```ts
 * import { applyLoopLengthHoistingCodemod } from "./loop-length-hoisting/index.js";
 * import { runCodemodAcrossFiles } from "./codemod-runner.js";
 * import { readFile } from "node:fs/promises";
 *
 * const { workspace, summary } = await runCodemodAcrossFiles(
 *   ["scripts/scr_player.gml", "scripts/scr_enemy.gml"],
 *   (sourceText, _filePath, opts) => applyLoopLengthHoistingCodemod(sourceText, opts),
 *   (path) => readFile(path, "utf8"),
 *   { codemodOptions: {} }
 * );
 *
 * console.log(`Changed ${summary.changedFiles} of ${summary.processedFiles} files`);
 * ```
 */
export async function runCodemodAcrossFiles<TOptions, TResult extends CodemodFileResult>(
    filePaths: ReadonlyArray<string>,
    codemod: SingleFileCodemod<TOptions, TResult>,
    readFile: WorkspaceReadFile,
    options: RunCodemodOptions<TOptions>
): Promise<{
    workspace: WorkspaceEdit;
    results: Map<string, TResult>;
    summary: CodemodRunnerResult;
}> {
    // Read all files concurrently so I/O latency does not compound.
    const readOutcomes = await Promise.all(filePaths.map((fp) => readOneFile(fp, readFile)));

    const workspace = new WorkspaceEdit();
    const results = new Map<string, TResult>();
    const errors = new Map<string, string>();
    const toWrite: Array<{ filePath: string; content: string }> = [];
    let changedFiles = 0;
    let skippedFiles = 0;

    for (const readOutcome of readOutcomes) {
        if (readOutcome.kind === "read-error") {
            errors.set(readOutcome.filePath, readOutcome.message);
            skippedFiles++;
            continue;
        }

        const codemodOutcome = runOneCodemod(readOutcome, codemod, options.codemodOptions);

        if (codemodOutcome.kind === "codemod-error") {
            errors.set(codemodOutcome.filePath, codemodOutcome.message);
            skippedFiles++;
            continue;
        }

        const { filePath, sourceText, result } = codemodOutcome;
        results.set(filePath, result);

        if (!result.changed) {
            continue;
        }

        changedFiles++;
        workspace.addEdit(filePath, 0, sourceText.length, result.outputText);

        if (options.writeFile && !options.dryRun) {
            toWrite.push({ filePath, content: result.outputText });
        }
    }

    if (toWrite.length > 0 && options.writeFile) {
        await writeChangedFiles(toWrite, options.writeFile, errors);
    }

    const summary: CodemodRunnerResult = {
        processedFiles: filePaths.length - skippedFiles,
        changedFiles,
        skippedFiles,
        errors
    };

    return { workspace, results, summary };
}
