import { constants, existsSync, readdirSync, statSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Core } from "@gml-modules/core";
import * as LintWorkspace from "@gml-modules/lint";
import * as SemanticWorkspace from "@gml-modules/semantic";
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
type SemanticSnapshot = ReturnType<(typeof LINT_NAMESPACE.services)["createProjectAnalysisSnapshotFromProjectIndex"]>;

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
    processor?: unknown;
};

const OVERLAY_WARNING_CODE = "GML_OVERLAY_WITHOUT_LANGUAGE_WIRING";
const OVERLAY_WARNING_MAX_PATH_SAMPLE = 20;
const PROCESSOR_UNSUPPORTED_ERROR_CODE = "GML_PROCESSOR_UNSUPPORTED";
const PROCESSOR_OBSERVABILITY_WARNING_CODE = "GML_PROCESSOR_OBSERVABILITY_UNAVAILABLE";

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

function hasProjectManifest(directoryPath: string): boolean {
    try {
        const entries = readdirSync(directoryPath, { withFileTypes: true });
        return entries.some((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".yyp"));
    } catch {
        return false;
    }
}

function resolveNearestProjectRootFromPath(filePath: string, fallbackCwd: string): string {
    for (const directory of Core.walkAncestorDirectories(path.dirname(filePath), { includeSelf: true })) {
        if (hasProjectManifest(directory)) {
            return directory;
        }
    }

    return fallbackCwd;
}

function collectProjectRootsFromDirectory(directoryPath: string): Array<string> {
    const discoveredRoots = new Set<string>();
    const pendingDirectories = [directoryPath];

    while (pendingDirectories.length > 0) {
        const currentDirectory = pendingDirectories.pop();
        if (!currentDirectory) {
            continue;
        }

        if (hasProjectManifest(currentDirectory)) {
            discoveredRoots.add(path.resolve(currentDirectory));
            continue;
        }

        let entries: Array<{ name: string; isDirectory(): boolean }>;
        try {
            entries = readdirSync(currentDirectory, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            pendingDirectories.push(path.join(currentDirectory, entry.name));
        }
    }

    return [...discoveredRoots.values()];
}

function inferProjectRootsForLintInvocation(parameters: {
    cwd: string;
    targets: ReadonlyArray<string>;
    forcedProjectPath: string | null;
}): Array<string> {
    if (parameters.forcedProjectPath) {
        const forcedPath = path.resolve(parameters.forcedProjectPath);
        if (forcedPath.toLowerCase().endsWith(".yyp")) {
            return [path.dirname(forcedPath)];
        }

        return [forcedPath];
    }

    const roots = new Set<string>();
    for (const target of parameters.targets) {
        const absoluteTarget = path.resolve(parameters.cwd, target);
        if (!existsSync(absoluteTarget)) {
            continue;
        }

        let stats: ReturnType<typeof statSync>;
        try {
            stats = statSync(absoluteTarget);
        } catch {
            continue;
        }

        if (stats.isDirectory()) {
            for (const root of collectProjectRootsFromDirectory(absoluteTarget)) {
                roots.add(root);
            }
            continue;
        }

        if (stats.isFile()) {
            const root = resolveNearestProjectRootFromPath(absoluteTarget, parameters.cwd);
            roots.add(root);
        }
    }

    if (roots.size === 0) {
        roots.add(path.resolve(parameters.cwd));
    }

    return [...roots.values()];
}

async function createInvocationProjectAnalysisProvider(parameters: {
    cwd: string;
    targets: ReadonlyArray<string>;
    forcedProjectPath: string | null;
    indexAllowDirectories: ReadonlyArray<string>;
}): Promise<ReturnType<typeof LINT_NAMESPACE.services.createPrebuiltProjectAnalysisProvider>> {
    const projectRoots = inferProjectRootsForLintInvocation({
        cwd: parameters.cwd,
        targets: parameters.targets,
        forcedProjectPath: parameters.forcedProjectPath
    });
    const normalizedAllowedDirectories = parameters.indexAllowDirectories.map((directory) => path.resolve(directory));
    const excludedDirectories = new Set(
        LINT_NAMESPACE.services.defaultProjectIndexExcludes.map((directory) => directory.toLowerCase())
    );

    const snapshotEntries = await Promise.all(
        projectRoots.map(async (root): Promise<[string, SemanticSnapshot]> => {
            const projectIndex = await SemanticWorkspace.Semantic.buildProjectIndex(root);
            const snapshot = LINT_NAMESPACE.services.createProjectAnalysisSnapshotFromProjectIndex(projectIndex, root, {
                excludedDirectories,
                allowedDirectories: normalizedAllowedDirectories
            });
            return [root, snapshot];
        })
    );

    if (snapshotEntries.length === 0) {
        throw new Error("Unable to construct semantic project snapshots because no project roots were resolved.");
    }

    const snapshotsByRoot = new Map<string, SemanticSnapshot>(snapshotEntries);
    return LINT_NAMESPACE.services.createPrebuiltProjectAnalysisProvider(snapshotsByRoot);
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
        "To disable this fallback, pass --no-default-config.",
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

function setProcessExitCode(code: number): void {
    process.exitCode = code;
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
    if (typeof level === "string") {
        return level.trim().toLowerCase() === "off";
    }

    return level === 0;
}

function isAppliedLevel(level: unknown): boolean {
    if (typeof level === "string") {
        const normalizedLevel = level.trim().toLowerCase();
        if (normalizedLevel === "warn" || normalizedLevel === "error") {
            return true;
        }
    }

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

function normalizeProcessorIdentityForEnforcement(processor: unknown): string | null {
    if (processor === null || processor === undefined) {
        return null;
    }

    if (typeof processor === "string") {
        const normalized = processor.trim();
        if (normalized.length === 0) {
            return null;
        }

        return normalized;
    }

    return "<non-string-processor>";
}

function toProcessorUnsupportedMessage(filePath: string, processorIdentity: string): string {
    return `${PROCESSOR_UNSUPPORTED_ERROR_CODE}: unsupported active processor for ${filePath}: ${processorIdentity}`;
}

function toProcessorObservabilityUnavailableMessage(): string {
    return `${PROCESSOR_OBSERVABILITY_WARNING_CODE}: active processor identity is not observable in resolved ESLint config; skipping processor enforcement.`;
}

type ConfigLookupEslintLike = {
    calculateConfigForFile(filePath: string): Promise<unknown>;
};

type LintResultFilePathLike = {
    filePath: string;
};

async function collectOverlayWithoutLanguageWiringPaths(parameters: {
    eslint: ConfigLookupEslintLike;
    results: Array<LintResultFilePathLike>;
}): Promise<Array<string>> {
    const gmlFilePaths = parameters.results
        .map((result) => result.filePath)
        .filter((filePath) => filePath.toLowerCase().endsWith(".gml"));

    const configEntries = await Promise.all(
        gmlFilePaths.map(async (filePath) => ({
            filePath,
            config: (await parameters.eslint.calculateConfigForFile(filePath)) as ResolvedConfigLike
        }))
    );

    return configEntries
        .filter(({ config }) => hasOverlayRuleApplied(config) && !isCanonicalGmlWiring(config))
        .map(({ filePath }) => filePath);
}

async function warnOverlayWithoutLanguageWiringIfNeeded(parameters: {
    eslint: ESLint;
    results: Array<ESLint.LintResult>;
    quiet: boolean;
}): Promise<void> {
    if (parameters.quiet) {
        return;
    }

    const offendingPaths = await collectOverlayWithoutLanguageWiringPaths(parameters);

    if (offendingPaths.length === 0) {
        return;
    }

    console.warn(formatOverlayWarning(offendingPaths));
}

async function enforceProcessorPolicyForGmlFiles(parameters: {
    eslint: ConfigLookupEslintLike;
    results: Array<LintResultFilePathLike>;
    verbose: boolean;
}): Promise<{ exitCode: 0 | 2; message: string | null; warning: string | null }> {
    const gmlFilePaths = parameters.results
        .map((result) => result.filePath)
        .filter((filePath) => filePath.toLowerCase().endsWith(".gml"));

    if (gmlFilePaths.length === 0) {
        return { exitCode: 0, message: null, warning: null };
    }

    const resolvedEntries = await Promise.all(
        gmlFilePaths.map(async (filePath) => ({
            filePath,
            config: (await parameters.eslint.calculateConfigForFile(filePath)) as ResolvedConfigLike
        }))
    );

    const observedEntries = resolvedEntries.filter(({ config }) => Object.hasOwn(config, "processor"));
    if (observedEntries.length > 0) {
        for (const entry of observedEntries) {
            const normalizedProcessor = normalizeProcessorIdentityForEnforcement(entry.config.processor);
            if (normalizedProcessor === null) {
                continue;
            }

            return {
                exitCode: 2,
                message: toProcessorUnsupportedMessage(entry.filePath, normalizedProcessor),
                warning: null
            };
        }

        return { exitCode: 0, message: null, warning: null };
    }

    if (!parameters.verbose) {
        return { exitCode: 0, message: null, warning: null };
    }

    return {
        exitCode: 0,
        message: null,
        warning: toProcessorObservabilityUnavailableMessage()
    };
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
                `Failed to read eslint config at ${parameters.configPath}: ${Core.isErrorLike(error) ? error.message : String(error)}`
            );
            return 2;
        }

        parameters.eslintConstructorOptions.overrideConfigFile = parameters.configPath;
        return 0;
    }

    const discoveryResult = discoverFlatConfig(parameters.cwd);
    if (discoveryResult.selectedConfigPath) {
        // Intentionally let ESLint resolve and select the active config file natively.
        // This preserves ESLint's sibling-config precedence rules and avoids CLI-side
        // config selection divergence from direct ESLint execution.
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
        setProcessExitCode(2);
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
        setProcessExitCode(configExitCode);
        return;
    }

    let invocationAnalysisProvider: ReturnType<typeof LINT_NAMESPACE.services.createPrebuiltProjectAnalysisProvider>;
    try {
        invocationAnalysisProvider = await createInvocationProjectAnalysisProvider({
            cwd,
            targets,
            forcedProjectPath: options.project,
            indexAllowDirectories: options.indexAllow
        });
    } catch (error) {
        console.error(
            `Unable to prepare semantic project analysis provider: ${
                Core.isErrorLike(error) ? error.message : String(error)
            }`
        );
        setProcessExitCode(2);
        return;
    }

    const projectRegistry = LINT_NAMESPACE.services.createProjectLintContextRegistry({
        cwd,
        forcedProjectPath: options.project,
        indexAllowDirectories: options.indexAllow,
        analysisProvider: invocationAnalysisProvider
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
        console.error(Core.isErrorLike(error) ? error.message : String(error));
        setProcessExitCode(2);
        return;
    }

    let results: Array<ESLint.LintResult>;
    try {
        results = await eslint.lintFiles(targets);
    } catch (error) {
        console.error(Core.isErrorLike(error) ? error.message : String(error));
        setProcessExitCode(2);
        return;
    }

    if (options.fix) {
        await ESLint.outputFixes(results);
    }

    await warnOverlayWithoutLanguageWiringIfNeeded({ eslint, results, quiet: options.quiet });

    const processorPolicy = await enforceProcessorPolicyForGmlFiles({
        eslint,
        results,
        verbose: options.verbose
    });

    if (processorPolicy.warning) {
        console.warn(processorPolicy.warning);
    }

    if (processorPolicy.exitCode !== 0) {
        if (processorPolicy.message) {
            console.error(processorPolicy.message);
        }

        setProcessExitCode(processorPolicy.exitCode);
        return;
    }

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
        setProcessExitCode(2);
        return;
    }

    try {
        const formatter = await loadRequestedFormatter(eslint, options.formatter);
        const formatterOutput = formatter.format(results);
        if (formatterOutput.length > 0) {
            process.stdout.write(`${formatterOutput}\n`);
        }
    } catch (error) {
        console.error(Core.isErrorLike(error) ? error.message : String(error));
        setProcessExitCode(2);
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

    setProcessExitCode(
        resolveExitCode({
            errorCount: totals.errorCount,
            warningCount: totals.warningCount,
            maxWarnings: options.maxWarnings
        })
    );
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
    validateExplicitConfigPath,
    configureLintConfig,
    collectOverlayWithoutLanguageWiringPaths,
    normalizeProcessorIdentityForEnforcement,
    enforceProcessorPolicyForGmlFiles,
    PROCESSOR_UNSUPPORTED_ERROR_CODE,
    PROCESSOR_OBSERVABILITY_WARNING_CODE
});
