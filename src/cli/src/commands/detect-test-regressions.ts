import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { Core } from "@gml-modules/core";
import { CliUsageError, handleCliError } from "../cli-core/errors.js";
import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import { XMLParser } from "fast-xml-parser";

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

function hasAnyOwn(object, keys) {
    return keys.some((key) => Object.hasOwn(object, key));
}

function looksLikeTestCase(node) {
    if (!isObjectLike(node) || Array.isArray(node)) {
        return false;
    }

    if (hasAnyOwn(node, ["testcase", "testsuite"])) {
        return false;
    }

    if (!isNonEmptyTrimmedString(node.name)) {
        return false;
    }

    if (isNonEmptyTrimmedString(node.classname)) {
        return true;
    }

    if (
        hasAnyOwn(node, ["failure", "failures", "error", "errors", "skipped"])
    ) {
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
    const hasFailure =
        Object.hasOwn(testNode, "failure") ||
        Object.hasOwn(testNode, "failures") ||
        Object.hasOwn(testNode, "error") ||
        Object.hasOwn(testNode, "errors");
    if (hasFailure) {
        return "failed";
    }
    if (Object.hasOwn(testNode, "skipped")) {
        return "skipped";
    }
    return "passed";
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
    const shouldExtendSuitePath =
        normalizedSuiteName && (hasTestcase || hasTestsuite);

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

    cases.push({
        node,
        suitePath,
        key,
        status: computeStatus(node),
        displayName
    });
    return cases;
}

function collectTestCases(root) {
    const cases = [];
    const queue = createTestTraversalQueue(root);

    while (queue.length > 0) {
        const { node, suitePath } = queue.pop();
        if (!node) {
            continue;
        }

        if (Array.isArray(node)) {
            enqueueTraversalNodes(queue, node, suitePath);
            continue;
        }

        if (!isObjectLike(node)) {
            continue;
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
            enqueueTraversalNodes(
                queue,
                toArray(node.testsuite),
                nextSuitePath
            );
        }

        enqueueObjectLikeChildren(queue, node, nextSuitePath);
    }

    return cases;
}

function normalizeResultDirectories(candidateDirs, workspaceRoot) {
    return compactArray(toArray(candidateDirs)).map((candidate) => {
        const resolved = path.isAbsolute(candidate)
            ? candidate
            : path.join(workspaceRoot, candidate);
        return {
            resolved,
            display: path.relative(workspaceRoot, resolved) || resolved
        };
    });
}

function scanResultDirectory(directory) {
    if (!isExistingDirectory(directory.resolved)) {
        return { status: "missing", notes: [], cases: [] };
    }

    const xmlFiles = listXmlFiles(directory.resolved);
    if (xmlFiles.length === 0) {
        return { status: "empty", notes: [], cases: [] };
    }

    const { cases, notes } = collectDirectoryTestCases(directory, xmlFiles);

    if (cases.length === 0) {
        return { status: "empty", notes, cases: [] };
    }

    return { status: "found", notes, cases };
}

function isExistingDirectory(resolvedPath) {
    return (
        fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()
    );
}

function listXmlFiles(resolvedPath) {
    return fs.readdirSync(resolvedPath).filter((file) => file.endsWith(".xml"));
}

function collectDirectoryTestCases(directory, xmlFiles) {
    const aggregate = createTestCaseAggregate();

    for (const file of xmlFiles) {
        const displayPath = path.join(directory.display, file);
        const filePath = path.join(directory.resolved, file);
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
    if (readResult.status === "error") {
        return { cases: [], notes: [readResult.note] };
    }

    const xml = readResult.contents;
    if (!xml.trim()) {
        return { cases: [], notes: [] };
    }

    const parseResult = parseXmlTestCases(xml, displayPath);
    if (parseResult.status === "error") {
        return { cases: [], notes: [parseResult.note] };
    }

    if (parseResult.status === "ignored") {
        return {
            cases: [],
            notes: parseResult.note ? [parseResult.note] : []
        };
    }

    return { cases: parseResult.cases, notes: [] };
}

function readXmlFile(filePath, displayPath) {
    try {
        return { status: "ok", contents: fs.readFileSync(filePath, "utf8") };
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        return {
            status: "error",
            note: `Failed to read ${displayPath}: ${message}`
        };
    }
}

function parseXmlTestCases(xml, displayPath) {
    try {
        const data = parser.parse(xml);
        if (isCheckstyleDocument(data)) {
            return {
                status: "ignored",
                note: `Ignoring checkstyle report ${displayPath}; no test cases found.`
            };
        }
        if (!documentContainsTestElements(data)) {
            return {
                status: "error",
                note: `Parsed ${displayPath} but it does not contain any test suites or cases.`
            };
        }
        return { status: "ok", cases: collectTestCases(data) };
    } catch (error) {
        const message = getErrorMessageOrFallback(error);
        return {
            status: "error",
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

    return files.every(
        (file) => isObjectLike(file) && isNonEmptyTrimmedString(file.name)
    );
}

function documentContainsTestElements(document) {
    const queue = [document];

    while (queue.length > 0) {
        const current = queue.pop();

        if (Array.isArray(current)) {
            queue.push(...current);
            continue;
        }

        if (!isObjectLike(current)) {
            continue;
        }

        if (
            Object.hasOwn(current, "testcase") ||
            Object.hasOwn(current, "testsuite") ||
            Object.hasOwn(current, "testsuites")
        ) {
            return true;
        }

        for (const value of Object.values(current)) {
            queue.push(value);
        }
    }

    return false;
}

function recordTestCases(aggregates, testCases) {
    const { results, stats } = aggregates;

    for (const testCase of testCases) {
        results.set(testCase.key, testCase);
        stats.total += 1;

        if (testCase.status === "failed") {
            stats.failed += 1;
        } else if (testCase.status === "skipped") {
            stats.skipped += 1;
        } else {
            stats.passed += 1;
        }
    }
}

function createResultAggregates() {
    return {
        results: new Map(),
        stats: { total: 0, passed: 0, failed: 0, skipped: 0 }
    };
}

interface DetectTestResultsOptions {
    workspace?: string;
}

function readTestResults(
    candidateDirs,
    { workspace }: DetectTestResultsOptions = {}
) {
    const workspaceRoot =
        workspace || process.env.GITHUB_WORKSPACE || process.cwd();
    const directories = normalizeResultDirectories(
        candidateDirs,
        workspaceRoot
    );
    const aggregates = createResultAggregates();
    const notes = [];
    const missingDirs = [];
    const emptyDirs = [];

    for (const directory of directories) {
        const scan = scanResultDirectory(directory);

        if (scan.notes.length > 0) {
            notes.push(...scan.notes);
        }

        if (scan.status === "missing") {
            missingDirs.push(directory.display);
            continue;
        }

        if (scan.status === "empty") {
            emptyDirs.push(directory.display);
            continue;
        }

        recordTestCases(aggregates, scan.cases);

        return {
            ...aggregates,
            usedDir: directory.resolved,
            displayDir: directory.display,
            notes
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
        notes
    };
}

function shouldSkipRegressionDetection(baseStats, targetStats) {
    return (
        baseStats &&
        targetStats &&
        baseStats.total === targetStats.total &&
        targetStats.failed <= baseStats.failed
    );
}

/**
 * Normalize result-set inputs so downstream helpers can rely on Map semantics.
 */
function resolveResultsMap(resultSet) {
    const { results } = resultSet ?? {};
    return ensureMap(results);
}

function createRegressionRecord({ baseResults, key, targetRecord }) {
    if (!targetRecord || targetRecord.status !== "failed") {
        return null;
    }

    const baseRecord = baseResults.get(key);
    const baseStatus = baseRecord?.status;
    if (baseStatus === "failed") {
        return null;
    }

    return {
        key,
        from: baseStatus ?? "missing",
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
    if (!baseRecord || baseRecord.status !== "failed") {
        return null;
    }

    const targetRecord = targetResults.get(key);
    const targetStatus = targetRecord?.status;
    if (targetStatus === "failed") {
        return null;
    }

    return {
        key,
        from: baseRecord.status,
        to: targetStatus ?? "missing",
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
    if (
        shouldSkipRegressionDetection(baseResults?.stats, targetResults?.stats)
    ) {
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
    const fromLabel =
        regression.from === "missing" ? "missing" : regression.from;
    return `- ${descriptor} (${fromLabel} -> ${regression.to})`;
}

function buildResultCandidates(defaultCandidates, envVariable) {
    const candidates = [...defaultCandidates];
    const override = process.env[envVariable];
    if (override) {
        candidates.push(override);
    }
    return candidates;
}

function loadResultSets(workspaceRoot) {
    const baseCandidates = buildResultCandidates(
        [path.join("base", "reports"), "base-reports"],
        "BASE_RESULTS_DIR"
    );
    const mergeCandidates = buildResultCandidates(
        [path.join("merge", "reports"), "merge-reports"],
        "MERGE_RESULTS_DIR"
    );

    const base = readTestResults(baseCandidates, { workspace: workspaceRoot });
    const head = readTestResults(["reports"], {
        workspace: workspaceRoot
    });
    const merged = readTestResults(mergeCandidates, {
        workspace: workspaceRoot
    });

    return { base, head, merged };
}

function chooseTargetResultSet({ merged, head }) {
    const usingMerged = Boolean(merged.usedDir);
    const target = usingMerged ? merged : head;
    const targetLabel = usingMerged
        ? `synthetic merge (${merged.displayDir || "merge/reports"})`
        : `PR head (${head.displayDir || "reports"})`;

    return { target, targetLabel, usingMerged };
}

function announceTargetSelection({ usingMerged, targetLabel }) {
    if (usingMerged) {
        console.log(
            `Using synthetic merge test results for regression detection: ${targetLabel}.`
        );
        return;
    }

    console.log(
        "Synthetic merge test results were not found; falling back to PR head results."
    );
}

function logResultNotes(base, target) {
    for (const note of base.notes) {
        console.log(`[base] ${note}`);
    }
    for (const note of target.notes) {
        console.log(`[target] ${note}`);
    }
}

function ensureResultsAvailability(base, target) {
    if (!base.usedDir) {
        throw new CliUsageError(
            "Unable to locate base test results; regression detection cannot proceed."
        );
    }

    if (!target.usedDir) {
        throw new CliUsageError(
            "Unable to locate target test results; regression detection cannot proceed."
        );
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

function reportRegressionSummary(
    regressions,
    targetLabel,
    { resolvedFailures = [] } = {}
) {
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

export function createDetectTestRegressionsCommand() {
    return applyStandardCommandOptions(
        new Command()
            .name("detect-test-regressions")
            .description(
                "Detect test regressions by comparing JUnit XML reports."
            )
    );
}

export function runDetectTestRegressions() {
    const exitCode = runCli();
    if (exitCode !== 0) {
        process.exitCode = exitCode;
        throw new CliUsageError("Test regressions detected.");
    }
}

function runCli() {
    const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd();
    const { base, head, merged } = loadResultSets(workspaceRoot);
    const { target, targetLabel, usingMerged } = chooseTargetResultSet({
        merged,
        head
    });

    announceTargetSelection({ usingMerged, targetLabel });
    logResultNotes(base, target);
    ensureResultsAvailability(base, target);

    const regressions = detectRegressions(base, target);
    const resolvedFailures = detectResolvedFailures(base, target);
    const summary = reportRegressionSummary(regressions, targetLabel, {
        resolvedFailures
    });
    for (const line of summary.lines) {
        console.log(line);
    }

    return summary.exitCode;
}

const isMainModule = process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;

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
