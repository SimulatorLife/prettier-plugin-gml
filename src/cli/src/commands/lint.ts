import { existsSync } from "node:fs";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Core } from "@gml-modules/core";
import * as LintWorkspace from "@gml-modules/lint";
import { Command } from "commander";
import { ESLint } from "eslint";

import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import type { CommanderCommandLike } from "../cli-core/commander-types.js";

const FLAT_CONFIG_CANDIDATES = Object.freeze([
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
    "eslint.config.mts",
    "eslint.config.cts"
]);

const SUPPORTED_FORMATTERS = new Set(["stylish", "json", "checkstyle"]);

const LINT_NAMESPACE = LintWorkspace.Lint;

type LintCommandOptions = {
    fix?: boolean;
    formatter?: string;
    maxWarnings?: number;
    quiet?: boolean;
    config?: string;
    noDefaultConfig?: boolean;
    verbose?: boolean;
    project?: string;
    projectStrict?: boolean;
    indexAllow?: Array<string> | string;
};

type DiscoveryResult = {
    selectedConfigPath: string | null;
    searchedPaths: Array<string>;
};

type ResolvedConfigLike = {
    plugins?: Record<string, unknown> | null | undefined;
    language?: unknown;
    rules?: Record<string, unknown> | null | undefined;
};

const OVERLAY_WARNING_CODE = "GML_OVERLAY_WITHOUT_LANGUAGE_WIRING";
const OVERLAY_WARNING_MAX_PATH_SAMPLE = 20;

function discoverFlatConfig(cwd: string): DiscoveryResult {
    const searchedPaths: Array<string> = [];

    for (const directory of Core.walkAncestorDirectories(cwd, { includeSelf: true })) {
        for (const candidate of FLAT_CONFIG_CANDIDATES) {
            const absolutePath = path.join(directory, candidate);
            searchedPaths.push(absolutePath);

            if (existsSync(absolutePath)) {
                return {
                    selectedConfigPath: absolutePath,
                    searchedPaths
                };
            }
        }
    }

    return {
        selectedConfigPath: null,
        searchedPaths
    };
}

function normalizeFormatterName(formatter: string | undefined): string {
    if (typeof formatter !== "string") {
        return "stylish";
    }

    return formatter.toLowerCase();
}

function normalizeLintTargets(command: CommanderCommandLike): Array<string> {
    const args = Array.isArray(command.args) ? command.args : [];
    return args.length > 0 ? args : ["."];
}

function normalizeMaxWarnings(rawValue: unknown): number {
    if (typeof rawValue === "string") {
        const parsed = Number.parseInt(rawValue, 10);
        return Number.isNaN(parsed) ? -1 : parsed;
    }

    if (typeof rawValue !== "number" || Number.isNaN(rawValue)) {
        return -1;
    }

    return rawValue;
}

function resolveCommandOptions(command: CommanderCommandLike): Required<Omit<LintCommandOptions, "config">> & {
    config: string | null;
    project: string | null;
    indexAllow: Array<string>;
} {
    const options = (command.opts() ?? {}) as LintCommandOptions;

    return {
        fix: options.fix === true,
        formatter: normalizeFormatterName(options.formatter),
        maxWarnings: normalizeMaxWarnings(options.maxWarnings),
        quiet: options.quiet === true,
        config: typeof options.config === "string" && options.config.length > 0 ? options.config : null,
        noDefaultConfig: options.noDefaultConfig === true,
        verbose: options.verbose === true,
        project: typeof options.project === "string" && options.project.length > 0 ? options.project : null,
        projectStrict: options.projectStrict === true,
        indexAllow: Array.isArray(options.indexAllow)
            ? options.indexAllow
            : typeof options.indexAllow === "string"
              ? [options.indexAllow]
              : []
    };
}

function printFallbackMessageIfNeeded(parameters: { quiet: boolean; searchedPaths: Array<string> }): void {
    if (parameters.quiet) {
        return;
    }

    const lines = [
        "No user flat config found; using bundled defaults.",
        "Searched locations:",
        ...parameters.searchedPaths.map((entry) => `- ${entry}`)
    ];
    console.warn(lines.join("\n"));
}

function printNoConfigMessageIfNeeded(parameters: { quiet: boolean; searchedPaths: Array<string> }): void {
    if (parameters.quiet) {
        return;
    }

    const lines = [
        "No user flat config found.",
        "Searched locations:",
        ...parameters.searchedPaths.map((entry) => `- ${entry}`)
    ];
    console.warn(lines.join("\n"));
}

async function validateExplicitConfigPath(configPath: string): Promise<void> {
    await access(configPath, constants.R_OK);
}

function isSupportedFormatter(formatterName: string): boolean {
    return SUPPORTED_FORMATTERS.has(formatterName);
}

function resolveExitCode(parameters: { errorCount: number; warningCount: number; maxWarnings: number }): number {
    if (parameters.errorCount > 0) {
        return 1;
    }

    if (parameters.maxWarnings >= 0 && parameters.warningCount > parameters.maxWarnings) {
        return 1;
    }

    return 0;
}

function toEslintOverrideConfig(): NonNullable<ConstructorParameters<typeof ESLint>[0]>["overrideConfig"] {
    const entries = LINT_NAMESPACE.configs.recommended.map((entry) => ({
        ...entry,
        files: Array.isArray(entry.files) ? [...entry.files] : undefined
    }));

    return entries as NonNullable<ConstructorParameters<typeof ESLint>[0]>["overrideConfig"];
}

function isCanonicalGmlWiring(config: ResolvedConfigLike): boolean {
    return config.plugins?.gml === LINT_NAMESPACE.plugin && config.language === "gml/gml";
}

function readArrayFirstEntry(value: unknown): unknown {
    if (!Array.isArray(value) || value.length === 0) {
        return undefined;
    }

    return value[0];
}

function getRuleLevel(value: unknown): unknown {
    if (Array.isArray(value)) {
        return readArrayFirstEntry(value);
    }

    return value;
}

function isOffLevel(level: unknown): boolean {
    return level === "off" || level === 0;
}

function isAppliedLevel(level: unknown): boolean {
    if (level === "warn" || level === "error") {
        return true;
    }

    if (level === 1 || level === 2) {
        return true;
    }

    return false;
}

function isAppliedRuleValue(value: unknown): boolean {
    const level = getRuleLevel(value);
    if (isOffLevel(level)) {
        return false;
    }

    if (isAppliedLevel(level)) {
        return true;
    }

    return true;
}

function hasOverlayRuleApplied(config: ResolvedConfigLike): boolean {
    if (!config.rules) {
        return false;
    }

    for (const [ruleId, rawValue] of Object.entries(config.rules)) {
        if (!isAppliedRuleValue(rawValue)) {
            continue;
        }

        if (ruleId.startsWith("feather/")) {
            return true;
        }

        if (LINT_NAMESPACE.services.performanceOverrideRuleIds.includes(ruleId)) {
            return true;
        }
    }

    return false;
}

function formatOverlayWarning(paths: Array<string>): string {
    const sample = paths.slice(0, OVERLAY_WARNING_MAX_PATH_SAMPLE);
    const remainderCount = paths.length - sample.length;
    const suffix = remainderCount > 0 ? `\nand ${remainderCount} more...` : "";
    return `${OVERLAY_WARNING_CODE}: overlay rules applied without required language wiring.\n${sample.join("\n")}${suffix}`;
}

async function warnOverlayWithoutLanguageWiringIfNeeded(parameters: {
    eslint: ESLint;
    results: Array<ESLint.LintResult>;
    verbose: boolean;
}): Promise<void> {
    if (!parameters.verbose) {
        return;
    }

    const gmlFilePaths = parameters.results
        .map((result) => result.filePath)
        .filter((filePath) => filePath.toLowerCase().endsWith(".gml"));

    const configEntries = await Promise.all(
        gmlFilePaths.map(async (filePath) => ({
            filePath,
            config: (await parameters.eslint.calculateConfigForFile(filePath)) as ResolvedConfigLike
        }))
    );

    const offendingPaths = configEntries
        .filter(({ config }) => hasOverlayRuleApplied(config) && !isCanonicalGmlWiring(config))
        .map(({ filePath }) => filePath);

    if (offendingPaths.length === 0) {
        return;
    }

    console.warn(formatOverlayWarning(offendingPaths));
}

async function loadRequestedFormatter(
    eslint: ESLint,
    formatterName: string
): Promise<{ format: (results: Array<ESLint.LintResult>) => string }> {
    const formatter = await eslint.loadFormatter(formatterName);

    return {
        format: (results) => {
            const output = formatter.format(results);
            return typeof output === "string" ? output : "";
        }
    };
}

function createEslintConstructorOptions(cwd: string, fix: boolean): ConstructorParameters<typeof ESLint>[0] {
    return {
        cwd,
        fix
    };
}

async function configureLintConfig(parameters: {
    eslintConstructorOptions: ConstructorParameters<typeof ESLint>[0];
    cwd: string;
    configPath: string | null;
    noDefaultConfig: boolean;
    quiet: boolean;
}): Promise<number> {
    if (parameters.configPath) {
        try {
            await validateExplicitConfigPath(parameters.configPath);
        } catch (error) {
            console.error(
                `Failed to read eslint config at ${parameters.configPath}: ${error instanceof Error ? error.message : String(error)}`
            );
            return 2;
        }

        parameters.eslintConstructorOptions.overrideConfigFile = parameters.configPath;
        return 0;
    }

    const discoveryResult = discoverFlatConfig(parameters.cwd);
    if (discoveryResult.selectedConfigPath) {
        parameters.eslintConstructorOptions.overrideConfigFile = discoveryResult.selectedConfigPath;
        return 0;
    }

    if (parameters.noDefaultConfig) {
        printNoConfigMessageIfNeeded({ quiet: parameters.quiet, searchedPaths: discoveryResult.searchedPaths });
        return 0;
    }

    parameters.eslintConstructorOptions.overrideConfig = toEslintOverrideConfig();
    printFallbackMessageIfNeeded({
        quiet: parameters.quiet,
        searchedPaths: discoveryResult.searchedPaths
    });

    return 0;
}

export function createLintCommand(): Command {
    return applyStandardCommandOptions(
        new Command("lint")
            .description("Lint GameMaker Language files using @gml-modules/lint")
            .argument("[paths...]", "File or directory paths to lint")
            .option("--fix", "Apply automatic fixes", false)
            .option("--formatter <name>", "Formatter output (stylish|json|checkstyle)", "stylish")
            .option("--max-warnings <count>", "Maximum warning count before exit code 1", "-1")
            .option("--config <path>", "Explicit eslint flat config path")
            .option("--no-default-config", "Disable bundled default config fallback")
            .option("--project <path>", "Force a project root directory or .yyp file path")
            .option("--project-strict", "Fail when lint targets fall outside forced --project root", false)
            .option("--index-allow <dir...>", "Include directories that are hard-excluded from project indexing")
            .option("--quiet", "Suppress fallback warnings", false)
            .option("--verbose", "Enable verbose command output", false)
    );
}

export async function runLintCommand(command: CommanderCommandLike): Promise<void> {
    const options = resolveCommandOptions(command);
    const targets = normalizeLintTargets(command);
    const cwd = process.cwd();
    const eslintConstructorOptions = createEslintConstructorOptions(cwd, options.fix);

    if (!isSupportedFormatter(options.formatter)) {
        console.error(
            `Unsupported formatter "${options.formatter}". Supported formatters: ${Array.from(SUPPORTED_FORMATTERS).join(", ")}`
        );
        process.exitCode = 2;
        return;
    }

    const configExitCode = await configureLintConfig({
        eslintConstructorOptions,
        cwd,
        configPath: options.config,
        noDefaultConfig: options.noDefaultConfig,
        quiet: options.quiet
    });

    if (configExitCode !== 0) {
        process.exitCode = configExitCode;
        return;
    }

    const projectRegistry = LINT_NAMESPACE.services.createProjectLintContextRegistry({
        cwd,
        forcedProjectPath: options.project,
        indexAllowDirectories: options.indexAllow
    });
    const projectSettings = LINT_NAMESPACE.services.createProjectSettingsFromRegistry(projectRegistry);

    eslintConstructorOptions.overrideConfig = [
        ...(Array.isArray(eslintConstructorOptions.overrideConfig) ? [...eslintConstructorOptions.overrideConfig] : []),
        {
            files: ["**/*.gml"],
            settings: {
                gml: {
                    project: projectSettings
                }
            }
        }
    ];

    let eslint: ESLint;
    try {
        eslint = new ESLint(eslintConstructorOptions);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 2;
        return;
    }

    let results: Array<ESLint.LintResult>;
    try {
        results = await eslint.lintFiles(targets);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 2;
        return;
    }

    if (options.fix) {
        await ESLint.outputFixes(results);
    }

    await warnOverlayWithoutLanguageWiringIfNeeded({ eslint, results, verbose: options.verbose });

    const outOfRootPaths = results
        .map((result) => result.filePath)
        .filter((filePath) => projectRegistry.isOutOfForcedRoot(filePath));

    if (!options.quiet && outOfRootPaths.length > 0) {
        const sample = outOfRootPaths.slice(0, 20);
        const suffix =
            outOfRootPaths.length > sample.length ? `\nand ${outOfRootPaths.length - sample.length} more...` : "";
        console.warn(`GML_PROJECT_OUT_OF_ROOT:\n${sample.join("\n")}${suffix}`);
    }

    if (options.projectStrict && outOfRootPaths.length > 0) {
        console.error(
            `Project strict mode failed. Forced root: ${projectRegistry.getForcedRoot() ?? "<none>"}\n` +
                `Offending paths:\n${outOfRootPaths.slice(0, 20).join("\n")}`
        );
        process.exitCode = 2;
        return;
    }

    try {
        const formatter = await loadRequestedFormatter(eslint, options.formatter);
        const formatterOutput = formatter.format(results);
        if (formatterOutput.length > 0) {
            process.stdout.write(`${formatterOutput}\n`);
        }
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 2;
        return;
    }

    const totals = results.reduce(
        (accumulator, result) => {
            return {
                errorCount: accumulator.errorCount + result.errorCount + result.fatalErrorCount,
                warningCount: accumulator.warningCount + result.warningCount
            };
        },
        {
            errorCount: 0,
            warningCount: 0
        }
    );

    process.exitCode = resolveExitCode({
        errorCount: totals.errorCount,
        warningCount: totals.warningCount,
        maxWarnings: options.maxWarnings
    });
}

export const __lintCommandTest__ = Object.freeze({
    OVERLAY_WARNING_CODE,
    FLAT_CONFIG_CANDIDATES,
    isCanonicalGmlWiring,
    isAppliedRuleValue,
    hasOverlayRuleApplied,
    formatOverlayWarning,
    discoverFlatConfig,
    normalizeFormatterName,
    isSupportedFormatter,
    validateExplicitConfigPath
});
