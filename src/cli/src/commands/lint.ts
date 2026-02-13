import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Core } from "@gml-modules/core";
import { Lint } from "@gml-modules/lint";
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

type LintCommandOptions = {
    fix?: boolean;
    formatter?: string;
    maxWarnings?: number;
    quiet?: boolean;
    config?: string;
    noDefaultConfig?: boolean;
    verbose?: boolean;
};

type DiscoveryResult = {
    selectedConfigPath: string | null;
    searchedPaths: Array<string>;
};

type RuleLevelValue = "off" | "warn" | "error" | 0 | 1 | 2;

type ResolvedConfigLike = {
    plugins?: Record<string, unknown> | null | undefined;
    language?: unknown;
    rules?: Record<string, unknown> | null | undefined;
};

const OVERLAY_WARNING_CODE = "GML_OVERLAY_WITHOUT_LANGUAGE_WIRING";
const OVERLAY_WARNING_MAX_PATH_SAMPLE = 20;

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function discoverFlatConfig(cwd: string): Promise<DiscoveryResult> {
    const searchedPaths: Array<string> = [];

    for (const directory of Core.walkAncestorDirectories(cwd, { includeSelf: true })) {
        for (const candidate of FLAT_CONFIG_CANDIDATES) {
            const absolutePath = path.join(directory, candidate);
            searchedPaths.push(absolutePath);

            if (await fileExists(absolutePath)) {
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
    const value = typeof formatter === "string" ? formatter.toLowerCase() : "stylish";
    return SUPPORTED_FORMATTERS.has(value) ? value : "stylish";
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
} {
    const options = (command.opts() ?? {}) as LintCommandOptions;

    return {
        fix: options.fix === true,
        formatter: normalizeFormatterName(options.formatter),
        maxWarnings: normalizeMaxWarnings(options.maxWarnings),
        quiet: options.quiet === true,
        config: typeof options.config === "string" && options.config.length > 0 ? options.config : null,
        noDefaultConfig: options.noDefaultConfig === true,
        verbose: options.verbose === true
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
    const entries = Lint.configs.recommended.map((entry) => ({
        ...entry,
        files: Array.isArray(entry.files) ? [...entry.files] : undefined
    }));

    return entries as NonNullable<ConstructorParameters<typeof ESLint>[0]>["overrideConfig"];
}

function isCanonicalGmlWiring(config: ResolvedConfigLike): boolean {
    return config.plugins?.gml === Lint.plugin && config.language === "gml/gml";
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

    // Conservative + non-crashing handling for unexpected rule-value shapes.
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

        if (Lint.services.performanceOverrideRuleIds.includes(ruleId)) {
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

    const offendingPaths: Array<string> = [];

    for (const result of parameters.results) {
        const filePath = result.filePath;
        if (!filePath.toLowerCase().endsWith(".gml")) {
            continue;
        }

        const config = (await parameters.eslint.calculateConfigForFile(filePath)) as ResolvedConfigLike;
        if (!hasOverlayRuleApplied(config)) {
            continue;
        }

        if (isCanonicalGmlWiring(config)) {
            continue;
        }

        offendingPaths.push(filePath);
    }

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
            .option("--quiet", "Suppress fallback warnings", false)
            .option("--verbose", "Enable verbose command output", false)
    );
}

export async function runLintCommand(command: CommanderCommandLike): Promise<void> {
    const options = resolveCommandOptions(command);
    const targets = normalizeLintTargets(command);
    const cwd = process.cwd();

    const eslintConstructorOptions: ConstructorParameters<typeof ESLint>[0] = {
        cwd,
        fix: options.fix
    };

    let discoveryResult: DiscoveryResult = {
        selectedConfigPath: null,
        searchedPaths: []
    };

    if (options.config) {
        eslintConstructorOptions.overrideConfigFile = options.config;
    } else {
        discoveryResult = await discoverFlatConfig(cwd);
        if (discoveryResult.selectedConfigPath) {
            eslintConstructorOptions.overrideConfigFile = discoveryResult.selectedConfigPath;
        } else if (!options.noDefaultConfig) {
            eslintConstructorOptions.overrideConfig = toEslintOverrideConfig();
            printFallbackMessageIfNeeded({
                quiet: options.quiet,
                searchedPaths: discoveryResult.searchedPaths
            });
        }
    }

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

    await warnOverlayWithoutLanguageWiringIfNeeded({
        eslint,
        results,
        verbose: options.verbose
    });

    let formatterOutput = "";
    try {
        const formatter = await loadRequestedFormatter(eslint, options.formatter);
        formatterOutput = formatter.format(results);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 2;
        return;
    }

    if (formatterOutput.length > 0) {
        process.stdout.write(`${formatterOutput}\n`);
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
    isCanonicalGmlWiring,
    isAppliedRuleValue,
    hasOverlayRuleApplied,
    formatOverlayWarning
});
