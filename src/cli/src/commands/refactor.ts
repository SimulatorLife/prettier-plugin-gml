/**
 * Refactor command for safe, project-wide code transformations.
 *
 * This command exposes the refactor engine through the CLI, enabling
 * safe renames and project-configured codemod execution.
 */

import { lstat, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Core } from "@gmloop/core";
import { Refactor } from "@gmloop/refactor";
import { Semantic } from "@gmloop/semantic";
import { Command, Option } from "commander";

import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import type { CommanderCommandLike } from "../cli-core/commander-types.js";
import { CliUsageError, isCliUsageError } from "../cli-core/errors.js";
import { createApplyFixesOption, createProjectPathOption } from "../cli-core/shared-command-options.js";
import { GmlParserBridge, GmlSemanticBridge, GmlTranspilerBridge } from "../modules/refactor/index.js";
import { discoverProjectRoot, resolveExistingGmloopConfigPath } from "../workflow/project-root.js";
import { resolveIndexedRootTargetGmlFiles } from "./refactor-target-gml-files.js";

const { buildProjectIndex } = Semantic;
const {
    RefactorEngine,
    formatRenamePlanReport,
    generateRenamePreview,
    listConfiguredCodemods,
    listRegisteredCodemods,
    normalizeRefactorProjectConfig
} = Refactor;
type RegisteredCodemodId = ReturnType<typeof listRegisteredCodemods>[number]["id"];
type LoadedGmloopProjectConfig = Awaited<ReturnType<typeof Core.loadGmloopProjectConfig>> & {
    refactor?: ReturnType<typeof normalizeRefactorProjectConfig>;
};

type RefactorCommandOptions = {
    symbolId?: string;
    oldName?: string;
    newName?: string;
    project?: string;
    config?: string;
    dryRun?: boolean;
    fix?: boolean;
    only?: string;
    list?: boolean;
    verbose?: boolean;
    checkHotReload?: boolean;
};

type RefactorContext = {
    projectRoot: string;
    verbose: boolean;
};

type ValidatedRenameOptions = RefactorContext & {
    symbolId?: string;
    oldName?: string;
    newName: string;
    dryRun: boolean;
    checkHotReload: boolean;
};

type ValidatedCodemodOptions = RefactorContext & {
    configPath: string;
    dryRun: boolean;
    onlyCodemods: Array<RegisteredCodemodId>;
    list: boolean;
    targetPaths: Array<string>;
};

type RefactorCommandIntent =
    | {
          mode: "rename";
          options: ValidatedRenameOptions;
      }
    | {
          mode: "codemod";
          options: ValidatedCodemodOptions;
      };

function normalizeRequestedCodemods(onlyOption: string | undefined): Array<RegisteredCodemodId> {
    if (!onlyOption) {
        return [];
    }

    const requestedIds = Core.normalizeStringList(onlyOption, {
        splitPattern: Core.createListSplitPattern([","]),
        errorMessage: "--only must be a comma-separated list of codemod ids"
    });
    const validCodemodIds = new Set(listRegisteredCodemods().map((codemod) => codemod.id));

    return requestedIds.map((requestedId) => {
        if (!validCodemodIds.has(requestedId as RegisteredCodemodId)) {
            throw new Error(`Unknown codemod '${requestedId}'. Valid codemods: ${[...validCodemodIds].join(", ")}`);
        }

        return requestedId as RegisteredCodemodId;
    });
}

function resolveDiscoveredProjectRoot(
    projectRootOption: string | undefined,
    configPathOption: string | undefined
): Promise<string> {
    return discoverProjectRoot({
        explicitProjectPath: projectRootOption,
        configPath: configPathOption
    });
}

function resolveCodemodConfigPath(projectRoot: string, configPathOption: string | undefined): Promise<string> {
    return resolveExistingGmloopConfigPath(projectRoot, configPathOption);
}

function hasExplicitRenameIntent(options: RefactorCommandOptions): boolean {
    return Boolean(options.symbolId || options.oldName || options.newName || options.checkHotReload);
}

function hasExplicitCodemodIntentHint(options: RefactorCommandOptions): boolean {
    return Boolean(options.project || options.config || options.fix || options.only || options.list);
}

function validateRenameOptions(options: RefactorCommandOptions): ValidatedRenameOptions {
    if (!options.newName) {
        throw new Error("--new-name is required");
    }

    if (!options.symbolId && !options.oldName) {
        throw new Error("Either --symbol-id or --old-name must be provided");
    }

    if (options.symbolId && options.oldName) {
        throw new Error("Only one of --symbol-id or --old-name should be provided, not both");
    }

    return {
        projectRoot: path.resolve(options.project ?? process.cwd()),
        verbose: Boolean(options.verbose),
        symbolId: options.symbolId,
        oldName: options.oldName,
        newName: options.newName,
        dryRun: Boolean(options.dryRun),
        checkHotReload: Boolean(options.checkHotReload)
    };
}

async function validateCodemodOptions(
    options: RefactorCommandOptions,
    pathArguments: Array<string>
): Promise<ValidatedCodemodOptions> {
    const projectRoot = await resolveDiscoveredProjectRoot(options.project, options.config);
    const targetPaths = pathArguments.length === 0 ? [projectRoot] : pathArguments.map((entry) => path.resolve(entry));

    return {
        projectRoot,
        verbose: Boolean(options.verbose),
        configPath: await resolveCodemodConfigPath(projectRoot, options.config),
        dryRun: !options.fix,
        onlyCodemods: normalizeRequestedCodemods(options.only),
        list: Boolean(options.list),
        targetPaths
    };
}

async function validateRefactorIntent(command: CommanderCommandLike): Promise<RefactorCommandIntent> {
    const options = command.opts() as RefactorCommandOptions;
    const [operation, ...remainingArgs] = command.args;

    if (operation === "codemod") {
        return {
            mode: "codemod",
            options: await validateCodemodOptions(options, remainingArgs)
        };
    }

    if (operation !== undefined) {
        throw new Error(`Unknown refactor operation '${operation}'. Supported operations: codemod`);
    }

    if (hasExplicitRenameIntent(options)) {
        return {
            mode: "rename",
            options: validateRenameOptions(options)
        };
    }

    if (hasExplicitCodemodIntentHint(options)) {
        return {
            mode: "codemod",
            options: await validateCodemodOptions(options, remainingArgs)
        };
    }

    const inferredCodemodOptions = await validateCodemodOptions(options, remainingArgs).catch(() => null);
    if (inferredCodemodOptions) {
        return {
            mode: "codemod",
            options: inferredCodemodOptions
        };
    }

    throw new CliUsageError(
        "Could not infer refactor mode. Provide --old-name/--symbol-id with --new-name for renames, or run inside a project with gmloop.json to execute configured codemods."
    );
}

async function collectGmlFilesFromTarget(
    projectRoot: string,
    absoluteTargetPath: string,
    collectedFiles: Set<string>
): Promise<void> {
    const stats = await lstat(absoluteTargetPath);
    if (stats.isDirectory()) {
        const entries = await readdir(absoluteTargetPath, {
            withFileTypes: true
        });
        await Core.runSequentially(entries, async (entry) => {
            await collectGmlFilesFromTarget(projectRoot, path.join(absoluteTargetPath, entry.name), collectedFiles);
        });
        return;
    }

    if (
        !stats.isFile() ||
        (path.extname(absoluteTargetPath).toLowerCase() !== ".gml" &&
            path.extname(absoluteTargetPath).toLowerCase() !== ".yy")
    ) {
        return;
    }

    collectedFiles.add(path.relative(projectRoot, absoluteTargetPath));
}

async function collectTargetGmlFiles(projectRoot: string, targetPaths: Array<string>): Promise<Array<string>> {
    const collectedFiles = new Set<string>();
    await Core.runSequentially(targetPaths, async (targetPath) => {
        await collectGmlFilesFromTarget(projectRoot, targetPath, collectedFiles);
    });
    return [...collectedFiles].sort();
}

function createRefactorEngineForProject(
    projectIndex: unknown,
    projectRoot: string
): InstanceType<typeof RefactorEngine> {
    const semantic = new GmlSemanticBridge(projectIndex, projectRoot);
    const parser = new GmlParserBridge();
    const formatter = new GmlTranspilerBridge();

    return new RefactorEngine({
        semantic,
        parser,
        formatter
    });
}

async function performRename(options: ValidatedRenameOptions): Promise<void> {
    const { projectRoot, verbose, symbolId, oldName, newName, dryRun, checkHotReload } = options;

    if (verbose) {
        console.log(`\nInitializing refactor context for project: ${projectRoot}`);
    }

    let targetSymbolId = symbolId;

    try {
        const projectIndex = await buildProjectIndex(projectRoot, undefined, {
            logger: verbose ? console : undefined
        });
        const engine = createRefactorEngineForProject(projectIndex, projectRoot);
        const semantic = engine.semantic as GmlSemanticBridge;

        if (!targetSymbolId && oldName) {
            if (verbose) {
                console.log(`Searching for symbol matching name: ${oldName}`);
            }

            const resolvedId = semantic.resolveSymbolId(oldName);
            if (resolvedId) {
                targetSymbolId = resolvedId;
                if (verbose) {
                    console.log(`Resolved symbol ID: ${targetSymbolId}`);
                }
            } else {
                const occurrences = await engine.gatherSymbolOccurrences(oldName);
                if (occurrences.length === 0) {
                    throw new Error(`Could not find any symbol named '${oldName}'`);
                }

                targetSymbolId = `gml/script/${oldName}`;
                if (verbose) {
                    console.log(`Warning: resolveSymbolId failed but found ${occurrences.length} occurrences.`);
                    console.log(`Using fallback identifier: ${targetSymbolId}`);
                }
            }
        }

        if (!targetSymbolId) {
            throw new Error("Could not resolve target symbol ID");
        }

        if (verbose) {
            console.log(`Planning rename: ${targetSymbolId} → ${newName}`);
        }

        const plan = await engine.prepareRenamePlan(
            {
                symbolId: targetSymbolId,
                newName
            },
            {
                validateHotReload: checkHotReload
            }
        );

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

        if (dryRun) {
            console.log("\n[DRY RUN] No files were modified.");
            return;
        }

        console.log("\nApplying changes...");
        const resolvePath = (filePath: string) => path.resolve(projectRoot, filePath);
        await engine.applyWorkspaceEdit(plan.workspace, {
            readFile: (filePath) => readFile(resolvePath(filePath), "utf8"),
            writeFile: (filePath, content) => writeFile(resolvePath(filePath), content, "utf8"),
            renameFile: (oldPath, newPath) => rename(resolvePath(oldPath), resolvePath(newPath))
        });
        console.log("Success! All files updated.");
    } catch (error) {
        let message = Core.getErrorMessage(error);
        if (message.includes("not found in semantic index")) {
            message =
                `Symbol '${targetSymbolId || oldName}' was not found in the semantic index. ` +
                `This usually means the symbol is not defined in the project or is a built-in symbol that cannot be renamed.\n` +
                `Check that the symbol name is correct (including case) and that it refers to a user-defined resource (Script, Macro, Variable, etc.).`;
        }

        throw new Error(`Refactor operation failed: ${message}`);
    }
}

function formatCodemodSelectionSummary(
    config: LoadedGmloopProjectConfig,
    selectedCodemods: Array<RegisteredCodemodId>
) {
    return listConfiguredCodemods(config.refactor ?? {}, selectedCodemods).map((codemod) => {
        const stateLabel = codemod.configured ? "configured" : "not configured";
        const selectionLabel = codemod.selected ? "selected" : "filtered out";
        const configLabel = codemod.effectiveConfig === null ? "n/a" : JSON.stringify(codemod.effectiveConfig, null, 2);

        return [
            `${codemod.id}: ${stateLabel}, ${selectionLabel}`,
            `  Description: ${codemod.description}`,
            `  Effective config: ${configLabel}`
        ].join("\n");
    });
}

async function performConfiguredCodemods(options: ValidatedCodemodOptions): Promise<void> {
    const { projectRoot, verbose, configPath, targetPaths, dryRun, onlyCodemods, list } = options;

    if (verbose) {
        console.log(`\nInitializing refactor codemod context for project: ${projectRoot}`);
        console.log(`Loading gmloop config from: ${configPath}`);
    }

    const rawConfig = await Core.loadGmloopProjectConfig(configPath);
    const config: LoadedGmloopProjectConfig = Object.freeze({
        ...rawConfig,
        refactor: normalizeRefactorProjectConfig(rawConfig.refactor)
    });
    const selectedCodemodLines = formatCodemodSelectionSummary(config, onlyCodemods);

    if (list) {
        console.log(`Project root: ${projectRoot}`);
        console.log(`Config path: ${configPath}`);
        for (const line of selectedCodemodLines) {
            console.log(line);
        }
        return;
    }

    const projectIndex = await buildProjectIndex(projectRoot, undefined, {
        logger: verbose ? console : undefined
    });
    const engine = createRefactorEngineForProject(projectIndex, projectRoot);
    const indexedRootTargetGmlFiles = resolveIndexedRootTargetGmlFiles(projectRoot, targetPaths, projectIndex);
    const gmlFilePaths = indexedRootTargetGmlFiles ?? (await collectTargetGmlFiles(projectRoot, targetPaths));
    const selectedCodemodIds = listConfiguredCodemods(config.refactor ?? {}, onlyCodemods)
        .filter((codemod) => codemod.configured && codemod.selected)
        .map((codemod) => codemod.id);

    if (selectedCodemodIds.length === 0) {
        console.log("No configured codemods were selected. Nothing to do.");
        return;
    }

    if (verbose) {
        console.log(`Selected codemods: ${selectedCodemodIds.join(", ")}`);
        console.log(`Selected GML files: ${gmlFilePaths.length}`);
    }

    const finalSelectedCodemodId = selectedCodemodIds.at(-1) ?? null;
    const resolvePath = (filePath: string) => path.resolve(projectRoot, filePath);
    const result = await engine.executeConfiguredCodemods({
        projectRoot,
        targetPaths,
        gmlFilePaths,
        config: config.refactor ?? {},
        readFile: (filePath) => readFile(resolvePath(filePath), "utf8"),
        writeFile: (filePath, content) => writeFile(resolvePath(filePath), content, "utf8"),
        renameFile: (oldPath, newPath) => rename(resolvePath(oldPath), resolvePath(newPath)),
        dryRun,
        onlyCodemods: selectedCodemodIds,
        onAfterCodemod: async (summary, context) => {
            if (!summary.changed || summary.id === finalSelectedCodemodId) {
                return;
            }
            if (verbose) {
                console.log(`Rebuilding project index after codemod ${summary.id}...`);
            }
            const updatedProjectIndex = await buildProjectIndex(
                projectRoot,
                {
                    ...Semantic.defaultFsFacade,
                    readFile: async (filePath) => {
                        const content = await context.readFile(filePath);
                        return content ?? (await readFile(resolvePath(filePath), "utf8"));
                    }
                },
                {
                    logger: verbose ? console : undefined
                }
            );

            // Access the underlying GmlSemanticBridge and update it directly
            const semanticBridge = engine.semantic as any;
            if (semanticBridge && typeof semanticBridge.updateProjectIndex === "function") {
                semanticBridge.updateProjectIndex(updatedProjectIndex);
            }
        }
    });

    let encounteredErrors = false;
    for (const summary of result.summaries) {
        console.log(`\n[${summary.id}] ${summary.changed ? "changed" : "no changes"}`);
        if (summary.changedFiles.length > 0) {
            console.log(`Changed files: ${summary.changedFiles.length}`);
        }
        for (const warning of summary.warnings) {
            console.log(`Warning: ${warning}`);
        }
        for (const error of summary.errors) {
            encounteredErrors = true;
            console.log(`Error: ${error}`);
        }
    }

    if (encounteredErrors) {
        throw new Error("Configured codemod execution reported one or more errors.");
    }

    if (dryRun) {
        console.log("\n[DRY RUN] No files were modified.");
    } else {
        console.log("\nSuccess! Configured codemods applied.");
    }
}

export function createRefactorCommand(): Command {
    const command = applyStandardCommandOptions(new Command("refactor"));

    command
        .description("Perform safe, project-wide code transformations")
        .argument("[operation]", 'Optional refactor operation, currently "codemod"')
        .argument("[paths...]", "Optional target paths used by refactor codemod execution")
        .addOption(
            new Option(
                "--symbol-id <id>",
                "Exact SCIP-style identifier (e.g., gml/script/my_func, gml/macro/MY_MACRO, gml/var/my_global)"
            )
        )
        .addOption(
            new Option(
                "--old-name <name>",
                "Search for a symbol by its base name. The tool will try to find the correct kind (script, macro, etc.) automatically."
            )
        )
        .addOption(new Option("--new-name <name>", "New name for the symbol"))
        .addOption(createProjectPathOption())
        .addOption(new Option("--config <path>", "Path to gmloop.json for configured codemod execution"))
        .addOption(new Option("--dry-run", "Show what would be changed without modifying files").default(false))
        .addOption(createApplyFixesOption())
        .addOption(new Option("--only <ids>", "Comma-separated list of configured codemod ids to run"))
        .addOption(new Option("--list", "List configured codemods and exit").default(false))
        .addOption(new Option("--verbose", "Enable verbose output with detailed diagnostics").default(false))
        .addOption(
            new Option("--check-hot-reload", "Validate that the refactored code is compatible with hot reload").default(
                false
            )
        )
        .addHelpText(
            "after",
            [
                "",
                "Examples:",
                "  pnpm dlx prettier-plugin-gml refactor --old-name my_script --new-name my_renamed_script path/to/project",
                "  pnpm dlx prettier-plugin-gml refactor --symbol-id gml/script/my_func --new-name my_func_v2 --dry-run",
                "  pnpm dlx prettier-plugin-gml refactor codemod --list",
                "  pnpm dlx prettier-plugin-gml refactor codemod --fix path/to/project"
            ].join("\n")
        );

    return command;
}

/**
 * Execute a refactor command intent without installing the CLI-level error
 * wrapper. Composite workflows use this to compose refactor operations with
 * other stages while preserving one shared implementation.
 */
export async function executeRefactorCommand(command: CommanderCommandLike): Promise<void> {
    const intent = await validateRefactorIntent(command);
    await (intent.mode === "codemod" ? performConfiguredCodemods(intent.options) : performRename(intent.options));
}

/**
 * Wrap a caught error as a {@link CliUsageError} so that the outer CLI error
 * handler renders it without a stack trace and appends the command's usage
 * guidance. Already-branded {@link CliUsageError} instances are re-thrown
 * unchanged; all other errors are wrapped with the usage text attached.
 */
export async function runRefactorCommand(command: CommanderCommandLike): Promise<void> {
    try {
        await executeRefactorCommand(command);
    } catch (error) {
        if (isCliUsageError(error)) {
            // Attach the command's help text if the usage error was thrown without it
            // (e.g. from deep inside validateRefactorIntent which has no command reference).
            if (!error.usage) {
                error.usage = command.helpInformation();
            }

            throw error;
        }

        const message = Core.getErrorMessage(error, { fallback: "Unknown refactor error" });
        const usage = command.helpInformation();
        throw new CliUsageError(`Refactor failed: ${message}`, { usage });
    }
}
