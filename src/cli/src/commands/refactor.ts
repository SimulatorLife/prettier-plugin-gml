/**
 * Refactor command for safe, project-wide code transformations.
 *
 * This command exposes the refactor engine through the CLI, enabling
 * safe renames and other transformations that preserve scope and semantics.
 * It integrates with the semantic analyzer and parser to plan edits that
 * avoid scope capture or shadowing.
 */

import path from "node:path";
import process from "node:process";

import { Core } from "@gml-modules/core";
import { Command, Option } from "commander";

import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import { formatCliError } from "../cli-core/errors.js";

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
        .addOption(new Option("--new-name <name>", "New name for the symbol"))
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
function performRename(options: ValidatedRefactorOptions): void {
    const { projectRoot, verbose, symbolId, oldName, newName, dryRun, checkHotReload } = options;

    if (verbose) {
        console.log(`\nInitializing refactor context for project: ${projectRoot}`);
        console.log("\nPreparing rename operation:");
        console.log(`  Symbol: ${symbolId ?? oldName}`);
        console.log(`  New name: ${newName}`);
        console.log(`  Dry run: ${dryRun ? "yes" : "no"}`);
        console.log(`  Hot reload check: ${checkHotReload ? "enabled" : "disabled"}`);
    }

    // For now, this is a placeholder implementation that demonstrates the command structure
    // A full implementation would:
    // 1. Initialize semantic analyzer and parse the project
    // 2. Build the refactor engine with semantic context
    // 3. Validate the rename request
    // 4. Plan the rename with conflict detection
    // 5. Apply edits to files or display dry-run results

    console.log("\nRefactor engine integration is planned for future implementation.");
    console.log("This command will use the refactor engine from @gml-modules/refactor to:");
    console.log("  • Validate rename requests");
    console.log("  • Detect scope conflicts");
    console.log("  • Plan safe edits across the project");
    console.log("  • Apply or preview transformations");

    if (verbose) {
        console.log("\nPlanned architecture:");
        console.log("  1. Initialize semantic analyzer with project context");
        console.log("  2. Parse all GML files to build scope graph");
        console.log("  3. Create RefactorEngine with semantic and parser facades");
        console.log("  4. Validate rename with conflict detection");
        console.log("  5. Plan WorkspaceEdit with file modifications");
        console.log("  6. Apply edits or display dry-run preview");
    }

    // Placeholder: report what would happen
    console.log(`\nWould rename '${symbolId ?? oldName}' to '${newName}'`);
    console.log(`Project root: ${projectRoot}`);

    if (dryRun) {
        console.log("\n[DRY RUN] No files were modified.");
    } else {
        console.log("\n[PLANNED] This operation is not yet implemented.");
        console.log("See src/refactor/README.md for the refactor engine API.");
    }
}

/**
 * Executes the refactor command.
 *
 * @param {RefactorCommandOptions} options - Command options
 */
export function runRefactorCommand(options: RefactorCommandOptions = {}): void {
    try {
        const validatedOptions = validateAndNarrowOptions(options);
        performRename(validatedOptions);
    } catch (error) {
        const message = Core.getErrorMessage(error, {
            fallback: "Unknown refactor error"
        });
        const formattedError = formatCliError(new Error(`Refactor failed: ${message}`));
        console.error(formattedError);
        process.exit(1);
    }
}
