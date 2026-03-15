import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { Command, Option } from "commander";

import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import type { CommanderCommandLike } from "../cli-core/commander-types.js";
import { SKIP_CLI_RUN_ENV_VAR } from "../shared/skip-cli-run.js";
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

type MemorySnapshot = {
    rss: number;
    heapUsed: number;
    heapTotal: number;
};

function takeMemorySnapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    return {
        rss: usage.rss,
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal
    };
}

function formatMegabytes(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function logStageTelemetry(parameters: {
    label: string;
    durationMs: number;
    startMemory: MemorySnapshot;
    endMemory: MemorySnapshot;
    highWaterMemory: MemorySnapshot;
}): void {
    const { label, durationMs, startMemory, endMemory, highWaterMemory } = parameters;
    console.log(
        [
            `[telemetry] ${label}`,
            `duration=${durationMs.toFixed(1)}ms`,
            `rss(start/end/max)=${formatMegabytes(startMemory.rss)}/${formatMegabytes(endMemory.rss)}/${formatMegabytes(highWaterMemory.rss)}`,
            `heapUsed(start/end/max)=${formatMegabytes(startMemory.heapUsed)}/${formatMegabytes(endMemory.heapUsed)}/${formatMegabytes(highWaterMemory.heapUsed)}`
        ].join(" ")
    );
}

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
    const startTime = process.hrtime.bigint();
    const startMemory = takeMemorySnapshot();
    let highWaterMemory = startMemory;
    const intervalHandle = setInterval(() => {
        const sample = takeMemorySnapshot();
        highWaterMemory = {
            rss: Math.max(highWaterMemory.rss, sample.rss),
            heapUsed: Math.max(highWaterMemory.heapUsed, sample.heapUsed),
            heapTotal: Math.max(highWaterMemory.heapTotal, sample.heapTotal)
        };
    }, 250);
    intervalHandle.unref();

    process.exitCode = 0;

    try {
        await parameters.execute();
    } finally {
        clearInterval(intervalHandle);
        const endMemory = takeMemorySnapshot();
        highWaterMemory = {
            rss: Math.max(highWaterMemory.rss, endMemory.rss),
            heapUsed: Math.max(highWaterMemory.heapUsed, endMemory.heapUsed),
            heapTotal: Math.max(highWaterMemory.heapTotal, endMemory.heapTotal)
        };
        const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        logStageTelemetry({
            label: parameters.label,
            durationMs,
            startMemory,
            endMemory,
            highWaterMemory
        });
    }

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

function createRefactorCodemodArgs(options: ValidatedFixCommandOptions): Array<string> {
    const args = [
        "refactor",
        "codemod",
        "--project-root",
        options.projectRoot,
        "--config",
        options.configPath,
        "--write"
    ];

    if (options.only) {
        args.push("--only", options.only);
    }

    if (options.verbose) {
        args.push("--verbose");
    }

    return args;
}

async function runRefactorCodemodSubprocess(options: ValidatedFixCommandOptions): Promise<void> {
    if (process.env[SKIP_CLI_RUN_ENV_VAR] === "1") {
        await executeRefactorCommand(createRefactorStageCommand(options));
        return;
    }

    const cliEntryPath = fileURLToPath(new URL("../../index.js", import.meta.url));

    const subprocessArgs = ["--max-old-space-size=16384", cliEntryPath, ...createRefactorCodemodArgs(options)];

    await new Promise<void>((resolve, reject) => {
        const subprocessEnv = {
            ...process.env
        };
        delete subprocessEnv[SKIP_CLI_RUN_ENV_VAR];

        const childProcess = spawn(process.execPath, subprocessArgs, {
            stdio: "inherit",
            env: subprocessEnv
        });

        childProcess.once("error", reject);
        childProcess.once("exit", (code, signal) => {
            if (typeof code === "number" && code === 0) {
                resolve();
                return;
            }

            reject(
                new Error(
                    `Refactor codemod subprocess failed${
                        signal ? ` with signal ${signal}` : ` with exit code ${String(code)}`
                    }.`
                )
            );
        });
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
            await runRefactorCodemodSubprocess(options);
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
