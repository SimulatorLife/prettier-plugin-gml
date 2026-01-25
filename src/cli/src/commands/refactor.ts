/**
 * Refactor command for safe, project-wide code transformations.
 *
 * This command exposes the refactor engine through the CLI, enabling
 * safe renames and other transformations that preserve scope and semantics.
 * It integrates with the semantic analyzer and parser to plan edits that
 * avoid scope capture or shadowing.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Core } from "@gml-modules/core";
import { Refactor } from "@gml-modules/refactor";
import { Semantic } from "@gml-modules/semantic";
import { Command, Option } from "commander";

import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import { formatCliError } from "../cli-core/errors.js";
import { GmlParserBridge, GmlSemanticBridge, GmlTranspilerBridge } from "../modules/refactor/index.js";

const { buildProjectIndex } = Semantic;
const { RefactorEngine, generateRenamePreview, formatRenamePlanReport } = Refactor;

interface RefactorCommandOptions {
    symbolId?: string;
    oldName?: string;
    newName?: string;
    projectRoot?: string;
    dryRun?: boolean;
    verbose?: boolean;
    checkHotReload?: boolean;
}

/**
 * Options that have been validated and narrowed for the rename operation.
 */
interface ValidatedRefactorOptions extends RefactorContext {
    symbolId?: string;
    oldName?: string;
    newName: string;
    dryRun: boolean;
    checkHotReload: boolean;
}

interface RefactorContext {
    projectRoot: string;
    verbose: boolean;
}

/**
 * Creates the refactor command for safe code transformations.
 *
 * @returns {Command} Commander command instance
 */
export function createRefactorCommand(): Command {
    const command = applyStandardCommandOptions(new Command("refactor"));

    command
        .description("Perform safe, project-wide code transformations")
        .addOption(
            new Option("--symbol-id <id>", "SCIP-style symbol identifier to rename (e.g., gml/script/scr_player)")
        )
        .addOption(new Option("--old-name <name>", "Current name of the symbol to rename"))
        .addOption(new Option("--new-name <name>", "New name for the symbol").makeOptionMandatory())
        .addOption(
            new Option("--project-root <path>", "Root directory of the GameMaker project").default(
                process.cwd(),
                "current directory"
            )
        )
        .addOption(new Option("--dry-run", "Show what would be changed without modifying files").default(false))
        .addOption(new Option("--verbose", "Enable verbose output with detailed diagnostics").default(false))
        .addOption(
            new Option("--check-hot-reload", "Validate that the refactored code is compatible with hot reload").default(
                false
            )
        );

    return command;
}

/**
 * Validates refactor command options and ensures required parameters are provided.
 *
 * @param {RefactorCommandOptions} options - Raw command options from Commander
 * @returns {ValidatedRefactorOptions} Validated and narrowed options
 */
function validateAndNarrowOptions(options: RefactorCommandOptions): ValidatedRefactorOptions {
    if (!options.newName) {
        throw new Error("--new-name is required");
    }

    if (!options.symbolId && !options.oldName) {
        throw new Error("Either --symbol-id or --old-name must be provided");
    }

    if (options.symbolId && options.oldName) {
        throw new Error("Only one of --symbol-id or --old-name should be provided, not both");
    }

    const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
    const verbose = options.verbose ?? false;

    return {
        projectRoot,
        verbose,
        symbolId: options.symbolId,
        oldName: options.oldName,
        newName: options.newName,
        dryRun: Boolean(options.dryRun),
        checkHotReload: Boolean(options.checkHotReload)
    };
}

/**
 * Performs a symbol rename operation using the refactor engine.
 *
 * @param {ValidatedRefactorOptions} options - Validated refactor options
 */
async function performRename(options: ValidatedRefactorOptions): Promise<void> {
    const { projectRoot, verbose, symbolId, oldName, newName, dryRun, checkHotReload } = options;

    if (verbose) {
        console.log(`\nInitializing refactor context for project: ${projectRoot}`);
    }

    try {
        // 1. Initialize semantic analyzer and parse the project
        const projectIndex = await buildProjectIndex(projectRoot, undefined, {
            logger: verbose ? console : undefined
        });

        // 2. Build the refactor engine with semantic context
        const semantic = new GmlSemanticBridge(projectIndex);
        const parser = new GmlParserBridge();
        const formatter = new GmlTranspilerBridge();

        const engine = new RefactorEngine({
            semantic,
            parser,
            formatter
        });

        // 3. Resolve target symbol if needed
        let targetSymbolId = symbolId;
        if (!targetSymbolId && oldName) {
            if (verbose) console.log(`Searching for symbol matching name: ${oldName}`);
            const occurrences = await engine.gatherSymbolOccurrences(oldName);

            // For now, we take the first symbol ID we find
            // In a better tool, we'd prompt if there are multiple
            const firstOcc = occurrences[0];
            if (!firstOcc) {
                throw new Error(`Could not find any symbol named '${oldName}'`);
            }

            // Heuristic to get symbol ID from occurrences
            // We'll rely on the semantic bridge to have annotated this if possible
            // but for now we'll assume it's a script if no ID is found
            targetSymbolId = `gml/script/${oldName}`;
            if (verbose) console.log(`Inferred symbol ID: ${targetSymbolId}`);
        }

        if (!targetSymbolId) {
            throw new Error("Could not resolve target symbol ID");
        }

        // 4. Plan the rename with conflict detection
        if (verbose) console.log(`Planning rename: ${targetSymbolId} → ${newName}`);

        const plan = await engine.prepareRenamePlan(
            {
                symbolId: targetSymbolId,
                newName
            },
            {
                validateHotReload: checkHotReload
            }
        );

        // 5. Display results (report/preview)
        console.log(`\n${formatRenamePlanReport(plan)}`);

        if (verbose) {
            const preview = generateRenamePreview(plan.workspace, plan.analysis.summary.oldName, newName);
            console.log("\nDetailed File Changes:");
            for (const file of preview.files) {
                console.log(`  ${file.filePath}: ${file.editCount} edits`);
            }
        }

        if (!plan.validation.valid) {
            console.log("\nRename validation failed. Aborting.");
            return;
        }

        // 6. Apply edits if not dry-run
        if (dryRun) {
            console.log("\n[DRY RUN] No files were modified.");
        } else {
            console.log("\nApplying changes...");
            await engine.applyWorkspaceEdit(plan.workspace, {
                readFile: (p) => readFile(p, "utf8"),
                writeFile: (p, c) => writeFile(p, c, "utf8")
            });
            console.log("Success! All files updated.");
        }
    } catch (error) {
        throw new Error(`Refactor operation failed: ${Core.getErrorMessage(error)}`);
    }
}

/**
 * Executes the refactor command.
 *
 * @param {RefactorCommandOptions} options - Command options
 */
export async function runRefactorCommand(options: RefactorCommandOptions = {}): Promise<void> {
    try {
        const validatedOptions = validateAndNarrowOptions(options);
        await performRename(validatedOptions);
    } catch (error) {
        const message = Core.getErrorMessage(error, {
            fallback: "Unknown refactor error"
        });
        const formattedError = formatCliError(new Error(`Refactor failed: ${message}`));
        console.error(formattedError);
        process.exit(1);
    }
}
