import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { Core } from "@gml-modules/core";
import { CliUsageError, handleCliError } from "../cli-core/errors.js";
import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import { XMLParser } from "fast-xml-parser";
import { TestCaseStatus, ParseResultStatus, ScanStatus } from "../modules/quality-report/index.js";
import { formatByteSize } from "../shared/reporting/byte-format.js";

const {
    assertArray,
    compactArray,
    ensureMap,
    getErrorMessageOrFallback,
    isNonEmptyTrimmedString,
    isObjectLike,
    toArray,
    toTrimmedString
} = Core;

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ""
});

function hasAnyOwn(object: Record<string, unknown>, keys: string[]): boolean {
    return keys.some((key) => Object.hasOwn(object, key));
}

function looksLikeTestCase(node) {
    if (!isObjectLike(node) || Array.isArray(node)) {
        return false;
    }

    if (hasAnyOwn(node, ["testcase", "testsuite"])) {
        return false;
    }

    if (Object.hasOwn(node, "tests")) {
        return false;
    }

    if (!isNonEmptyTrimmedString(node.name)) {
        return false;
    }

    if (isNonEmptyTrimmedString(node.classname)) {
        return true;
    }

    if (hasAnyOwn(node, ["failure", "error", "skipped"])) {
        return true;
    }

    return hasAnyOwn(node, ["time", "duration", "elapsed"]);
}

function normalizeSuiteName(name) {
    return toTrimmedString(name);
}

function pushNormalizedSuiteSegments(target, segments) {
    const targetSegments = assertArray(target, {
        name: "target",
        errorMessage: "target must be an array"
    });
    const sourceSegments = toArray(segments);

    for (const segment of sourceSegments) {
        const normalized = normalizeSuiteName(segment);
        if (!normalized) {
            continue;
        }

        targetSegments.push(normalized);
    }

    return targetSegments;
}

function buildTestKey(testNode, suitePath) {
    const parts = [];
    pushNormalizedSuiteSegments(parts, suitePath);
    const className = toTrimmedString(testNode?.classname);
    if (className && (parts.length === 0 || parts.at(-1) !== className)) {
        parts.push(className);
    }
    const testName = toTrimmedString(testNode?.name);
    parts.push(testName || "(unnamed test)");
    return parts.join(" :: ");
}

function describeTestCase(testNode, suitePath) {
    const parts = [];
    pushNormalizedSuiteSegments(parts, suitePath);
    const testName = toTrimmedString(testNode?.name);
    if (testName) {
        parts.push(testName);
    }
    const file = toTrimmedString(testNode?.file);
    if (file) {
        return `${parts.join(" :: ")} [${file}]`;
    }
    return parts.join(" :: ");
}

function computeStatus(testNode) {
    const hasFailure = Object.hasOwn(testNode, "failure") || Object.hasOwn(testNode, "error");
    if (hasFailure) {
        return TestCaseStatus.FAILED;
    }
    if (Object.hasOwn(testNode, "skipped")) {
        return TestCaseStatus.SKIPPED;
    }
    return TestCaseStatus.PASSED;
}

function createTestTraversalQueue(root) {
    return [{ node: root, suitePath: [] }];
}

/**
 * Push all {@link nodes} onto the traversal queue with a shared suite path.
 *
 * Centralising the mutation keeps the orchestrator focused on sequencing.
 */
function enqueueTraversalNodes(queue, nodes, suitePath) {
    for (const child of nodes) {
        queue.push({ node: child, suitePath });
    }
    return queue;
}

function enqueueObjectLikeChildren(queue, node, suitePath) {
    for (const [key, value] of Object.entries(node)) {
        if (key === "testcase" || key === "testsuite") {
            continue;
        }

        if (!isObjectLike(value)) {
            continue;
        }

        queue.push({ node: value, suitePath });
    }
    return queue;
}

function resolveNextSuitePath(node, suitePath, { hasTestcase, hasTestsuite }) {
    const normalizedSuiteName = normalizeSuiteName(node?.name);
    const shouldExtendSuitePath = normalizedSuiteName && (hasTestcase || hasTestsuite);

    if (!shouldExtendSuitePath) {
        return suitePath;
    }

    return pushNormalizedSuiteSegments([...suitePath], normalizedSuiteName);
}

/**
 * Record a single testcase result in the aggregate list.
 */
function recordSuiteTestCase(cases, node, suitePath) {
    const key = buildTestKey(node, suitePath);
    const displayName = describeTestCase(node, suitePath) || key;
    const time = Number.parseFloat(node.time) || 0;

    cases.push({
        node,
        suitePath,
        key,
        status: computeStatus(node),
        displayName,
        time
    });
    return cases;
}

/**
 * Execute a visitor callback for each item in the traversal queue until exhausted
 * or the visitor signals early termination.
 *
 * Isolates the low-level queue iteration mechanics from high-level processing logic.
 *
 * @param queue - The traversal queue containing items to process
 * @param visitor - Callback invoked for each item; returns `true` to terminate early
 */
function processTraversalQueue<T>(queue: T[], visitor: (item: T, queue: T[]) => boolean | void): void {
    while (queue.length > 0) {
        const item = queue.pop();
        // Skip if undefined (defensive check for malformed queue entries)
        if (item === undefined) {
            continue;
        }
        const shouldTerminate = visitor(item, queue);
        if (shouldTerminate === true) {
            break;
        }
    }
}

function collectTestCases(root) {
    const cases = [];
    const queue = createTestTraversalQueue(root);

    processTraversalQueue(queue, ({ node, suitePath }, queue) => {
        if (!node) {
            return;
        }

        if (Array.isArray(node)) {
            enqueueTraversalNodes(queue, node, suitePath);
            return;
        }

        if (!isObjectLike(node)) {
            return;
        }

        const hasTestcase = Object.hasOwn(node, "testcase");
        const hasTestsuite = Object.hasOwn(node, "testsuite");
        const nextSuitePath = resolveNextSuitePath(node, suitePath, {
            hasTestcase,
            hasTestsuite
        });

        if (looksLikeTestCase(node)) {
            recordSuiteTestCase(cases, node, suitePath);
        }

        if (hasTestcase) {
            enqueueTraversalNodes(queue, toArray(node.testcase), nextSuitePath);
        }

        if (hasTestsuite) {
            enqueueTraversalNodes(queue, toArray(node.testsuite), nextSuitePath);
        }

        enqueueObjectLikeChildren(queue, node, nextSuitePath);
    });

    return cases;
}

function normalizeResultDirectories(candidateDirs, workspaceRoot) {
    return compactArray(toArray(candidateDirs)).map((candidate) => {
        const resolved = path.isAbsolute(candidate) ? candidate : path.join(workspaceRoot, candidate);
        return {
            resolved,
            display: path.relative(workspaceRoot, resolved) || resolved
        };
    });
}

function traverseDirectoryEntries(root, options) {
    if (!fs.existsSync(root)) {
        return;
    }
    const stack = [root];
    while (stack.length > 0) {
        const current = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            continue;
        }

        for (const entry of entries) {
            if (entry.name === "." || entry.name === "..") {
                continue;
            }
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (!options.shouldDescend || options.shouldDescend(fullPath, entry)) {
                    stack.push(fullPath);
                }
                continue;
            }
            options.onFile(fullPath, entry);
        }
    }
}

function listFilesRecursive(root) {
    const files = [];
    traverseDirectoryEntries(root, {
        onFile: (fullPath) => {
            files.push(fullPath);
        }
    });
    return files;
}

function readCoverage(lcovFiles) {
    if (lcovFiles.length === 0) {
        return null;
    }
    let found = 0;
    let hit = 0;
    for (const file of lcovFiles) {
        try {
            const text = fs.readFileSync(file, "utf8");
            for (const line of text.split(/\r?\n/)) {
                if (line.startsWith("LF:")) {
                    found += Number.parseInt(line.slice(3), 10) || 0;
                } else if (line.startsWith("LH:")) {
                    hit += Number.parseInt(line.slice(3), 10) || 0;
                }
            }
        } catch {
            // Ignore read errors when parsing LCOV files. If a coverage file is
            // malformed, missing, or unreadable, the function continues processing
            // with the coverage data it was able to parse so far. This resilience
            // ensures the quality report can still be generated even when some
            // coverage files are incomplete or corrupted.
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
        try {
            const xml = fs.readFileSync(file, "utf8");
            for (const match of xml.matchAll(/<error\b[^>]*severity="([^"]*)"/gi)) {
                const severity = (match[1] || "").toLowerCase();
                if (severity === "warning") {
                    warnings += 1;
                } else if (severity === "error") {
                    errors += 1;
                }
            }
        } catch {
            // Ignore read errors when parsing Checkstyle XML files. If a lint
            // report file is malformed, missing, or unreadable, the function
            // continues processing with the error/warning counts it was able to
            // parse so far. This resilience ensures the quality report can still
            // be generated even when some lint reports are incomplete or corrupted.
        }
    }
    return { warnings, errors };
}

function normalizeLocator(testCase) {
    const node = testCase?.node || {};
    const rawFile = typeof node.file === "string" ? node.file.trim() : "";
    if (rawFile) {
        return `file:${path.normalize(rawFile).replaceAll("\\", "/").toLowerCase()}`;
    }
    const className = typeof node.classname === "string" ? node.classname.trim() : "";
    if (className) {
        return `class:${className}`.toLowerCase();
    }
    if (Array.isArray(testCase?.suitePath) && testCase.suitePath.length > 0) {
        return `suite:${testCase.suitePath.join("::")}`.toLowerCase();
    }
    return null;
}

function computeTestDiff(baseResults, targetResults) {
    if (!baseResults?.usedDir || !targetResults?.usedDir) {
        return null;
    }

    const { newCases, removedCases } = collectCaseDifferences(baseResults, targetResults);

    const renameCount = countRenamedCases(newCases, removedCases);

    const adjustedNew = Math.max(0, newCases.length - renameCount);
    const adjustedRemoved = Math.max(0, removedCases.length - renameCount);

    return {
        newTests: adjustedNew,
        removedTests: adjustedRemoved,
        renamedTests: renameCount
    };
}

function collectCaseDifferences(baseResults, targetResults) {
    return {
        newCases: collectMissingCases(targetResults, baseResults),
        removedCases: collectMissingCases(baseResults, targetResults)
    };
}

function collectMissingCases(sourceResults, comparisonResults) {
    const missing = [];
    for (const [key, record] of sourceResults.results.entries()) {
        if (!comparisonResults.results.has(key)) {
            missing.push(record);
        }
    }
    return missing;
}

function countRenamedCases(newCases, removedCases) {
    const removedByLocator = createLocatorCounts(removedCases);

    let renameCount = 0;
    for (const record of newCases) {
        const locator = normalizeLocator(record);
        if (!locator) {
            continue;
        }

        const remaining = removedByLocator.get(locator);
        if (!remaining) {
            continue;
        }

        decrementLocatorCount(locator, removedByLocator);
        renameCount += 1;
    }

    return renameCount;
}

function createLocatorCounts(records) {
    const counts = new Map();
    for (const record of records) {
        const locator = normalizeLocator(record);
        if (!locator) {
            continue;
        }

        counts.set(locator, (counts.get(locator) || 0) + 1);
    }
    return counts;
}

function decrementLocatorCount(locator, store) {
    const next = (store.get(locator) || 0) - 1;
    if (next > 0) {
        store.set(locator, next);
    } else {
        store.delete(locator);
    }
}

function scanResultDirectory(directory, root) {
    if (!isExistingDirectory(directory.resolved)) {
        return {
            status: ScanStatus.MISSING,
            notes: [],
            cases: [],
            coverage: null,
            lint: null,
            duplicates: null,
            health: null
        };
    }

    const allFiles = listFilesRecursive(directory.resolved);
    const xmlFiles = allFiles.filter((file) => file.endsWith(".xml"));
    const lcovFiles = allFiles.filter((file) => path.basename(file) === "lcov.info");
    const checkstyleFiles = allFiles.filter((file) => /checkstyle/i.test(path.basename(file)));
    const jscpdFiles = allFiles.filter((file) => path.basename(file) === "jscpd-report.json");
    const healthFiles = allFiles.filter((file) => path.basename(file) === "project-health.json");

    if (xmlFiles.length === 0) {
        return {
            status: ScanStatus.EMPTY,
            notes: [],
            cases: [],
            coverage: null,
            lint: null,
            duplicates: null,
            health: null
        };
    }

    const { cases, notes } = collectDirectoryTestCases(xmlFiles, root);
    const coverage = readCoverage(lcovFiles);
    const lint = readCheckstyle(checkstyleFiles);
    const duplicates = readDuplicates(jscpdFiles);
    const health = readProjectHealth(healthFiles);

    if (cases.length === 0) {
        return {
            status: ScanStatus.EMPTY,
            notes,
            cases: [],
            coverage,
            lint,
            duplicates,
            health
        };
    }

    return {
        status: ScanStatus.FOUND,
        notes,
        cases,
        coverage,
        lint,
        duplicates,
        health
    };
}

function readDuplicates(files) {
    if (!files || files.length === 0) {
        return null;
    }
    const file = files[0];
    try {
        const content = fs.readFileSync(file, "utf8");
        const data = JSON.parse(content);
        return data.statistics?.total || null;
    } catch {
        return null;
    }
}

function readProjectHealth(files) {
    if (!files || files.length === 0) {
        return null;
    }
    const file = files[0];
    try {
        const content = fs.readFileSync(file, "utf8");
        return JSON.parse(content);
    } catch {
        return null;
    }
}

function isExistingDirectory(resolvedPath) {
    return fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory();
}

function collectDirectoryTestCases(xmlFiles, root) {
    const aggregate = createTestCaseAggregate();

    for (const filePath of xmlFiles) {
        const displayPath = path.relative(root || process.cwd(), filePath);
        const additions = collectTestCasesFromXmlFile(filePath, displayPath);

        mergeTestCaseAggregate(aggregate, additions);
    }

    return aggregate;
}

function createTestCaseAggregate() {
    return { cases: [], notes: [] };
}

/**
 * Merge the parsed test case results into the accumulating aggregate.
 *
 * Isolating the array mutations here ensures the directory collector only
 * sequences work instead of pushing elements directly.
 */
function mergeTestCaseAggregate(target, additions) {
    if (!additions) {
        return target;
    }

    const { cases = [], notes = [] } = additions;

    if (cases.length > 0) {
        target.cases.push(...cases);
    }

    if (notes.length > 0) {
        target.notes.push(...notes);
    }

    return target;
}

function collectTestCasesFromXmlFile(filePath, displayPath) {
    const readResult = readXmlFile(filePath, displayPath);
    if (readResult.status === ParseResultStatus.ERROR) {
        return { cases: [], notes: [readResult.note] };
    }

    const xml = readResult.contents;
    if (!xml.trim()) {
        return { cases: [], notes: [] };
    }

    const parseResult = parseXmlTestCases(xml, displayPath);
    if (parseResult.status === ParseResultStatus.ERROR) {
        return { cases: [], notes: [parseResult.note] };
    }

    if (parseResult.status === ParseResultStatus.IGNORED) {
        return {
            cases: [],
            notes: parseResult.note ? [parseResult.note] : []
        };
    }

    return { cases: parseResult.cases, notes: [] };
}

function readXmlFile(filePath, displayPath) {
    try {
        return { status: ParseResultStatus.OK, contents: fs.readFileSync(filePath, "utf8") };
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        return {
            status: ParseResultStatus.ERROR,
            note: `Failed to read ${displayPath}: ${message}`
        };
    }
}

function parseXmlTestCases(xml, displayPath) {
    try {
        const data = parser.parse(xml);
        if (isCheckstyleDocument(data)) {
            return {
                status: ParseResultStatus.IGNORED,
                note: `Ignoring checkstyle report ${displayPath}; no test cases found.`
            };
        }
        if (!documentContainsTestElements(data)) {
            return {
                status: ParseResultStatus.ERROR,
                note: `Parsed ${displayPath} but it does not contain any test suites or cases.`
            };
        }
        return { status: ParseResultStatus.OK, cases: collectTestCases(data) };
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        return {
            status: ParseResultStatus.ERROR,
            note: `Failed to parse ${displayPath}: ${message}`
        };
    }
}

function isCheckstyleDocument(document) {
    if (!isObjectLike(document) || Array.isArray(document)) {
        return false;
    }

    const root = document.checkstyle;
    if (!isObjectLike(root) || Array.isArray(root)) {
        return false;
    }

    if (hasAnyOwn(root, ["testsuite", "testcase"])) {
        return false;
    }

    const files = toArray(root.file);
    if (files.length === 0) {
        return true;
    }

    return files.every((file) => isObjectLike(file) && isNonEmptyTrimmedString(file.name));
}

function documentContainsTestElements(document) {
    const queue = [document];
    let found = false;

    processTraversalQueue(queue, (current, queueRef) => {
        if (Array.isArray(current)) {
            queueRef.push(...current);
            return;
        }

        if (!isObjectLike(current)) {
            return;
        }

        if (
            Object.hasOwn(current, "testcase") ||
            Object.hasOwn(current, "testsuite") ||
            Object.hasOwn(current, "testsuites")
        ) {
            found = true;
            return true; // Terminate early
        }

        for (const value of Object.values(current)) {
            queueRef.push(value);
        }
    });

    return found;
}

function recordTestCases(aggregates, testCases) {
    const { results, stats } = aggregates;

    for (const testCase of testCases) {
        results.set(testCase.key, testCase);
        stats.total += 1;
        stats.time += testCase.time || 0;

        if (testCase.status === TestCaseStatus.FAILED) {
            stats.failed += 1;
        } else if (testCase.status === TestCaseStatus.SKIPPED) {
            stats.skipped += 1;
        } else {
            stats.passed += 1;
        }
    }
}

function createResultAggregates() {
    return {
        results: new Map(),
        stats: { total: 0, passed: 0, failed: 0, skipped: 0, time: 0 }
    };
}

interface DetectTestResultsOptions {
    workspace?: string;
}

function readTestResults(candidateDirs, { workspace }: DetectTestResultsOptions = {}) {
    const workspaceRoot = workspace || process.env.GITHUB_WORKSPACE || process.cwd();
    const directories = normalizeResultDirectories(candidateDirs, workspaceRoot);
    const aggregates = createResultAggregates();
    const notes = [];
    const missingDirs = [];
    const emptyDirs = [];

    for (const directory of directories) {
        const scan = scanResultDirectory(directory, workspaceRoot);

        if (scan.notes.length > 0) {
            notes.push(...scan.notes);
        }

        if (scan.status === ScanStatus.MISSING) {
            missingDirs.push(directory.display);
            continue;
        }

        if (scan.status === ScanStatus.EMPTY) {
            emptyDirs.push(directory.display);
            continue;
        }

        recordTestCases(aggregates, scan.cases);

        let duplicates = scan.duplicates;
        if (!duplicates) {
            const parentFile = path.join(directory.resolved, "..", "jscpd-report.json");
            if (fs.existsSync(parentFile)) {
                duplicates = readDuplicates([parentFile]);
            }
        }

        return {
            ...aggregates,
            usedDir: directory.resolved,
            displayDir: directory.display,
            notes,
            coverage: scan.coverage,
            lint: scan.lint,
            duplicates,
            health: scan.health
        };
    }

    if (missingDirs.length === 1) {
        notes.push(`No directory found at ${missingDirs[0]}.`);
    } else if (missingDirs.length > 1) {
        notes.push(`No directory found at any of: ${missingDirs.join(", ")}.`);
    }

    if (emptyDirs.length === 1) {
        notes.push(`No JUnit XML files found in ${emptyDirs[0]}.`);
    } else if (emptyDirs.length > 1) {
        notes.push(`No JUnit XML files found in: ${emptyDirs.join(", ")}.`);
    }

    return {
        ...aggregates,
        usedDir: null,
        displayDir: "",
        notes,
        coverage: null,
        lint: null,
        duplicates: null,
        health: null
    };
}

function shouldSkipRegressionDetection(baseStats, targetStats) {
    return baseStats && targetStats && baseStats.total === targetStats.total && targetStats.failed <= baseStats.failed;
}

/**
 * Normalize result-set inputs so downstream helpers can rely on Map semantics.
 */
function resolveResultsMap(resultSet) {
    const { results } = resultSet ?? {};
    return ensureMap(results);
}

function createRegressionRecord({ baseResults, key, targetRecord }) {
    if (!targetRecord || targetRecord.status !== TestCaseStatus.FAILED) {
        return null;
    }

    const baseRecord = baseResults.get(key);
    const baseStatus = baseRecord?.status;
    if (baseStatus === TestCaseStatus.FAILED) {
        return null;
    }

    return {
        key,
        from: baseStatus ?? ScanStatus.MISSING,
        to: targetRecord.status,
        detail: targetRecord
    };
}

/**
 * Derive regression summaries for each failed target test case.
 */
function collectRegressions({ baseResults, targetResults }) {
    const regressions = [];

    for (const [key, targetRecord] of targetResults.entries()) {
        const regression = createRegressionRecord({
            baseResults,
            key,
            targetRecord
        });

        if (regression) {
            regressions.push(regression);
        }
    }

    return regressions;
}

function createResolvedFailureRecord({ baseResults, key, targetResults }) {
    const baseRecord = baseResults.get(key);
    if (!baseRecord || baseRecord.status !== TestCaseStatus.FAILED) {
        return null;
    }

    const targetRecord = targetResults.get(key);
    const targetStatus = targetRecord?.status;
    if (targetStatus === TestCaseStatus.FAILED) {
        return null;
    }

    return {
        key,
        from: baseRecord.status,
        to: targetStatus ?? ScanStatus.MISSING,
        detail: baseRecord
    };
}

/**
 * Derive records for historical failures that are no longer failing.
 */
function collectResolvedFailures({ baseResults, targetResults }) {
    const resolved = [];

    for (const key of baseResults.keys()) {
        const record = createResolvedFailureRecord({
            baseResults,
            key,
            targetResults
        });

        if (record) {
            resolved.push(record);
        }
    }

    return resolved;
}

function detectRegressions(baseResults, targetResults) {
    if (shouldSkipRegressionDetection(baseResults?.stats, targetResults?.stats)) {
        return [];
    }

    return collectRegressions({
        baseResults: resolveResultsMap(baseResults),
        targetResults: resolveResultsMap(targetResults)
    });
}

function detectResolvedFailures(baseResults, targetResults) {
    return collectResolvedFailures({
        baseResults: resolveResultsMap(baseResults),
        targetResults: resolveResultsMap(targetResults)
    });
}

function formatRegression(regression) {
    const descriptor = regression.detail?.displayName || regression.key;
    const fromLabel = regression.from === ScanStatus.MISSING ? "missing" : regression.from;
    return `- ${descriptor} (${fromLabel} -> ${regression.to})`;
}

function chooseTargetResultSet({ merged, head }) {
    const usingMerged = Boolean(merged.usedDir);
    const target = usingMerged ? merged : head;
    const targetLabel = usingMerged
        ? `synthetic merge (${merged.displayDir || "merge/reports"})`
        : `PR head (${head.displayDir || "reports"})`;

    return { target, targetLabel, usingMerged };
}

function ensureResultsAvailability(base, target) {
    if (!base.usedDir) {
        throw new CliUsageError("Unable to locate base test results; regression detection cannot proceed.");
    }

    if (!target.usedDir) {
        throw new CliUsageError("Unable to locate target test results; regression detection cannot proceed.");
    }
}

function appendRegressionContext(lines, resolvedFailures) {
    if (resolvedFailures.length === 0) {
        return lines;
    }

    const noun = resolvedFailures.length === 1 ? "test" : "tests";
    const verb = resolvedFailures.length === 1 ? "is" : "are";
    const hint =
        `${resolvedFailures.length} previously failing ${noun} ${verb} now ` +
        "passing or missing, so totals may appear unchanged.";
    return [...lines, `Note: ${hint}`];
}

function reportRegressionSummary(regressions, targetLabel, { resolvedFailures = [] } = {}) {
    if (regressions.length > 0) {
        const lines = [
            `New failing tests detected (compared to base using ${targetLabel}):`,
            ...regressions.map((regression) => formatRegression(regression))
        ];

        return {
            exitCode: 1,
            lines: appendRegressionContext(lines, resolvedFailures)
        };
    }

    return {
        exitCode: 0,
        lines: [`No new failing tests compared to base using ${targetLabel}.`]
    };
}

export function createGenerateQualityReportCommand() {
    return applyStandardCommandOptions(
        new Command()
            .name("generate-quality-report")
            .description("Generate a quality report (tests, lint, coverage, duplicates) and detect regressions.")
            .option("--base <path>", "Path to base reports")
            .option("--head <path>", "Path to head reports")
            .option("--merge <path>", "Path to merge reports")
            .option("--report-file <path>", "Path to write the report markdown file")
    );
}

export function runGenerateQualityReport({ command }: any = {}) {
    const options = command?.opts() || {};
    const exitCode = runCli(options);

    if (exitCode === 10) {
        return exitCode;
    }

    if (exitCode !== 0) {
        process.exitCode = exitCode;
        throw new CliUsageError("Test regressions detected.");
    }
}

function runCli(options: any = {}) {
    const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd();
    const reportFile = options.reportFile || path.join("reports", "summary-report.md");

    const baseDir = options.base ? [options.base] : [path.join("base", "reports"), "base-reports"];
    const headDir = options.head ? [options.head] : ["reports"];
    const mergeDir = options.merge ? [options.merge] : [path.join("merge", "reports"), "merge-reports"];

    const base = readTestResults(baseDir, { workspace: workspaceRoot });
    const head = readTestResults(headDir, { workspace: workspaceRoot });
    const merged = readTestResults(mergeDir, { workspace: workspaceRoot });

    const { target, usingMerged } = chooseTargetResultSet({
        merged,
        head
    });

    const diffStats = {
        base: base.usedDir ? { newTests: 0, removedTests: 0, renamedTests: 0 } : null,
        head: computeTestDiff(base, head),
        merge: computeTestDiff(base, merged)
    };

    const healthStats = scanProjectHealth(workspaceRoot);

    const testTableRows = [
        "#### Test Results",
        "",
        "| Target | Total | Passed | Failed | Skipped | New | Removed | Renamed | Duration | Coverage |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    ];

    const qualityTableRows = [
        "#### Code Quality",
        "",
        "| Target | Lint Warnings | Lint Errors | Duplicated Code | Build Size | Files > 1k LoC | TODOs |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"
    ];

    if (base.usedDir) {
        testTableRows.push(generateTestRow("Base", base, diffStats.base));
        qualityTableRows.push(generateQualityRow("Base", base));
    }
    if (head.usedDir) {
        let label = "PR (Head)";
        if (!base.usedDir && !merged.usedDir) {
            label = "Current";
            try {
                const branch = execSync("git rev-parse --abbrev-ref HEAD", {
                    encoding: "utf8"
                }).trim();
                if (branch) {
                    label = `Local (${branch})`;
                }
            } catch {
                // ignore
            }
        }
        testTableRows.push(generateTestRow(label, head, diffStats.head));
        qualityTableRows.push(generateQualityRow(label, head, healthStats));
    }
    if (merged.usedDir) {
        testTableRows.push(generateTestRow("Merged", merged, diffStats.merge));
        qualityTableRows.push(generateQualityRow("Merged", merged));
    }

    const table = [...testTableRows, "", ...qualityTableRows].join("\n");
    console.log(table);

    let exitCode = 0;
    let statusLine;

    if (base.usedDir && target.usedDir) {
        const regressions = detectRegressions(base, target);
        if (regressions.length > 0) {
            exitCode = 10;
            const cause = describeRegressionCause(regressions, diffStats[usingMerged ? "merge" : "head"]);
            const summary = summarizeRegressedTests(regressions);
            statusLine = `❌ Test regressions detected. ${summary}. Cause: ${cause}`;
        } else {
            statusLine = "✅ No test regressions detected.";
        }
    } else {
        statusLine = "⚠️ Unable to compare base and target results.";
    }

    console.log(`\n${statusLine}`);

    if (reportFile) {
        const reportContent = [
            "<!-- automerge-pr-test-summary -->",
            "### Quality Report Summary",
            "",
            table,
            "",
            statusLine
        ].join("\n");
        fs.writeFileSync(reportFile, reportContent);
    }

    return exitCode;
}

const isMainModule = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;

if (isMainModule) {
    try {
        const exitCode = runCli();
        if (typeof exitCode === "number") {
            process.exitCode = exitCode;
        }
    } catch (error) {
        handleCliError(error, {
            prefix: "Failed to detect test regressions.",
            exitCode: typeof error?.exitCode === "number" ? error.exitCode : 1
        });
    }
}

export {
    collectTestCases,
    detectRegressions,
    detectResolvedFailures,
    readTestResults,
    ensureResultsAvailability,
    reportRegressionSummary
};

const fmtCoverage = (data) => {
    if (!data || !Number.isFinite(data.pct)) {
        return "—";
    }
    return `${data.pct.toFixed(1)}%`;
};

const fmtTime = (s) =>
    !Number.isFinite(s) || s <= 0
        ? "—"
        : s < 1
          ? `${(s * 1000).toFixed(0)}ms`
          : s >= 60
            ? `${Math.floor(s / 60)}m ${(s - Math.floor(s / 60) * 60).toFixed(1)}s`
            : `${s.toFixed(2)}s`;

const fmtLintCount = (value) => (value == null ? "—" : `${value}`);

const fmtDuplicates = (data) => {
    if (!data) {
        return "—";
    }
    return `${data.percentage}% (${data.clones})`;
};

function formatDiffValue(value) {
    return value == null ? "—" : `${Math.max(0, value)}`;
}

function generateTestRow(label, results, diffStats) {
    const totals = results.stats || {};
    const hasAny = totals.total > 0;
    const coverageCell = fmtCoverage(results.coverage);
    const diff = diffStats
        ? {
              newTests: formatDiffValue(diffStats.newTests),
              removedTests: formatDiffValue(diffStats.removedTests),
              renamedTests: formatDiffValue(diffStats.renamedTests)
          }
        : { newTests: "—", removedTests: "—", renamedTests: "—" };

    if (!hasAny) {
        return `| ${label} | — | — | — | — | ${diff.newTests} | ${diff.removedTests} | ${diff.renamedTests} | — | ${coverageCell} |`;
    }
    return `| ${label} | ${totals.total} | ${totals.passed} | ${totals.failed} | ${totals.skipped} | ${diff.newTests} | ${diff.removedTests} | ${diff.renamedTests} | ${fmtTime(totals.time)} | ${coverageCell} |`;
}

function generateQualityRow(label, results, healthStats = null) {
    const stats = healthStats || results.health;
    const lintWarningsCell = fmtLintCount(results.lint?.warnings);
    const lintErrorsCell = fmtLintCount(results.lint?.errors);
    const duplicatesCell = fmtDuplicates(results.duplicates);
    const buildSizeCell = stats ? stats.buildSize : "—";
    const largeFilesCell = stats ? stats.largeFiles : "—";
    const todosCell = stats ? stats.todos : "—";

    return `| ${label} | ${lintWarningsCell} | ${lintErrorsCell} | ${duplicatesCell} | ${buildSizeCell} | ${largeFilesCell} | ${todosCell} |`;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    if (bytes < 0 || !Number.isFinite(bytes)) {
        return "Invalid";
    }
    return formatByteSize(bytes, { decimals: 2 });
}

function getSourceFiles(dir, fileList = []) {
    const ignoredDirectories = new Set(["node_modules", "dist", "generated", "vendor", "tmp"]);
    traverseDirectoryEntries(dir, {
        shouldDescend: (fullPath) => !ignoredDirectories.has(path.basename(fullPath)),
        onFile: (filePath) => {
            if (filePath.endsWith(".ts") && !filePath.endsWith(".d.ts")) {
                fileList.push(filePath);
            }
        }
    });
    return fileList;
}

function getBuildSize(dir) {
    let size = 0;
    traverseDirectoryEntries(dir, {
        onFile: (filePath) => {
            if (filePath.endsWith(".js")) {
                size += fs.statSync(filePath).size;
            }
        }
    });
    return size;
}

function scanProjectHealth(rootDir) {
    const srcDir = path.join(rootDir, "src");
    const srcFiles = getSourceFiles(srcDir);

    let largeFiles = 0;
    let todos = 0;

    for (const file of srcFiles) {
        const content = fs.readFileSync(file, "utf8");
        const lines = content.split("\n");

        if (lines.length > 1000) {
            largeFiles += 1;
        }

        todos += (content.match(/\b(TODO|FIXME|HACK)\b/g) || []).length;
    }

    let totalBuildSize = 0;
    if (fs.existsSync(srcDir)) {
        const packages = fs.readdirSync(srcDir);
        for (const pkg of packages) {
            const pkgDir = path.join(srcDir, pkg);
            if (fs.statSync(pkgDir).isDirectory()) {
                const distPath = path.join(pkgDir, "dist");
                totalBuildSize += getBuildSize(distPath);
            }
        }
    }

    return {
        largeFiles,
        todos,
        buildSize: formatBytes(totalBuildSize)
    };
}

function describeRegressionCause(regressions, diff) {
    if (!Core.isNonEmptyArray(regressions)) {
        return "";
    }

    const buckets = new Map();
    for (const item of regressions) {
        const fromKey = String(item?.from ?? ScanStatus.MISSING);
        buckets.set(fromKey, (buckets.get(fromKey) || 0) + 1);
    }

    const fragments = [];

    const addFragment = (count, singular, plural) => {
        if (count <= 0) {
            return;
        }
        fragments.push(count === 1 ? `1 ${singular}` : `${count} ${plural}`);
    };

    addFragment(
        buckets.get(ScanStatus.MISSING) || 0,
        "test is failing but was not present in base (added or renamed)",
        "tests are failing but were not present in base (added or renamed)"
    );

    addFragment(
        buckets.get(TestCaseStatus.PASSED) || 0,
        "test is now failing after passing in base",
        "tests are now failing after passing in base"
    );

    addFragment(
        buckets.get(TestCaseStatus.SKIPPED) || 0,
        "test is now failing after being skipped in base",
        "tests are now failing after being skipped in base"
    );

    for (const [fromKey, count] of buckets.entries()) {
        if (fromKey === ScanStatus.MISSING || fromKey === TestCaseStatus.PASSED || fromKey === TestCaseStatus.SKIPPED) {
            continue;
        }
        addFragment(
            count,
            `test is now failing after being ${fromKey} in base`,
            `tests are now failing after being ${fromKey} in base`
        );
    }

    if (diff?.renamedTests > 0) {
        addFragment(
            diff.renamedTests,
            "test appears to have been renamed compared to base",
            "tests appear to have been renamed compared to base"
        );
    }

    return fragments.join("; ");
}

function summarizeRegressedTests(regressions, limit = 5) {
    if (!Core.isNonEmptyArray(regressions)) {
        return "";
    }

    const descriptors = [];
    for (const item of regressions) {
        const descriptor = (item?.detail?.displayName || item?.key || "").trim();
        if (descriptor) {
            descriptors.push(descriptor);
        }
    }

    if (descriptors.length === 0) {
        return "";
    }

    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 5;
    const maxItems = Math.max(1, normalizedLimit);
    const visible = descriptors.slice(0, maxItems);
    const remaining = descriptors.length - visible.length;
    const label = descriptors.length === 1 ? "Impacted test" : "Impacted tests";
    const formatted = visible.map((name) => `\`${name}\``).join(", ");

    if (remaining > 0) {
        return `${label} (showing ${visible.length} of ${descriptors.length}): ${formatted}`;
    }

    return `${label}: ${formatted}`;
}
