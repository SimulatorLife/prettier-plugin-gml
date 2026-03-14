import process from "node:process";

import { Command, Option } from "commander";

import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import type { CommanderCommandLike } from "../cli-core/commander-types.js";
import { discoverProjectRoot, resolveExistingGmloopConfigPath } from "../workflow/project-root.js";
import { runFormatCommand } from "./format.js";
import { runLintCommand } from "./lint.js";
import { executeRefactorCommand } from "./refactor.js";

type FixCommandOptions = {
    projectRoot?: string;
    config?: string;
    only?: string;
    verbose?: boolean;
};

type ValidatedFixCommandOptions = {
    projectRoot: string;
    configPath: string;
    only: string | undefined;
    verbose: boolean;
};

type StubCommandParameters = {
    args: Array<string>;
    options: Record<string, unknown>;
    helpText: string;
};

/**
 * Build the narrow command shape consumed by the existing command runners.
 */
function createStubCommand(parameters: StubCommandParameters): CommanderCommandLike {
    return {
        args: parameters.args,
        opts: () => parameters.options,
        helpInformation: () => parameters.helpText
    };
}

function normalizeFixProjectArgument(command: CommanderCommandLike): string | undefined {
    const projectArgument = Array.isArray(command.args) ? command.args[0] : undefined;
    return typeof projectArgument === "string" && projectArgument.length > 0 ? projectArgument : undefined;
}

async function validateFixCommandOptions(command: CommanderCommandLike): Promise<ValidatedFixCommandOptions> {
    const options = (command.opts() ?? {}) as FixCommandOptions;
    const projectArgument = normalizeFixProjectArgument(command);

    if (projectArgument && options.projectRoot) {
        throw new Error("Pass either a positional project path or --project-root, not both.");
    }

    const projectRoot = await discoverProjectRoot({
        explicitProjectPath: projectArgument ?? options.projectRoot,
        configPath: options.config
    });

    return {
        projectRoot,
        configPath: await resolveExistingGmloopConfigPath(projectRoot, options.config),
        only: options.only,
        verbose: options.verbose === true
    };
}

async function runWorkflowStage(parameters: {
    label: string;
    execute: () => Promise<void>;
    failureMessage: string;
}): Promise<void> {
    console.log(`\n[${parameters.label}]`);
    process.exitCode = 0;

    await parameters.execute();

    const stageExitCode = typeof process.exitCode === "number" ? process.exitCode : 0;
    process.exitCode = 0;
    if (stageExitCode !== 0) {
        throw new Error(parameters.failureMessage);
    }
}

function createRefactorStageCommand(options: ValidatedFixCommandOptions): CommanderCommandLike {
    return createStubCommand({
        args: ["codemod"],
        options: {
            projectRoot: options.projectRoot,
            config: options.configPath,
            write: true,
            only: options.only,
            list: false,
            verbose: options.verbose
        },
        helpText: "refactor codemod [paths...]"
    });
}

function createLintStageCommand(options: ValidatedFixCommandOptions): CommanderCommandLike {
    return createStubCommand({
        args: [options.projectRoot],
        options: {
            fix: true,
            formatter: "stylish",
            verbose: options.verbose,
            project: options.projectRoot,
            projectStrict: true,
            quiet: false,
            noDefaultConfig: false
        },
        helpText: "lint [paths...]"
    });
}

function createFormatStageCommand(options: ValidatedFixCommandOptions): CommanderCommandLike {
    return createStubCommand({
        args: [options.projectRoot],
        options: {
            verbose: options.verbose
        },
        helpText: "format [targetPath]"
    });
}

export function createFixCommand(): Command {
    return applyStandardCommandOptions(
        new Command("fix")
            .description("Run project codemods, lint fixes, and formatting in sequence")
            .argument("[projectPath]", "Project directory or .yyp path. Defaults to the current project.")
            .addOption(new Option("--project-root <path>", "Explicit GameMaker project root directory or .yyp path"))
            .addOption(new Option("--config <path>", "Path to gmloop.json for the refactor codemod stage"))
            .addOption(new Option("--only <ids>", "Comma-separated list of configured codemod ids to run"))
            .addOption(new Option("--verbose", "Enable verbose output with detailed diagnostics").default(false))
            .addHelpText("after", () =>
                [
                    "",
                    "Examples:",
                    "  pnpm dlx prettier-plugin-gml fix path/to/project",
                    "  pnpm dlx prettier-plugin-gml fix --only namingConvention",
                    ""
                ].join("\n")
            )
    );
}

/**
 * Run the project-wide fix workflow:
 * 1. configured refactor codemods
 * 2. lint with `--fix`
 * 3. formatting
 */
export async function runFixCommand(command: CommanderCommandLike): Promise<void> {
    const options = await validateFixCommandOptions(command);

    console.log(`Project root: ${options.projectRoot}`);

    await runWorkflowStage({
        label: "1/3 Refactor Codemods",
        execute: async () => {
            await executeRefactorCommand(createRefactorStageCommand(options));
        },
        failureMessage: "Refactor codemod stage failed."
    });

    await runWorkflowStage({
        label: "2/3 Lint Fixes",
        execute: async () => {
            await runLintCommand(createLintStageCommand(options));
        },
        failureMessage: "Lint fix stage reported unresolved diagnostics."
    });

    await runWorkflowStage({
        label: "3/3 Format",
        execute: async () => {
            await runFormatCommand(createFormatStageCommand(options));
        },
        failureMessage: "Format stage failed."
    });

    console.log("\nSuccess! Project codemods, lint fixes, and formatting completed.");
}
