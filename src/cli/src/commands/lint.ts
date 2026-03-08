import { constants, existsSync, readdirSync, statSync } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Core } from "@gml-modules/core";
import * as LintWorkspace from "@gml-modules/lint";
import { Command } from "commander";
import { ESLint } from "eslint";

import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import type { CommanderCommandLike } from "../cli-core/commander-types.js";
import {
    calculateElapsedNanoseconds,
    formatElapsedNanosecondsAsMilliseconds,
    readMonotonicNanoseconds
} from "../shared/elapsed-time.js";

const FLAT_CONFIG_CANDIDATES = Object.freeze([
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
    "eslint.config.mts",
    "eslint.config.cts"
]);

const SUPPORTED_FORMATTERS = new Set(["stylish", "json", "checkstyle"]);
const GML_FILE_EXTENSION = ".gml";
const LINT_RUNTIME_ERROR_RULE_ID = "gml/internal-runtime-error";

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

function isResolvedConfigLike(value: unknown): value is ResolvedConfigLike {
    return typeof value === "object" && value !== null;
}

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

function shouldPreferBundledDefaultsForExternalTargets(parameters: {
    cwd: string;
    targets: ReadonlyArray<string>;
}): boolean {
    if (parameters.targets.length === 0) {
        return false;
    }

    const cwdAbsolute = path.resolve(parameters.cwd);
    return parameters.targets.every((target) => {
        const absoluteTarget = path.resolve(parameters.cwd, target);
        return !Core.isPathInside(absoluteTarget, cwdAbsolute);
    });
}

function findCommonAncestorDirectory(directoryPaths: ReadonlyArray<string>): string {
    if (directoryPaths.length === 0) {
        throw new Error("Expected at least one directory path to compute a common ancestor.");
    }

    let commonAncestor = path.resolve(directoryPaths[0]);
    for (const directoryPath of directoryPaths.slice(1)) {
        const candidateDirectory = path.resolve(directoryPath);

        while (!Core.isPathInside(candidateDirectory, commonAncestor)) {
            const parentDirectory = path.dirname(commonAncestor);
            if (parentDirectory === commonAncestor) {
                return commonAncestor;
            }
            commonAncestor = parentDirectory;
        }
    }

    return commonAncestor;
}

function resolveEslintCwd(parameters: { cwd: string; targets: ReadonlyArray<string> }): string {
    if (!shouldPreferBundledDefaultsForExternalTargets(parameters)) {
        return parameters.cwd;
    }

    const targetDirectories = parameters.targets.map((target) => {
        const absoluteTarget = path.resolve(parameters.cwd, target);

        try {
            const stats = statSync(absoluteTarget);
            if (stats.isDirectory()) {
                return absoluteTarget;
            }
            if (stats.isFile()) {
                return path.dirname(absoluteTarget);
            }
        } catch {
            // For unmatched globs or future files, anchor at the parent directory.
        }

        return path.dirname(absoluteTarget);
    });

    return findCommonAncestorDirectory(targetDirectories);
}

function validateForcedProjectPath(forcedProjectPath: string | null): string | null {
    if (!forcedProjectPath) {
        return null;
    }

    const resolvedPath = path.resolve(forcedProjectPath);
    if (!existsSync(resolvedPath)) {
        return `Forced project path does not exist: ${resolvedPath}`;
    }

    let resolvedStats: ReturnType<typeof statSync>;
    try {
        resolvedStats = statSync(resolvedPath);
    } catch (error) {
        return `Unable to inspect forced project path ${resolvedPath}: ${
            Core.isErrorLike(error) ? error.message : String(error)
        }`;
    }

    if (resolvedPath.toLowerCase().endsWith(".yyp")) {
        if (!resolvedStats.isFile()) {
            return `Forced project .yyp path must be a file: ${resolvedPath}`;
        }
        return null;
    }

    if (!resolvedStats.isDirectory()) {
        return `Forced project path must be a directory or .yyp file: ${resolvedPath}`;
    }

    return null;
}

type LintRuntimeFailureLocation = Readonly<{
    filePath: string | null;
    line: number;
    column: number;
}>;

type LintResultMessageLike = Readonly<{
    ruleId: string | null;
    fatal?: boolean;
}>;

type LintResultLike = Readonly<{
    filePath: string;
    messages?: ReadonlyArray<LintResultMessageLike>;
}>;

type LintFilesExecutor = Readonly<{
    lintFiles(filePatterns: string | Array<string>): Promise<Array<ESLint.LintResult>>;
}>;

type RecoverableLintTarget = Readonly<{
    target: string;
    fallbackFilePath: string;
}>;

type LintTargetCompletionHandler = (completion: {
    target: string;
    targetResults: Array<ESLint.LintResult>;
    elapsedNanoseconds: bigint;
}) => Promise<void>;

type LintProgressLineWriter = (line: string) => void;

function collectGmlFilesFromDirectory(directoryPath: string): Array<string> {
    const discoveredFilePaths: Array<string> = [];
    const pendingDirectories = [directoryPath];

    while (pendingDirectories.length > 0) {
        const currentDirectory = pendingDirectories.pop();
        if (!currentDirectory) {
            continue;
        }

        let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
        try {
            entries = readdirSync(currentDirectory, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            const entryPath = path.join(currentDirectory, entry.name);
            if (entry.isDirectory()) {
                pendingDirectories.push(entryPath);
                continue;
            }

            if (!entry.isFile()) {
                continue;
            }

            if (!entry.name.toLowerCase().endsWith(GML_FILE_EXTENSION)) {
                continue;
            }

            discoveredFilePaths.push(entryPath);
        }
    }

    return discoveredFilePaths.sort((leftPath, rightPath) => leftPath.localeCompare(rightPath));
}

function expandLintTargetsForRecovery(parameters: {
    cwd: string;
    targets: ReadonlyArray<string>;
}): Readonly<{ fileTargets: Array<string>; passthroughTargets: Array<string> }> {
    const fileTargetSet = new Set<string>();
    const passthroughTargets: Array<string> = [];

    for (const target of parameters.targets) {
        const absoluteTarget = path.resolve(parameters.cwd, target);
        if (!existsSync(absoluteTarget)) {
            passthroughTargets.push(target);
            continue;
        }

        let targetStats: ReturnType<typeof statSync>;
        try {
            targetStats = statSync(absoluteTarget);
        } catch {
            passthroughTargets.push(target);
            continue;
        }

        if (targetStats.isDirectory()) {
            for (const discoveredPath of collectGmlFilesFromDirectory(absoluteTarget)) {
                fileTargetSet.add(discoveredPath);
            }
            continue;
        }

        if (targetStats.isFile()) {
            if (absoluteTarget.toLowerCase().endsWith(GML_FILE_EXTENSION)) {
                fileTargetSet.add(absoluteTarget);
            } else {
                passthroughTargets.push(target);
            }
            continue;
        }

        passthroughTargets.push(target);
    }

    return Object.freeze({
        fileTargets: [...fileTargetSet.values()],
        passthroughTargets: [...new Set(passthroughTargets).values()]
    });
}

function extractLintRuntimeFailureLocation(errorMessage: string): LintRuntimeFailureLocation {
    const occurredLineMatch = /^Occurred while linting ([^\n]+)$/mu.exec(errorMessage);
    if (!occurredLineMatch) {
        return Object.freeze({
            filePath: null,
            line: 1,
            column: 1
        });
    }

    const rawLocation = occurredLineMatch[1].trim();
    const locationMatch = /^(.*?)(?::([0-9]+)(?::([0-9]+))?)?$/u.exec(rawLocation);
    if (!locationMatch) {
        return Object.freeze({
            filePath: null,
            line: 1,
            column: 1
        });
    }

    const extractedLine =
        typeof locationMatch[2] === "string" && locationMatch[2].length > 0 ? Number.parseInt(locationMatch[2], 10) : 1;
    const extractedColumn =
        typeof locationMatch[3] === "string" && locationMatch[3].length > 0 ? Number.parseInt(locationMatch[3], 10) : 1;

    return Object.freeze({
        filePath: locationMatch[1]?.trim().length ? locationMatch[1].trim() : null,
        line: Number.isFinite(extractedLine) ? extractedLine : 1,
        column: Number.isFinite(extractedColumn) ? extractedColumn : 1
    });
}

function isRecoverableLintRuntimeError(error: unknown): boolean {
    if (!Core.isErrorLike(error)) {
        return false;
    }

    return error.message.includes("Occurred while linting ");
}

function createLintRuntimeErrorResult(parameters: { error: unknown; fallbackFilePath: string }): ESLint.LintResult {
    const rawMessage = Core.getErrorMessage(parameters.error, { fallback: "Unhandled lint runtime error." });
    const [summaryLine] = rawMessage.split(/\r?\n/u);
    const location = extractLintRuntimeFailureLocation(rawMessage);
    const resolvedFilePath = location.filePath ?? parameters.fallbackFilePath;

    const runtimeMessage = Object.freeze({
        ruleId: LINT_RUNTIME_ERROR_RULE_ID,
        severity: 2,
        message: summaryLine && summaryLine.length > 0 ? summaryLine : "Unhandled lint runtime error.",
        line: location.line,
        column: location.column,
        nodeType: null,
        fatal: true
    });

    return Object.freeze({
        filePath: resolvedFilePath,
        messages: [runtimeMessage],
        suppressedMessages: [],
        errorCount: 1,
        fatalErrorCount: 1,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        usedDeprecatedRules: []
    });
}

function isFatalRuntimeLintResult(result: LintResultLike): boolean {
    return (result.messages ?? []).some(
        (message) => message.fatal === true && message.ruleId === LINT_RUNTIME_ERROR_RULE_ID
    );
}

async function lintTargetWithRuntimeRecovery(parameters: {
    eslint: LintFilesExecutor;
    target: string;
    fallbackFilePath: string;
}): Promise<Array<ESLint.LintResult>> {
    try {
        return await parameters.eslint.lintFiles([parameters.target]);
    } catch (error) {
        if (!isRecoverableLintRuntimeError(error)) {
            throw error;
        }

        return [
            createLintRuntimeErrorResult({
                error,
                fallbackFilePath: parameters.fallbackFilePath
            })
        ];
    }
}

function lintTargetsWithRuntimeRecovery(parameters: {
    eslint: LintFilesExecutor;
    cwd: string;
    targets: ReadonlyArray<string>;
    onTargetCompleted: LintTargetCompletionHandler;
}): Promise<Array<ESLint.LintResult>> {
    const expandedTargets = expandLintTargetsForRecovery({
        cwd: parameters.cwd,
        targets: parameters.targets
    });
    const orderedTargets: Array<RecoverableLintTarget> = [
        ...expandedTargets.fileTargets.map((target) =>
            Object.freeze({
                target,
                fallbackFilePath: target
            })
        ),
        ...expandedTargets.passthroughTargets.map((target) =>
            Object.freeze({
                target,
                fallbackFilePath: path.resolve(parameters.cwd, target)
            })
        )
    ];

    const aggregatedResults: Array<ESLint.LintResult> = [];

    const lintTargetAtIndex = async (index: number): Promise<Array<ESLint.LintResult>> => {
        if (index >= orderedTargets.length) {
            return aggregatedResults;
        }

        const lintTarget = orderedTargets[index];
        const targetStartedAtNanoseconds = readMonotonicNanoseconds();
        const targetResults = await lintTargetWithRuntimeRecovery({
            eslint: parameters.eslint,
            target: lintTarget.target,
            fallbackFilePath: lintTarget.fallbackFilePath
        });
        await parameters.onTargetCompleted({
            target: lintTarget.target,
            targetResults,
            elapsedNanoseconds: calculateElapsedNanoseconds({
                startedAtNanoseconds: targetStartedAtNanoseconds,
                completedAtNanoseconds: readMonotonicNanoseconds()
            })
        });
        aggregatedResults.push(...targetResults);
        return lintTargetAtIndex(index + 1);
    };

    return lintTargetAtIndex(0);
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
        projectStrict: options.projectStrict === true
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

/** Totals aggregated from a set of ESLint lint results. */
type LintTotals = {
    errorCount: number;
    warningCount: number;
};

/** Minimal shape of a lint result needed for aggregating totals. */
type LintResultCountFields = Pick<ESLint.LintResult, "errorCount" | "fatalErrorCount" | "warningCount">;

/** Minimal shape of a lint result needed for path-based filtering. */
type LintResultPathField = Pick<ESLint.LintResult, "filePath">;

/**
 * Sum the error and warning counts across all lint results.
 * `fatalErrorCount` (parse failures) is folded into `errorCount` because
 * ESLint itself treats fatal errors as errors when computing exit codes.
 */
function aggregateLintTotals(results: ReadonlyArray<LintResultCountFields>): LintTotals {
    return results.reduce<LintTotals>(
        (accumulator, result) => ({
            errorCount: accumulator.errorCount + result.errorCount + result.fatalErrorCount,
            warningCount: accumulator.warningCount + result.warningCount
        }),
        { errorCount: 0, warningCount: 0 }
    );
}

function setProcessExitCode(code: number): void {
    process.exitCode = code;
}

function toLintProgressDisplayPath(parameters: { cwd: string; filePath: string }): string {
    const absoluteFilePath = path.resolve(parameters.filePath);
    const absoluteCwd = path.resolve(parameters.cwd);
    const relativePath = path.relative(absoluteCwd, absoluteFilePath);

    if (absoluteFilePath === absoluteCwd) {
        return ".";
    }

    if (relativePath.length > 0 && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
        return relativePath;
    }

    return absoluteFilePath;
}

function emitLintFixProgressForResults(parameters: {
    cwd: string;
    results: ReadonlyArray<LintResultLike>;
    writeProgressLine: LintProgressLineWriter;
}): void {
    const emittedPaths = new Set<string>();
    for (const result of parameters.results) {
        const displayPath = toLintProgressDisplayPath({
            cwd: parameters.cwd,
            filePath: result.filePath
        });
        if (emittedPaths.has(displayPath)) {
            continue;
        }

        parameters.writeProgressLine(displayPath);
        emittedPaths.add(displayPath);
    }
}

function emitVerboseLintTargetTiming(parameters: {
    cwd: string;
    target: string;
    targetResults: ReadonlyArray<LintResultLike>;
    elapsedNanoseconds: bigint;
    writeProgressLine: LintProgressLineWriter;
}): void {
    const elapsedText = formatElapsedNanosecondsAsMilliseconds(parameters.elapsedNanoseconds);
    if (parameters.targetResults.length === 0) {
        parameters.writeProgressLine(
            `[timing] Lint target '${parameters.target}' completed in ${elapsedText} (no files matched).`
        );
        return;
    }

    if (parameters.targetResults.length === 1) {
        const firstResult = parameters.targetResults[0];
        const displayPath = toLintProgressDisplayPath({
            cwd: parameters.cwd,
            filePath: firstResult.filePath
        });
        parameters.writeProgressLine(`[timing] Linted ${displayPath} in ${elapsedText}.`);
        return;
    }

    const emittedPaths = new Set<string>();
    for (const result of parameters.targetResults) {
        const displayPath = toLintProgressDisplayPath({
            cwd: parameters.cwd,
            filePath: result.filePath
        });
        if (emittedPaths.has(displayPath)) {
            continue;
        }

        parameters.writeProgressLine(`[timing] Linted ${displayPath} in ${elapsedText} (target batch).`);
        emittedPaths.add(displayPath);
    }
}

function emitVerboseLintRunTimingSummary(parameters: {
    lintedFileCount: number;
    elapsedNanoseconds: bigint;
    writeProgressLine: LintProgressLineWriter;
}): void {
    const fileLabel = parameters.lintedFileCount === 1 ? "file" : "files";
    const elapsedText = formatElapsedNanosecondsAsMilliseconds(parameters.elapsedNanoseconds);
    parameters.writeProgressLine(
        `[timing] Completed lint run for ${parameters.lintedFileCount} ${fileLabel} in ${elapsedText}.`
    );
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
    targets: ReadonlyArray<string>;
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

    const preferBundledDefaults = shouldPreferBundledDefaultsForExternalTargets({
        cwd: parameters.cwd,
        targets: parameters.targets
    });
    if (preferBundledDefaults) {
        parameters.eslintConstructorOptions.overrideConfigFile = true;

        if (parameters.noDefaultConfig) {
            return 0;
        }

        parameters.eslintConstructorOptions.overrideConfig = toEslintOverrideConfig();
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
        parameters.eslintConstructorOptions.overrideConfigFile = true;
        printNoConfigMessageIfNeeded({ quiet: parameters.quiet, searchedPaths: discoveryResult.searchedPaths });
        return 0;
    }

    parameters.eslintConstructorOptions.overrideConfigFile = true;
    parameters.eslintConstructorOptions.overrideConfig = toEslintOverrideConfig();
    printFallbackMessageIfNeeded({
        quiet: parameters.quiet,
        searchedPaths: discoveryResult.searchedPaths
    });

    return 0;
}

/** Maximum number of out-of-root file paths shown in warnings and error messages. */
const OUT_OF_ROOT_DISPLAY_LIMIT = 20;

/**
 * Collect the file paths from lint results that fall outside the forced project
 * root. Returns an empty array when no forced root is configured.
 */
function collectOutOfRootFilePaths(
    results: ReadonlyArray<LintResultPathField>,
    forcedProjectRoot: string | null
): Array<string> {
    if (!forcedProjectRoot) {
        return [];
    }

    return results
        .map((result) => result.filePath)
        .filter((filePath) => !Core.isPathWithinBoundary(path.resolve(filePath), forcedProjectRoot));
}

function resolveForcedProjectRoot(forcedProjectPath: string | null): string | null {
    if (!forcedProjectPath) {
        return null;
    }

    const resolvedPath = path.resolve(forcedProjectPath);
    return resolvedPath.toLowerCase().endsWith(".yyp") ? path.dirname(resolvedPath) : resolvedPath;
}

/**
 * Render up to `OUT_OF_ROOT_DISPLAY_LIMIT` paths as a newline-separated
 * string, appending "and N more…" when the list is truncated.
 */
function formatPathSample(paths: ReadonlyArray<string>): string {
    const sample = paths.slice(0, OUT_OF_ROOT_DISPLAY_LIMIT);
    const suffix = paths.length > sample.length ? `\nand ${paths.length - sample.length} more...` : "";
    return `${sample.join("\n")}${suffix}`;
}

/**
 * Format the `GML_PROJECT_OUT_OF_ROOT` warning message for the given list of
 * out-of-root paths. When the list exceeds {@link OUT_OF_ROOT_DISPLAY_LIMIT}
 * entries a trailing "and N more…" line is appended.
 */
function formatOutOfRootWarning(outOfRootPaths: ReadonlyArray<string>): string {
    return `GML_PROJECT_OUT_OF_ROOT:\n${formatPathSample(outOfRootPaths)}`;
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
            .option("--quiet", "Suppress fallback warnings", false)
            .option("--verbose", "Enable verbose command output and timing diagnostics", false)
    );
}

export async function runLintCommand(command: CommanderCommandLike): Promise<void> {
    const options = resolveCommandOptions(command);
    const targets = normalizeLintTargets(command);
    const commandCwd = process.cwd();
    const eslintCwd = resolveEslintCwd({ cwd: commandCwd, targets });
    const eslintConstructorOptions = createEslintConstructorOptions(eslintCwd, options.fix);

    if (!isSupportedFormatter(options.formatter)) {
        console.error(
            `Unsupported formatter "${options.formatter}". Supported formatters: ${Array.from(SUPPORTED_FORMATTERS).join(", ")}`
        );
        setProcessExitCode(2);
        return;
    }

    const configExitCode = await configureLintConfig({
        eslintConstructorOptions,
        cwd: commandCwd,
        targets,
        configPath: options.config,
        noDefaultConfig: options.noDefaultConfig,
        quiet: options.quiet
    });

    if (configExitCode !== 0) {
        setProcessExitCode(configExitCode);
        return;
    }

    const forcedProjectValidationError = validateForcedProjectPath(options.project);
    if (forcedProjectValidationError) {
        console.error(forcedProjectValidationError);
        setProcessExitCode(2);
        return;
    }
    const forcedProjectRoot = resolveForcedProjectRoot(options.project);

    let eslint: ESLint;
    try {
        eslint = new ESLint(eslintConstructorOptions);
    } catch (error) {
        console.error(Core.isErrorLike(error) ? error.message : String(error));
        setProcessExitCode(2);
        return;
    }

    const lintRunStartedAtNanoseconds = readMonotonicNanoseconds();
    let lintedFileCount = 0;

    let results: Array<ESLint.LintResult>;
    try {
        results = await lintTargetsWithRuntimeRecovery({
            eslint,
            cwd: commandCwd,
            targets,
            onTargetCompleted: async ({ target, targetResults, elapsedNanoseconds }) => {
                lintedFileCount += targetResults.length;

                if (options.verbose) {
                    emitVerboseLintTargetTiming({
                        cwd: commandCwd,
                        target,
                        targetResults,
                        elapsedNanoseconds,
                        writeProgressLine: (line) => {
                            process.stderr.write(`${line}\n`);
                        }
                    });
                }

                if (!options.fix) {
                    return;
                }

                await ESLint.outputFixes(targetResults);
                emitLintFixProgressForResults({
                    cwd: commandCwd,
                    results: targetResults,
                    writeProgressLine: (line) => {
                        process.stderr.write(`${line}\n`);
                    }
                });
            }
        });
    } catch (error) {
        console.error(Core.isErrorLike(error) ? error.message : String(error));
        setProcessExitCode(2);
        return;
    }

    try {
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

        const outOfRootPaths = collectOutOfRootFilePaths(results, forcedProjectRoot);

        if (!options.quiet && outOfRootPaths.length > 0) {
            console.warn(formatOutOfRootWarning(outOfRootPaths));
        }

        if (options.projectStrict && outOfRootPaths.length > 0) {
            console.error(
                `Project strict mode failed. Forced root: ${forcedProjectRoot ?? "<none>"}\n` +
                    `Offending paths:\n${formatPathSample(outOfRootPaths)}`
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

        const totals = aggregateLintTotals(results);

        setProcessExitCode(
            resolveExitCode({
                errorCount: totals.errorCount,
                warningCount: totals.warningCount,
                maxWarnings: options.maxWarnings
            })
        );
    } finally {
        if (options.verbose) {
            const elapsedNanoseconds = calculateElapsedNanoseconds({
                startedAtNanoseconds: lintRunStartedAtNanoseconds,
                completedAtNanoseconds: readMonotonicNanoseconds()
            });
            emitVerboseLintRunTimingSummary({
                lintedFileCount,
                elapsedNanoseconds,
                writeProgressLine: (line) => {
                    process.stderr.write(`${line}\n`);
                }
            });
        }
    }
}

export const __lintCommandTest__ = Object.freeze({
    OVERLAY_WARNING_CODE,
    FLAT_CONFIG_CANDIDATES,
    isCanonicalGmlWiring,
    isAppliedRuleValue,
    hasOverlayRuleApplied,
    formatOverlayWarning,
    discoverFlatConfig,
    extractLintRuntimeFailureLocation,
    lintTargetsWithRuntimeRecovery,
    toLintProgressDisplayPath,
    emitLintFixProgressForResults,
    resolveEslintCwd,
    shouldPreferBundledDefaultsForExternalTargets,
    normalizeFormatterName,
    isSupportedFormatter,
    validateExplicitConfigPath,
    configureLintConfig,
    collectOverlayWithoutLanguageWiringPaths,
    normalizeProcessorIdentityForEnforcement,
    enforceProcessorPolicyForGmlFiles,
    PROCESSOR_UNSUPPORTED_ERROR_CODE,
    PROCESSOR_OBSERVABILITY_WARNING_CODE,
    aggregateLintTotals,
    collectOutOfRootFilePaths,
    formatPathSample,
    formatOutOfRootWarning,
    OUT_OF_ROOT_DISPLAY_LIMIT
});
