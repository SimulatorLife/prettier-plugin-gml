import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { CliUsageError, handleCliError } from "../lib/cli-errors.js";
import { getErrorMessage } from "../lib/shared/utils.js";

const DEFAULT_INPUT_DIR = "test-results";
const DEFAULT_OUTPUT_DIR = "test-results";
const DEFAULT_SUMMARY_FILE = "summary.json";
const DEFAULT_COMPARISON_FILE = "comparison.json";
const SUMMARY_SCHEMA_VERSION = 1;

function normalizeOptionName(rawName) {
    return rawName.replaceAll(/-([a-zA-Z])/g, (_, ch) => ch.toUpperCase());
}

function parseOptionName(rawName) {
    if (rawName.startsWith("no-")) {
        const name = rawName.slice(3);
        return { name: normalizeOptionName(name), value: false };
    }

    return { name: normalizeOptionName(rawName), value: undefined };
}

function parseCommandLine(argv) {
    const options = {};
    const positionals = [];

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith("-")) {
            positionals.push(token);
            continue;
        }

        if (token.startsWith("--")) {
            const raw = token.slice(2);
            if (!raw) {
                continue;
            }

            const eqIndex = raw.indexOf("=");
            if (eqIndex !== -1) {
                const { name } = parseOptionName(raw.slice(0, eqIndex));
                options[name] = raw.slice(eqIndex + 1);
                continue;
            }

            const parsed = parseOptionName(raw);
            if (parsed.value !== undefined) {
                options[parsed.name] = parsed.value;
                continue;
            }

            const next = argv[index + 1];
            if (next && !next.startsWith("-")) {
                options[parsed.name] = next;
                index += 1;
            } else {
                options[parsed.name] = true;
            }
            continue;
        }

        const flag = token.slice(1);
        if (!flag) {
            continue;
        }

        for (const char of flag.split("")) {
            options[char] = true;
        }
    }

    const [command, ...rest] = positionals;
    return { command, args: rest, options };
}

function ensureStringOption(value, { name, defaultValue }) {
    if (value === undefined || value === null) {
        return defaultValue;
    }

    if (typeof value !== "string") {
        throw new CliUsageError(`Expected --${name} to be a string.`);
    }

    return value;
}

function listFilesRecursive(root) {
    if (!fs.existsSync(root)) {
        return [];
    }

    const files = [];
    const stack = [root];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === "." || entry.name === "..") {
                continue;
            }
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
            } else {
                files.push(fullPath);
            }
        }
    }
    return files;
}

function readJUnitSuites(xmlFiles) {
    const totals = { tests: 0, failures: 0, errors: 0, skipped: 0, time: 0 };
    for (const file of xmlFiles) {
        const xml = fs.readFileSync(file, "utf8");
        for (const match of xml.matchAll(/<testsuite\b([^>]*)>/g)) {
            const attrs = match[1] || "";
            function escapeRegExp(str) {
                return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }
            const pick = (name) =>
                (attrs.match(new RegExp(`${escapeRegExp(name)}="([^"]*)"`, "g")) || [])[1] ?? null;
            const asNumber = (value) =>
                (value === null ? 0 : Number.parseFloat(value)) || 0;
            totals.tests += asNumber(pick("tests"));
            totals.failures += asNumber(pick("failures"));
            totals.errors += asNumber(pick("errors"));
            totals.skipped += asNumber(pick("skipped"));
            totals.time += asNumber(pick("time"));
        }
    }
    return totals;
}

function readCoverage(lcovFiles) {
    if (lcovFiles.length === 0) {
        return null;
    }

    let found = 0;
    let hit = 0;
    for (const file of lcovFiles) {
        const text = fs.readFileSync(file, "utf8");
        for (const line of text.split(/\r?\n/)) {
            if (line.startsWith("LF:")) {
                found += Number.parseInt(line.slice(3), 10) || 0;
            } else if (line.startsWith("LH:")) {
                hit += Number.parseInt(line.slice(3), 10) || 0;
            }
        }
    }

    if (found <= 0) {
        return { found: 0, hit, pct: null };
    }

    return { found, hit, pct: (hit / found) * 100 };
}

function readCheckstyle(checkstyleFiles) {
    if (checkstyleFiles.length === 0) {
        return null;
    }

    let warnings = 0;
    let errors = 0;
    for (const file of checkstyleFiles) {
        const xml = fs.readFileSync(file, "utf8");
        for (const match of xml.matchAll(/<error\b[^>]*severity="([^"]*)"/gi)) {
            const severity = (match[1] || "").toLowerCase();
            if (severity === "warning") {
                warnings += 1;
            } else if (severity === "error") {
                errors += 1;
            }
        }
    }

    return { warnings, errors };
}

function computeTestTotals(suites) {
    const total = suites.tests;
    const failed = suites.failures + suites.errors;
    const skipped = suites.skipped;
    const passed = Math.max(total - failed - skipped, 0);
    return {
        total,
        passed,
        failed,
        skipped,
        errors: suites.errors,
        failures: suites.failures,
        duration: suites.time
    };
}

function writeJsonFile(filePath, data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function summarizeReports({
    inputDir = DEFAULT_INPUT_DIR,
    outputDir = DEFAULT_OUTPUT_DIR,
    outputFile = DEFAULT_SUMMARY_FILE,
    now = new Date()
} = {}) {
    const resolvedInput = path.resolve(inputDir);
    const resolvedOutputDir = path.resolve(outputDir);
    const files = listFilesRecursive(resolvedInput);
    const junitFiles = files.filter((file) => file.endsWith(".xml"));
    const coverageFiles = files.filter(
        (file) => path.basename(file).toLowerCase() === "lcov.info"
    );
    const checkstyleFiles = files.filter((file) =>
        /checkstyle/i.test(path.basename(file))
    );

    const suiteTotals = readJUnitSuites(junitFiles);
    const coverage = readCoverage(coverageFiles);
    const checkstyle = readCheckstyle(checkstyleFiles);

    const summary = {
        schemaVersion: SUMMARY_SCHEMA_VERSION,
        generatedAt: now.toISOString(),
        inputs: {
            root: resolvedInput,
            junit: junitFiles,
            coverage: coverageFiles,
            checkstyle: checkstyleFiles
        },
        tests: computeTestTotals(suiteTotals),
        coverage: coverage,
        lint: checkstyle
    };

    const outputPath = path.join(resolvedOutputDir, outputFile);
    writeJsonFile(outputPath, summary);

    return { outputPath, summary };
}

function ensureSummaryObject(value, { label, path: filePath }) {
    if (!value || typeof value !== "object") {
        throw new CliUsageError(
            `Summary ${label} (${filePath}) is not a JSON object.`
        );
    }

    if (value.schemaVersion !== SUMMARY_SCHEMA_VERSION) {
        throw new CliUsageError(
            `Summary ${label} (${filePath}) has unsupported schema version: ${value.schemaVersion}.`
        );
    }

    return value;
}

function readSummaryFile(filePath) {
    const text = fs.readFileSync(filePath, "utf8");
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new CliUsageError(
            `Failed to parse summary file ${filePath}: ${getErrorMessage(error)}`
        );
    }
}

function computeDelta(base, target) {
    if (base === null || base === undefined) {
        return target === undefined ? null : target;
    }
    if (target === null || target === undefined) {
        return base === undefined ? null : -base;
    }
    if (typeof base === "number" && typeof target === "number") {
        return target - base;
    }
    return null;
}

function buildMetricComparison({ base, target }) {
    return {
        base,
        target,
        delta: computeDelta(base, target)
    };
}

function buildTestsComparison(baseTests, targetTests) {
    return {
        total: buildMetricComparison({
            base: baseTests?.total ?? 0,
            target: targetTests?.total ?? 0
        }),
        passed: buildMetricComparison({
            base: baseTests?.passed ?? 0,
            target: targetTests?.passed ?? 0
        }),
        failed: buildMetricComparison({
            base: baseTests?.failed ?? 0,
            target: targetTests?.failed ?? 0
        }),
        skipped: buildMetricComparison({
            base: baseTests?.skipped ?? 0,
            target: targetTests?.skipped ?? 0
        }),
        duration: buildMetricComparison({
            base: baseTests?.duration ?? 0,
            target: targetTests?.duration ?? 0
        })
    };
}

function buildCoverageComparison(baseCoverage, targetCoverage) {
    if (!baseCoverage && !targetCoverage) {
        return null;
    }

    const baseFound = baseCoverage?.found ?? null;
    const targetFound = targetCoverage?.found ?? null;
    const baseHit = baseCoverage?.hit ?? null;
    const targetHit = targetCoverage?.hit ?? null;
    const basePct = Number.isFinite(baseCoverage?.pct)
        ? baseCoverage.pct
        : null;
    const targetPct = Number.isFinite(targetCoverage?.pct)
        ? targetCoverage.pct
        : null;

    return {
        found: buildMetricComparison({ base: baseFound, target: targetFound }),
        hit: buildMetricComparison({ base: baseHit, target: targetHit }),
        pct: buildMetricComparison({ base: basePct, target: targetPct })
    };
}

function buildLintComparison(baseLint, targetLint) {
    if (!baseLint && !targetLint) {
        return null;
    }

    const baseWarnings = baseLint?.warnings ?? 0;
    const targetWarnings = targetLint?.warnings ?? 0;
    const baseErrors = baseLint?.errors ?? 0;
    const targetErrors = targetLint?.errors ?? 0;

    return {
        warnings: buildMetricComparison({
            base: baseWarnings,
            target: targetWarnings
        }),
        errors: buildMetricComparison({
            base: baseErrors,
            target: targetErrors
        })
    };
}

function buildRegressionSummary({ tests, coverage, lint }) {
    const newFailures = Math.max(tests?.failed?.delta ?? 0, 0);
    const lintErrors = Math.max((lint?.errors?.delta ?? 0) || 0, 0);
    const coverageDrop = (() => {
        const delta = coverage?.pct?.delta;
        if (typeof delta !== "number") {
            return null;
        }
        return delta < 0 ? Math.abs(delta) : 0;
    })();

    const hasRegression =
        newFailures > 0 || lintErrors > 0 || (coverageDrop ?? 0) > 0;

    return {
        newFailures,
        lintErrors,
        coverageDrop,
        hasRegression
    };
}

function compareSummaryReports({
    reports,
    outputDir = DEFAULT_OUTPUT_DIR,
    outputFile = DEFAULT_COMPARISON_FILE,
    now = new Date()
}) {
    if (!Array.isArray(reports) || reports.length < 2) {
        throw new CliUsageError(
            "Comparison requires at least two summary reports (base + targets)."
        );
    }

    const loaded = reports.map(({ label, filePath }) => {
        if (!label || typeof label !== "string") {
            throw new CliUsageError("Each report must have a non-empty label.");
        }
        if (!filePath || typeof filePath !== "string") {
            throw new CliUsageError(
                `Report ${label} is missing a file path to the summary.`
            );
        }
        const resolved = path.resolve(filePath);
        const data = ensureSummaryObject(readSummaryFile(resolved), {
            label,
            path: resolved
        });
        return { label, path: resolved, summary: data };
    });

    const [base, ...targets] = loaded;
    const comparisons = targets.map((target) => {
        const tests = buildTestsComparison(
            base.summary.tests,
            target.summary.tests
        );
        const coverage = buildCoverageComparison(
            base.summary.coverage,
            target.summary.coverage
        );
        const lint = buildLintComparison(
            base.summary.lint,
            target.summary.lint
        );
        const regressions = buildRegressionSummary({ tests, coverage, lint });

        return {
            base: base.label,
            target: target.label,
            tests,
            coverage,
            lint,
            regressions
        };
    });

    const comparison = {
        schemaVersion: SUMMARY_SCHEMA_VERSION,
        generatedAt: now.toISOString(),
        reports: loaded.map(({ label, path: reportPath, summary }) => ({
            label,
            path: reportPath,
            tests: summary.tests,
            coverage: summary.coverage,
            lint: summary.lint
        })),
        comparisons
    };

    const resolvedOutputDir = path.resolve(outputDir);
    const outputPath = path.join(resolvedOutputDir, outputFile);
    writeJsonFile(outputPath, comparison);

    return { outputPath, comparison };
}

function parseReportArguments(args) {
    return args.map((entry) => {
        const [label, filePath] = entry.split("=");
        if (!filePath) {
            throw new CliUsageError(
                `Invalid report specification "${entry}". Use <label>=<path>.`
            );
        }
        return { label: label.trim(), filePath: filePath.trim() };
    });
}

function executeCommand(command, { args, options }) {
    switch (command) {
        case undefined:
        case "summarize": {
            const inputDir = ensureStringOption(
                options.inputDir ?? options.input,
                {
                    name: "input",
                    defaultValue: DEFAULT_INPUT_DIR
                }
            );
            const outputDir = ensureStringOption(
                options.outputDir ?? options.output,
                {
                    name: "output",
                    defaultValue: DEFAULT_OUTPUT_DIR
                }
            );
            const outputFile = ensureStringOption(
                options.outputFile ?? options.file ?? DEFAULT_SUMMARY_FILE,
                {
                    name: "output-file",
                    defaultValue: DEFAULT_SUMMARY_FILE
                }
            );
            const { outputPath } = summarizeReports({
                inputDir,
                outputDir,
                outputFile
            });
            return { exitCode: 0, outputPath };
        }
        case "compare": {
            const reports = parseReportArguments(args);
            const outputDir = ensureStringOption(
                options.outputDir ?? options.output,
                {
                    name: "output",
                    defaultValue: DEFAULT_OUTPUT_DIR
                }
            );
            const outputFile = ensureStringOption(
                options.outputFile ?? options.file ?? DEFAULT_COMPARISON_FILE,
                {
                    name: "output-file",
                    defaultValue: DEFAULT_COMPARISON_FILE
                }
            );
            const { outputPath } = compareSummaryReports({
                reports,
                outputDir,
                outputFile
            });
            return { exitCode: 0, outputPath };
        }
        default: {
            throw new CliUsageError(`Unknown command: ${command}`);
        }
    }
}

const isMainModule = process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;

if (isMainModule) {
    const parsed = parseCommandLine(process.argv.slice(2));
    try {
        const result = executeCommand(parsed.command, parsed);
        if (typeof result?.exitCode === "number") {
            process.exitCode = result.exitCode;
        }
    } catch (error) {
        handleCliError(error, {
            prefix: "Failed to process regression reports.",
            exitCode: typeof error?.exitCode === "number" ? error.exitCode : 1
        });
    }
}

export {
    summarizeReports,
    compareSummaryReports,
    parseCommandLine,
    listFilesRecursive,
    readJUnitSuites,
    readCoverage,
    readCheckstyle
};
