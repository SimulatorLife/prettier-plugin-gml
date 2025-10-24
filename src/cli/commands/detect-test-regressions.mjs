import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
    getErrorMessage,
    getNonEmptyTrimmedString,
    hasOwn,
    isErrorWithCode,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    isObjectLike,
    toArray,
    toTrimmedString
} from "../lib/shared-deps.js";
import { CliUsageError, handleCliError } from "../lib/cli-errors.js";

let parser;

try {
    const { XMLParser } = await import("fast-xml-parser");
    parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: ""
    });
} catch (error) {
    if (isMissingFastXmlParserError(error)) {
        parser = createFallbackXmlParser();
    } else {
        throw error;
    }
}

function hasAnyOwn(object, keys) {
    return keys.some((key) => hasOwn(object, key));
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

function toFiniteNumber(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        const parsed = Number.parseFloat(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function decodeEntities(value) {
    if (!isNonEmptyString(value)) {
        return value ?? "";
    }
    return value
        .replaceAll(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
            String.fromCodePoint(Number.parseInt(hex, 16))
        )
        .replaceAll(/&#([0-9]+);/g, (_, dec) =>
            String.fromCodePoint(Number.parseInt(dec, 10))
        )
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&apos;", "'")
        .replaceAll("&quot;", '"')
        .replaceAll("&amp;", "&");
}

function isMissingFastXmlParserError(error) {
    if (!isErrorWithCode(error, "ERR_MODULE_NOT_FOUND")) {
        return false;
    }
    return getErrorMessage(error, { fallback: "" }).includes(
        "'fast-xml-parser'"
    );
}

function createFallbackXmlParser() {
    return {
        parse(xml) {
            try {
                return parseXmlDocument(xml);
            } catch (innerError) {
                const message = getErrorMessage(innerError, {
                    fallback: "Unknown error"
                });
                throw new Error(`Fallback XML parser failed: ${message}`);
            }
        }
    };
}

function attachChildNode(parent, name, value) {
    const existing = parent[name];
    if (existing === undefined) {
        parent[name] = value;
    } else if (Array.isArray(existing)) {
        existing.push(value);
    } else {
        parent[name] = [existing, value];
    }
}

function parseAttributes(source) {
    const attributes = {};
    if (!source) {
        return attributes;
    }
    const attributePattern = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let match;
    while ((match = attributePattern.exec(source))) {
        const name = match[1];
        const rawValue = match[3] ?? match[4] ?? "";
        attributes[name] = decodeEntities(rawValue);
    }
    return attributes;
}

function parseXmlDocument(xml) {
    if (typeof xml !== "string") {
        throw new TypeError("XML content must be a string.");
    }

    const root = {};
    const stack = [];
    let index = 0;

    function currentParent() {
        return stack.length > 0 ? stack.at(-1).value : root;
    }

    function appendText(text, { preserveWhitespace = false } = {}) {
        if (stack.length === 0) {
            return;
        }
        const target = stack.at(-1).value;
        const normalized = preserveWhitespace
            ? text
            : text.replaceAll(/\s+/g, " ").trim();
        if (!normalized) {
            return;
        }
        const decoded = decodeEntities(normalized);
        if (hasOwn(target, "#text")) {
            target["#text"] = preserveWhitespace
                ? target["#text"] + decoded
                : `${target["#text"]} ${decoded}`.trim();
        } else {
            target["#text"] = decoded;
        }
    }

    while (index < xml.length) {
        const nextTag = xml.indexOf("<", index);
        if (nextTag === -1) {
            appendText(xml.slice(index));
            break;
        }

        if (nextTag > index) {
            appendText(xml.slice(index, nextTag));
        }

        if (xml.startsWith("<!--", nextTag)) {
            const endComment = xml.indexOf("-->", nextTag + 4);
            if (endComment === -1) {
                throw new Error("Unterminated XML comment.");
            }
            index = endComment + 3;
            continue;
        }

        if (xml.startsWith("<![CDATA[", nextTag)) {
            const endCdata = xml.indexOf("]]>", nextTag + 9);
            if (endCdata === -1) {
                throw new Error("Unterminated CDATA section.");
            }
            appendText(xml.slice(nextTag + 9, endCdata), {
                preserveWhitespace: true
            });
            index = endCdata + 3;
            continue;
        }

        if (xml.startsWith("<?", nextTag)) {
            const endInstruction = xml.indexOf("?>", nextTag + 2);
            if (endInstruction === -1) {
                throw new Error("Unterminated processing instruction.");
            }
            index = endInstruction + 2;
            continue;
        }

        if (xml.startsWith("<!DOCTYPE", nextTag)) {
            const endDoctype = xml.indexOf(">", nextTag + 9);
            if (endDoctype === -1) {
                throw new Error("Unterminated DOCTYPE declaration.");
            }
            index = endDoctype + 1;
            continue;
        }

        const closingBracket = xml.indexOf(">", nextTag + 1);
        if (closingBracket === -1) {
            throw new Error("Unterminated XML tag.");
        }

        const rawContent = xml.slice(nextTag + 1, closingBracket);
        index = closingBracket + 1;
        const trimmed = getNonEmptyTrimmedString(rawContent);
        if (!trimmed) {
            continue;
        }

        if (trimmed.startsWith("/")) {
            if (stack.length === 0) {
                continue;
            }
            const closingName = trimmed.slice(1).trim();
            const last = stack.pop();
            if (closingName && last && last.name && closingName !== last.name) {
                throw new Error(
                    `Mismatched closing tag: expected </${last.name}>, received </${closingName}>.`
                );
            }
            continue;
        }

        const selfClosing = /\/\s*$/.test(trimmed);
        const content = selfClosing
            ? trimmed.replace(/\/\s*$/, "").trim()
            : trimmed;
        if (!content) {
            continue;
        }

        const nameMatch = content.match(/^([\w:.-]+)/);
        if (!nameMatch) {
            throw new Error(`Unable to parse XML tag: <${content}>.`);
        }
        const tagName = nameMatch[1];
        const attributeSource = content.slice(tagName.length).trim();
        const attributes = parseAttributes(attributeSource);
        const nodeValue =
            Object.keys(attributes).length > 0 ? { ...attributes } : {};
        const parent = currentParent();
        attachChildNode(parent, tagName, nodeValue);

        if (!selfClosing) {
            stack.push({ name: tagName, value: nodeValue });
        }
    }

    if (stack.length > 0) {
        throw new Error(`Unclosed XML tag: <${stack.at(-1).name}>.`);
    }

    return root;
}

function normalizeSuiteName(name) {
    return toTrimmedString(name);
}

function pushNormalizedSuiteSegments(target, segments) {
    if (!Array.isArray(target)) {
        throw new TypeError("target must be an array");
    }

    const sourceSegments = toArray(segments);

    for (const segment of sourceSegments) {
        const normalized = normalizeSuiteName(segment);
        if (!normalized) {
            continue;
        }

        target.push(normalized);
    }

    return target;
}

function buildTestKey(testNode, suitePath) {
    const parts = [];
    pushNormalizedSuiteSegments(parts, suitePath);
    const className = toTrimmedString(testNode.classname);
    if (className && (parts.length === 0 || parts.at(-1) !== className)) {
        parts.push(className);
    }
    const testName = toTrimmedString(testNode.name);
    parts.push(testName || "(unnamed test)");
    return parts.join(" :: ");
}

function describeTestCase(testNode, suitePath) {
    const parts = [];
    pushNormalizedSuiteSegments(parts, suitePath);
    const testName = toTrimmedString(testNode.name);
    if (testName) {
        parts.push(testName);
    }
    const file = toTrimmedString(testNode.file);
    if (file) {
        return `${parts.join(" :: ")} [${file}]`;
    }
    return parts.join(" :: ");
}

function computeStatus(testNode) {
    const hasFailure =
        hasOwn(testNode, "failure") ||
        hasOwn(testNode, "failures") ||
        hasOwn(testNode, "error") ||
        hasOwn(testNode, "errors");
    if (hasFailure) {
        return "failed";
    }
    if (hasOwn(testNode, "skipped")) {
        return "skipped";
    }
    return "passed";
}

function collectTestCases(root) {
    const cases = [];
    const queue = [{ node: root, suitePath: [] }];

    while (queue.length > 0) {
        const { node, suitePath } = queue.pop();
        if (!node) {
            continue;
        }

        if (Array.isArray(node)) {
            for (const child of node) {
                queue.push({ node: child, suitePath });
            }
            continue;
        }

        if (!isObjectLike(node)) {
            continue;
        }

        const hasTestcase = hasOwn(node, "testcase");
        const hasTestsuite = hasOwn(node, "testsuite");
        const normalizedSuiteName = normalizeSuiteName(node.name);
        const shouldExtendSuitePath =
            normalizedSuiteName && (hasTestcase || hasTestsuite);
        const nextSuitePath = shouldExtendSuitePath
            ? pushNormalizedSuiteSegments([...suitePath], normalizedSuiteName)
            : suitePath;

        if (looksLikeTestCase(node)) {
            const key = buildTestKey(node, suitePath);
            const displayName = describeTestCase(node, suitePath) || key;

            cases.push({
                node,
                suitePath,
                key,
                status: computeStatus(node),
                displayName
            });
        }

        if (hasTestcase) {
            for (const child of toArray(node.testcase)) {
                queue.push({ node: child, suitePath: nextSuitePath });
            }
        }

        if (hasTestsuite) {
            for (const child of toArray(node.testsuite)) {
                queue.push({ node: child, suitePath: nextSuitePath });
            }
        }

        for (const [key, value] of Object.entries(node)) {
            if (key === "testcase" || key === "testsuite") {
                continue;
            }

            if (!isObjectLike(value)) {
                continue;
            }

            queue.push({ node: value, suitePath: nextSuitePath });
        }
    }

    return cases;
}

function normalizeResultDirectories(candidateDirs, workspaceRoot) {
    return toArray(candidateDirs)
        .filter(Boolean)
        .map((candidate) => {
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
    return fs
        .readdirSync(resolvedPath)
        .filter(
            (file) => file.endsWith(".xml") && !/-summary\.xml$/i.test(file)
        );
}

function collectDirectoryTestCases(directory, xmlFiles) {
    const aggregate = { cases: [], notes: [] };

    for (const file of xmlFiles) {
        const displayPath = path.join(directory.display, file);
        const filePath = path.join(directory.resolved, file);
        const { cases, notes } = collectTestCasesFromXmlFile(
            filePath,
            displayPath
        );
        aggregate.cases.push(...cases);
        aggregate.notes.push(...notes);
    }

    return aggregate;
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
        return { cases: [], notes: [parseResult.note] };
    }

    return { cases: parseResult.cases, notes: [] };
}

function readXmlFile(filePath, displayPath) {
    try {
        return { status: "ok", contents: fs.readFileSync(filePath, "utf8") };
    } catch (error) {
        const message =
            getErrorMessage(error, { fallback: "" }) || "Unknown error";
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
        return { status: "ok", cases: collectTestCases(data) };
    } catch (error) {
        const message =
            getErrorMessage(error, { fallback: "" }) || "Unknown error";
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

function getTestCaseDurationSeconds(testCase) {
    const node = testCase?.node ?? {};
    const candidates = [node.time, node.duration, node.elapsed];

    for (const candidate of candidates) {
        const parsed = toFiniteNumber(candidate);
        if (parsed !== null) {
            return parsed;
        }
    }

    return null;
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

        const duration = getTestCaseDurationSeconds(testCase);
        if (duration !== null) {
            stats.duration += duration;
        }
    }
}

function createResultAggregates() {
    return {
        results: new Map(),
        stats: { total: 0, passed: 0, failed: 0, skipped: 0, duration: 0 }
    };
}

/**
 * Builds the shared state used while scanning candidate result directories.
 * @param {string[]|string} candidateDirs
 * @param {string} workspaceRoot
 */
function buildReadContext(candidateDirs, workspaceRoot) {
    return {
        directories: normalizeResultDirectories(candidateDirs, workspaceRoot),
        notes: [],
        aggregates: createResultAggregates(),
        missingDirs: [],
        emptyDirs: []
    };
}

function appendScanNotes(context, scan) {
    if (scan.notes.length === 0) {
        return;
    }
    context.notes.push(...scan.notes);
}

function handleMissingOrEmptyDirectory(context, directory, status) {
    const bucket =
        status === "missing" ? context.missingDirs : context.emptyDirs;
    bucket.push(directory.display);
}

function buildSuccessfulReadResult(context, directory) {
    return {
        ...context.aggregates,
        usedDir: directory.resolved,
        displayDir: directory.display,
        notes: context.notes
    };
}

function applyScanOutcome(context, directory, scan) {
    if (scan.status === "missing" || scan.status === "empty") {
        handleMissingOrEmptyDirectory(context, directory, scan.status);
        return null;
    }

    recordTestCases(context.aggregates, scan.cases);
    return buildSuccessfulReadResult(context, directory);
}

function pushAvailabilityNote(notes, entries, { single, multiple }) {
    const count = entries.length;

    if (count === 0) {
        return;
    }

    if (count === 1) {
        notes.push(single(entries[0]));
        return;
    }

    notes.push(multiple(entries));
}

function appendAvailabilityNotes(context) {
    const { missingDirs, emptyDirs, notes } = context;

    pushAvailabilityNote(notes, missingDirs, {
        single: (dir) => `No directory found at ${dir}.`,
        multiple: (dirs) => `No directory found at any of: ${dirs.join(", ")}.`
    });

    pushAvailabilityNote(notes, emptyDirs, {
        single: (dir) => `No JUnit XML files found in ${dir}.`,
        multiple: (dirs) => `No JUnit XML files found in: ${dirs.join(", ")}.`
    });
}

function buildUnavailableResult(context) {
    return {
        ...context.aggregates,
        usedDir: null,
        displayDir: "",
        notes: context.notes
    };
}

function readTestResults(candidateDirs, { workspace } = {}) {
    const workspaceRoot =
        workspace || process.env.GITHUB_WORKSPACE || process.cwd();
    const context = buildReadContext(candidateDirs, workspaceRoot);

    for (const directory of context.directories) {
        const scan = scanResultDirectory(directory);
        appendScanNotes(context, scan);
        const result = applyScanOutcome(context, directory, scan);
        if (result) {
            return result;
        }
    }

    appendAvailabilityNotes(context);
    return buildUnavailableResult(context);
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
    return results instanceof Map ? results : new Map();
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

function relativeToWorkspace(resolvedPath) {
    const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd();
    const relative = path.relative(workspaceRoot, resolvedPath);
    return relative && !relative.startsWith("..")
        ? relative || "."
        : resolvedPath;
}

function summarizeTestArtifacts(inputDir) {
    const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd();
    const testResults = readTestResults([inputDir], {
        workspace: workspaceRoot
    });
    const stats = testResults.stats ?? {};
    const duration = toFiniteNumber(stats.duration);

    const summary = {
        total: stats.total ?? 0,
        passed: stats.passed ?? 0,
        failed: stats.failed ?? 0,
        skipped: stats.skipped ?? 0,
        duration:
            duration !== null && duration > 0
                ? duration
                : stats.total > 0
                  ? 0
                  : null
    };

    const source = toTrimmedString(testResults.displayDir)
        ? testResults.displayDir
        : relativeToWorkspace(inputDir);

    return {
        summary,
        notes: Array.isArray(testResults.notes) ? [...testResults.notes] : [],
        source
    };
}

function parseCheckstyleSeverity(severity) {
    const normalized = toTrimmedString(severity)?.toLowerCase();
    if (!normalized) {
        return null;
    }
    if (normalized === "error" || normalized === "fatal") {
        return "error";
    }
    if (normalized === "warning" || normalized === "info") {
        return "warning";
    }
    return null;
}

function summarizeLintArtifacts(inputDir) {
    const reportPath = path.join(inputDir, "eslint-checkstyle.xml");
    const notes = [];
    const summary = { warnings: 0, errors: 0 };

    if (!fs.existsSync(reportPath)) {
        notes.push(
            `No lint report found at ${relativeToWorkspace(reportPath)}.`
        );
        return { summary, notes, source: relativeToWorkspace(reportPath) };
    }

    let xml;
    try {
        xml = fs.readFileSync(reportPath, "utf8");
    } catch (error) {
        const message =
            getErrorMessage(error, { fallback: "" }) || "Unknown error";
        notes.push(
            `Failed to read lint report at ${relativeToWorkspace(reportPath)}: ${message}`
        );
        return { summary, notes, source: relativeToWorkspace(reportPath) };
    }

    if (!xml.trim()) {
        notes.push(
            `Lint report at ${relativeToWorkspace(reportPath)} was empty.`
        );
        return { summary, notes, source: relativeToWorkspace(reportPath) };
    }

    try {
        const data = parser.parse(xml);
        const files = toArray(data?.checkstyle?.file);
        for (const file of files) {
            for (const error of toArray(file?.error)) {
                const severity = parseCheckstyleSeverity(error?.severity);
                if (severity === "error") {
                    summary.errors += 1;
                } else if (severity === "warning") {
                    summary.warnings += 1;
                }
            }
        }
    } catch (error) {
        const message =
            getErrorMessage(error, { fallback: "" }) || "Unknown error";
        notes.push(
            `Failed to parse lint report at ${relativeToWorkspace(reportPath)}: ${message}`
        );
    }

    return { summary, notes, source: relativeToWorkspace(reportPath) };
}

function parseLcovValue(line, prefix) {
    if (!line.startsWith(prefix)) {
        return null;
    }
    const value = Number.parseInt(line.slice(prefix.length), 10);
    return Number.isFinite(value) ? value : null;
}

function summarizeCoverageArtifacts(inputDir) {
    const coveragePath = path.join(inputDir, "lcov.info");
    const notes = [];
    const summary = { pct: null, covered: 0, total: 0 };

    if (!fs.existsSync(coveragePath)) {
        notes.push(
            `No coverage report found at ${relativeToWorkspace(coveragePath)}.`
        );
        return { summary, notes, source: relativeToWorkspace(coveragePath) };
    }

    let raw;
    try {
        raw = fs.readFileSync(coveragePath, "utf8");
    } catch (error) {
        const message =
            getErrorMessage(error, { fallback: "" }) || "Unknown error";
        notes.push(
            `Failed to read coverage report at ${relativeToWorkspace(coveragePath)}: ${message}`
        );
        return { summary, notes, source: relativeToWorkspace(coveragePath) };
    }

    const trimmed = raw.trim();
    if (!trimmed) {
        notes.push(
            `Coverage report at ${relativeToWorkspace(coveragePath)} was empty.`
        );
        return { summary, notes, source: relativeToWorkspace(coveragePath) };
    }

    let totalFound = 0;
    let totalHit = 0;
    for (const line of trimmed.split(/\r?\n/)) {
        const found = parseLcovValue(line, "LF:");
        if (found !== null) {
            totalFound += found;
            continue;
        }
        const hit = parseLcovValue(line, "LH:");
        if (hit !== null) {
            totalHit += hit;
        }
    }

    if (totalFound > 0) {
        summary.total = totalFound;
        summary.covered = totalHit;
        summary.pct = (totalHit / totalFound) * 100;
    } else {
        notes.push(
            `Coverage report at ${relativeToWorkspace(
                coveragePath
            )} did not contain any LF entries.`
        );
    }

    return { summary, notes, source: relativeToWorkspace(coveragePath) };
}

function dedupeStrings(values) {
    const seen = new Set();
    const result = [];
    for (const value of values || []) {
        const normalized = toTrimmedString(value);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

function buildSummaryReport({ inputDir, target } = {}) {
    const tests = summarizeTestArtifacts(inputDir);
    const lint = summarizeLintArtifacts(inputDir);
    const coverage = summarizeCoverageArtifacts(inputDir);

    return {
        generatedAt: new Date().toISOString(),
        target: target ?? null,
        inputDirectory: relativeToWorkspace(inputDir),
        tests: {
            ...tests.summary,
            notes: dedupeStrings(tests.notes),
            source: tests.source
        },
        lint: {
            ...lint.summary,
            notes: dedupeStrings(lint.notes),
            source: lint.source
        },
        coverage: {
            ...coverage.summary,
            notes: dedupeStrings(coverage.notes),
            source: coverage.source
        }
    };
}

function resolveOutputSpec({
    outputDir,
    outputFile,
    outputPath,
    defaultFile
} = {}) {
    if (isNonEmptyTrimmedString(outputPath)) {
        const resolvedPath = path.resolve(outputPath);
        return {
            dir: path.dirname(resolvedPath),
            file: path.basename(resolvedPath),
            path: resolvedPath
        };
    }

    if (isNonEmptyTrimmedString(outputDir)) {
        const resolvedDir = path.resolve(outputDir);
        const fileName = isNonEmptyTrimmedString(outputFile)
            ? outputFile
            : defaultFile;
        return {
            dir: resolvedDir,
            file: fileName,
            path: path.join(resolvedDir, fileName)
        };
    }

    return { dir: null, file: null, path: null };
}

function summarizeReports({
    inputDir,
    outputDir,
    outputFile,
    outputPath,
    target
} = {}) {
    if (!isNonEmptyTrimmedString(inputDir)) {
        throw new CliUsageError(
            "summarizeReports requires an input directory via --input."
        );
    }

    const resolvedInput = path.resolve(inputDir);
    const summary = buildSummaryReport({ inputDir: resolvedInput, target });
    const resolvedOutput = resolveOutputSpec({
        outputDir,
        outputFile,
        outputPath,
        defaultFile: "summary.json"
    });

    if (resolvedOutput.path) {
        fs.mkdirSync(resolvedOutput.dir, { recursive: true });
        fs.writeFileSync(
            resolvedOutput.path,
            `${JSON.stringify(summary, null, 2)}\n`
        );
    }

    return {
        summary,
        outputPath: resolvedOutput.path,
        inputDir: resolvedInput,
        outputDir: resolvedOutput.path ? resolvedOutput.dir : null
    };
}

function normalizeReportSpec(spec) {
    if (typeof spec === "string") {
        const index = spec.indexOf("=");
        if (index === -1) {
            throw new CliUsageError(
                "Report specifications must use the format <label>=<path>."
            );
        }
        const label = toTrimmedString(spec.slice(0, index));
        const file = toTrimmedString(spec.slice(index + 1));
        if (!label || !file) {
            throw new CliUsageError(
                "Report specifications must include both a label and a path."
            );
        }
        return { label, path: file };
    }

    if (spec && typeof spec === "object") {
        const label = toTrimmedString(spec.label ?? spec.name ?? spec.target);
        const file = toTrimmedString(spec.path ?? spec.file);
        if (!label || !file) {
            throw new CliUsageError(
                "Report specifications must include label and path properties."
            );
        }
        return { label, path: file };
    }

    throw new CliUsageError(
        "Invalid report specification; expected string or object."
    );
}

function loadSummaryReport(spec) {
    const resolvedPath = path.resolve(spec.path);
    const notes = [];
    let data = null;
    let ok = false;

    if (fs.existsSync(resolvedPath)) {
        try {
            const raw = fs.readFileSync(resolvedPath, "utf8");
            if (raw.trim()) {
                data = JSON.parse(raw);
                ok = true;
            } else {
                notes.push(
                    `Summary at ${relativeToWorkspace(resolvedPath)} was empty.`
                );
            }
        } catch (error) {
            const message =
                getErrorMessage(error, { fallback: "" }) || "Unknown error";
            notes.push(
                `Failed to read summary at ${relativeToWorkspace(
                    resolvedPath
                )}: ${message}`
            );
        }
    } else {
        notes.push(
            `Summary not found at ${relativeToWorkspace(resolvedPath)}.`
        );
    }

    return {
        label: spec.label,
        path: resolvedPath,
        data,
        ok,
        notes
    };
}

function collectSummaryNotesFromData(data) {
    if (!data || typeof data !== "object") {
        return [];
    }
    const buckets = [];
    for (const key of ["tests", "lint", "coverage"]) {
        const list = data[key]?.notes;
        if (Array.isArray(list)) {
            buckets.push(...list);
        }
    }
    if (Array.isArray(data.notes)) {
        buckets.push(...data.notes);
    }
    return dedupeStrings(buckets);
}

function positiveDifference(targetValue, baseValue) {
    const target = toFiniteNumber(targetValue) ?? 0;
    const base = toFiniteNumber(baseValue) ?? 0;
    const diff = target - base;
    return Math.max(diff, 0);
}

function positiveDrop(baseValue, targetValue) {
    const base = toFiniteNumber(baseValue);
    const target = toFiniteNumber(targetValue);
    if (base === null || target === null) {
        return null;
    }
    const diff = base - target;
    return Math.max(diff, 0);
}

function pickTestSnapshot(source = {}) {
    return {
        total: toFiniteNumber(source.total),
        passed: toFiniteNumber(source.passed),
        failed: toFiniteNumber(source.failed),
        skipped: toFiniteNumber(source.skipped),
        duration: toFiniteNumber(source.duration)
    };
}

function computeTestDelta(baseTests = {}, targetTests = {}) {
    const keys = ["total", "passed", "failed", "skipped", "duration"];
    const delta = {};
    for (const key of keys) {
        const base = toFiniteNumber(baseTests[key]);
        const target = toFiniteNumber(targetTests[key]);
        delta[key] =
            base === null && target === null
                ? null
                : (target ?? 0) - (base ?? 0);
    }
    return delta;
}

function pickLintSnapshot(source = {}) {
    return {
        warnings: toFiniteNumber(source.warnings),
        errors: toFiniteNumber(source.errors)
    };
}

function computeLintDelta(baseLint = {}, targetLint = {}) {
    return {
        warnings:
            (toFiniteNumber(targetLint.warnings) ?? 0) -
            (toFiniteNumber(baseLint.warnings) ?? 0),
        errors:
            (toFiniteNumber(targetLint.errors) ?? 0) -
            (toFiniteNumber(baseLint.errors) ?? 0)
    };
}

function pickCoverageSnapshot(source = {}) {
    return {
        pct: toFiniteNumber(source.pct),
        covered: toFiniteNumber(source.covered),
        total: toFiniteNumber(source.total)
    };
}

function computeCoverageDelta(baseCoverage = {}, targetCoverage = {}) {
    return {
        pct:
            (toFiniteNumber(targetCoverage.pct) ?? 0) -
            (toFiniteNumber(baseCoverage.pct) ?? 0),
        covered:
            (toFiniteNumber(targetCoverage.covered) ?? 0) -
            (toFiniteNumber(baseCoverage.covered) ?? 0),
        total:
            (toFiniteNumber(targetCoverage.total) ?? 0) -
            (toFiniteNumber(baseCoverage.total) ?? 0)
    };
}

function createSummaryComparison(baseReport, targetReport) {
    const baseData = baseReport.data ?? {};
    const targetData = targetReport.data ?? {};
    const baseTests = baseData.tests ?? {};
    const targetTests = targetData.tests ?? {};
    const baseLint = baseData.lint ?? {};
    const targetLint = targetData.lint ?? {};
    const baseCoverage = baseData.coverage ?? {};
    const targetCoverage = targetData.coverage ?? {};

    const newFailures = positiveDifference(
        targetTests.failed,
        baseTests.failed
    );
    const lintErrors = positiveDifference(targetLint.errors, baseLint.errors);
    const coverageDropValue = positiveDrop(
        baseCoverage.pct,
        targetCoverage.pct
    );

    const comparisonNotes = dedupeStrings([
        ...collectSummaryNotesFromData(baseData),
        ...collectSummaryNotesFromData(targetData),
        ...(baseReport.notes ?? []),
        ...(targetReport.notes ?? [])
    ]);

    return {
        base: baseReport.label,
        target: targetReport.label,
        regressions: {
            hasRegression:
                newFailures > 0 ||
                lintErrors > 0 ||
                (coverageDropValue ?? 0) > 0,
            newFailures,
            lintErrors,
            coverageDrop: coverageDropValue ?? 0
        },
        tests: {
            base: pickTestSnapshot(baseTests),
            target: pickTestSnapshot(targetTests),
            delta: computeTestDelta(baseTests, targetTests)
        },
        lint: {
            base: pickLintSnapshot(baseLint),
            target: pickLintSnapshot(targetLint),
            delta: computeLintDelta(baseLint, targetLint)
        },
        coverage: {
            base: pickCoverageSnapshot(baseCoverage),
            target: pickCoverageSnapshot(targetCoverage),
            delta: computeCoverageDelta(baseCoverage, targetCoverage)
        },
        notes: comparisonNotes
    };
}

function compareSummaryReports(
    reportSpecs,
    { outputDir, outputFile, outputPath } = {}
) {
    if (!Array.isArray(reportSpecs) || reportSpecs.length < 2) {
        throw new CliUsageError(
            "compareSummaryReports requires at least two labeled summaries."
        );
    }

    const normalized = reportSpecs.map((spec) => normalizeReportSpec(spec));
    const reports = normalized.map((spec) => loadSummaryReport(spec));
    const result = {
        generatedAt: new Date().toISOString(),
        reports: reports.map((report) => ({
            label: report.label,
            path: relativeToWorkspace(report.path),
            ok: report.ok,
            notes: [...report.notes]
        })),
        comparisons: [],
        notes: []
    };

    const base = reports[0];
    if (!base.ok) {
        result.notes.push(
            `Unable to read summary for base target '${base.label}'.`,
            ...base.notes
        );
    }

    for (let index = 1; index < reports.length; index += 1) {
        const target = reports[index];
        if (!target.ok) {
            result.notes.push(
                `Unable to read summary for target '${target.label}'.`,
                ...target.notes
            );
            continue;
        }
        if (!base.ok) {
            continue;
        }
        result.comparisons.push(createSummaryComparison(base, target));
    }

    result.notes = dedupeStrings(result.notes);

    const resolvedOutput = resolveOutputSpec({
        outputDir,
        outputFile,
        outputPath,
        defaultFile: "comparison.json"
    });

    if (resolvedOutput.path) {
        fs.mkdirSync(resolvedOutput.dir, { recursive: true });
        fs.writeFileSync(
            resolvedOutput.path,
            `${JSON.stringify(result, null, 2)}\n`
        );
    }

    return { report: result, outputPath: resolvedOutput.path };
}

function parseCommandLine(argv) {
    const args = Array.isArray(argv) ? argv.slice(2) : [];
    if (args.length === 0) {
        return { command: null, args: [] };
    }

    const [first, ...rest] = args;
    if (
        first === "summarize" ||
        first === "compare" ||
        first === "pr-summary-table-comment"
    ) {
        return { command: first, args: rest };
    }

    return { command: null, args };
}

function looksLikeOutputFile(value) {
    if (!isNonEmptyTrimmedString(value)) {
        return false;
    }
    const ext = path.extname(value);
    return Boolean(ext);
}

function parseSummarizeArgs(args) {
    const options = {
        inputDir: null,
        outputDir: null,
        outputFile: null,
        outputPath: null,
        target: null
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        switch (arg) {
            case "--input": {
                options.inputDir = args[index + 1];
                index += 1;

                break;
            }
            case "--output": {
                const value = args[index + 1];
                if (looksLikeOutputFile(value)) {
                    options.outputPath = value;
                } else {
                    options.outputDir = value;
                }
                index += 1;

                break;
            }
            case "--output-path":
            case "--comparison":
            case "--comparison-path": {
                options.outputPath = args[index + 1];
                index += 1;

                break;
            }
            case "--file":
            case "--output-file": {
                options.outputFile = args[index + 1];
                index += 1;

                break;
            }
            case "--target":
            case "--label": {
                options.target = args[index + 1];
                index += 1;

                break;
            }
            default: {
                throw new CliUsageError(`Unknown option for summarize: ${arg}`);
            }
        }
    }

    if (!isNonEmptyTrimmedString(options.inputDir)) {
        throw new CliUsageError("summarize requires --input <directory>.");
    }

    if (
        !isNonEmptyTrimmedString(options.outputDir) &&
        !isNonEmptyTrimmedString(options.outputPath)
    ) {
        throw new CliUsageError(
            "summarize requires --output <directory or file>."
        );
    }

    return options;
}

function parseCompareArgs(args) {
    const specs = [];
    let outputDir = null;
    let outputFile = null;
    let outputPath = null;

    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--output") {
            const value = args[index + 1];
            if (looksLikeOutputFile(value)) {
                outputPath = value;
            } else {
                outputDir = value;
            }
            index += 1;
            continue;
        }
        if (arg === "--output-path" || arg === "--comparison-path") {
            outputPath = args[index + 1];
            index += 1;
            continue;
        }
        if (arg === "--file" || arg === "--output-file") {
            outputFile = args[index + 1];
            index += 1;
            continue;
        }
        if (arg.startsWith("--")) {
            throw new CliUsageError(`Unknown option for compare: ${arg}`);
        }
        specs.push(arg);
    }

    if (specs.length < 2) {
        throw new CliUsageError(
            "compare requires at least two labeled summary paths."
        );
    }

    if (
        !isNonEmptyTrimmedString(outputDir) &&
        !isNonEmptyTrimmedString(outputPath)
    ) {
        throw new CliUsageError(
            "compare requires --output <directory or file>."
        );
    }

    return {
        reports: specs.map((spec) => normalizeReportSpec(spec)),
        outputDir,
        outputFile,
        outputPath
    };
}

function parseLegacyPrSummaryArgs(args) {
    const options = {
        workspace: null,
        comparison: null,
        summaryRoot: null,
        baseDir: null,
        headDir: null,
        mergeDir: null
    };
    const warnings = [];

    for (let index = 0; index < args.length; index += 1) {
        const token = args[index];
        if (!token.startsWith("--")) {
            warnings.push(
                `Ignoring positional argument '${token}' for pr-summary-table-comment.`
            );
            continue;
        }

        const eqIndex = token.indexOf("=");
        const name = eqIndex === -1 ? token.slice(2) : token.slice(2, eqIndex);
        const normalized = name.toLowerCase();
        let value = null;

        if (eqIndex === -1) {
            const next = args[index + 1];
            if (next && !next.startsWith("--")) {
                value = next;
                index += 1;
            }
        } else {
            value = token.slice(eqIndex + 1);
        }

        switch (normalized) {
            case "workspace": {
                options.workspace = value;
                break;
            }
            case "comparison":
            case "comparison-path":
            case "comparison-file":
            case "output":
            case "output-path":
            case "output-file": {
                options.comparison = value;
                break;
            }
            case "summary":
            case "summary-root":
            case "summary-dir":
            case "summary-output": {
                options.summaryRoot = value;
                break;
            }
            case "base":
            case "base-dir": {
                options.baseDir = value;
                break;
            }
            case "head":
            case "head-dir": {
                options.headDir = value;
                break;
            }
            case "merge":
            case "merge-dir": {
                options.mergeDir = value;
                break;
            }
            default: {
                warnings.push(
                    `Unknown option '--${normalized}' for pr-summary-table-comment.`
                );
            }
        }
    }

    return { options, warnings };
}

function resolveMaybeRelativePath(filePath, workspaceRoot) {
    if (!isNonEmptyTrimmedString(filePath)) {
        return null;
    }
    return path.isAbsolute(filePath)
        ? path.normalize(filePath)
        : path.resolve(workspaceRoot, filePath);
}

function writeJsonFile(filePath, data) {
    if (!isNonEmptyTrimmedString(filePath)) {
        return null;
    }

    const resolvedPath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, `${JSON.stringify(data, null, 2)}\n`);
    return resolvedPath;
}

function computeComparisonStatus(report) {
    const comparisons = report?.comparisons;
    if (!Array.isArray(comparisons) || comparisons.length === 0) {
        return { status: "error", allGreen: false };
    }

    const hasRegression = comparisons.some(
        (entry) => entry?.regressions?.hasRegression
    );

    return {
        status: hasRegression ? "regressions" : "clean",
        allGreen: !hasRegression
    };
}

function formatLegacyNumber(value) {
    return typeof value === "number" && Number.isFinite(value)
        ? value.toLocaleString("en-US")
        : "—";
}

function formatLegacyCoverage(coverage) {
    const pct = coverage?.pct;
    if (typeof pct === "number" && Number.isFinite(pct)) {
        return `${pct.toFixed(1)}%`;
    }
    return "—";
}

function formatLegacyDuration(seconds) {
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
        return `${seconds.toFixed(1)}s`;
    }
    return "—";
}

function buildLegacySummaryComment({
    summaries,
    comparisons,
    status,
    allGreen
}) {
    const lines = [];
    if (summaries.length > 0) {
        lines.push(
            "| Target | Total | Passed | Failed | Skipped | Lint warnings | Lint errors | Coverage | Duration |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
        );

        for (const entry of summaries) {
            const tests = entry.summary?.tests ?? {};
            const lint = entry.summary?.lint ?? {};
            const coverage = entry.summary?.coverage ?? {};

            lines.push(
                `| ${entry.title} | ${formatLegacyNumber(
                    tests.total
                )} | ${formatLegacyNumber(tests.passed)} | ${formatLegacyNumber(
                    tests.failed
                )} | ${formatLegacyNumber(tests.skipped)} | ${formatLegacyNumber(
                    lint.warnings
                )} | ${formatLegacyNumber(lint.errors)} | ${formatLegacyCoverage(
                    coverage
                )} | ${formatLegacyDuration(tests.duration)} |`
            );
        }

        lines.push("");
    }

    lines.push(`Status: **${status}** (all green: ${allGreen})`);

    const regressionSummaries = (comparisons || [])
        .filter((entry) => entry?.regressions)
        .map((entry) => {
            const reg = entry.regressions;
            const details = [];
            if (reg.newFailures > 0) {
                details.push(
                    `${reg.newFailures} new failing test${
                        reg.newFailures === 1 ? "" : "s"
                    }`
                );
            }
            if (reg.lintErrors > 0) {
                details.push(
                    `${reg.lintErrors} additional lint error${
                        reg.lintErrors === 1 ? "" : "s"
                    }`
                );
            }
            if (typeof reg.coverageDrop === "number" && reg.coverageDrop > 0) {
                details.push(
                    `coverage dropped by ${reg.coverageDrop.toFixed(1)} pts`
                );
            }

            const suffix = details.length > 0 ? ` (${details.join(", ")})` : "";
            return `- **${entry.base} → ${entry.target}**: ${
                reg.hasRegression ? "regressions detected" : "no regressions"
            }${suffix}`;
        });

    if (regressionSummaries.length > 0) {
        lines.push("", "Regression summary:", ...regressionSummaries);
    }

    return lines.join("\n");
}

function runLegacyPrSummaryCommand(args) {
    const { options, warnings } = parseLegacyPrSummaryArgs(args);
    for (const warning of warnings) {
        console.warn(`[pr-summary-table-comment] ${warning}`);
    }

    const workspaceRoot =
        resolveMaybeRelativePath(
            options.workspace,
            process.env.GITHUB_WORKSPACE || process.cwd()
        ) ||
        process.env.GITHUB_WORKSPACE ||
        process.cwd();

    const summaryRoot =
        resolveMaybeRelativePath(options.summaryRoot, workspaceRoot) ||
        workspaceRoot;

    const baseCandidates = buildResultCandidates(
        [
            ...(isNonEmptyTrimmedString(options.baseDir)
                ? [options.baseDir]
                : []),
            path.join("base", "reports"),
            "base-reports"
        ],
        "BASE_RESULTS_DIR"
    );
    const headCandidates = [
        ...(isNonEmptyTrimmedString(options.headDir) ? [options.headDir] : []),
        "reports"
    ];
    const mergeCandidates = buildResultCandidates(
        [
            ...(isNonEmptyTrimmedString(options.mergeDir)
                ? [options.mergeDir]
                : []),
            path.join("merge", "reports"),
            "merge-reports"
        ],
        "MERGE_RESULTS_DIR"
    );

    const base = readTestResults(baseCandidates, { workspace: workspaceRoot });
    const head = readTestResults(headCandidates, { workspace: workspaceRoot });
    const merged = readTestResults(mergeCandidates, {
        workspace: workspaceRoot
    });

    const targets = [
        { label: "base", title: "Base", results: base },
        { label: "head", title: "PR head", results: head },
        { label: "merge", title: "Merged (base+PR)", results: merged }
    ];

    const summaries = [];
    for (const target of targets) {
        if (!target.results.usedDir) {
            continue;
        }

        const summaryDir = path.join(summaryRoot, `junit-${target.label}`);
        const { summary, outputPath } = summarizeReports({
            inputDir: target.results.usedDir,
            outputDir: summaryDir,
            target: target.label
        });

        summaries.push({
            label: target.label,
            title: target.title,
            summary,
            outputPath
        });

        if (outputPath) {
            console.log(
                `[pr-summary-table-comment] Wrote summary for ${
                    target.label
                } to ${formatDisplayPath(outputPath)}.`
            );
        }

        for (const note of summary.tests?.notes ?? []) {
            console.log(
                `[pr-summary-table-comment] note for ${target.label}: ${note}`
            );
        }
        for (const note of summary.lint?.notes ?? []) {
            console.log(
                `[pr-summary-table-comment] note for ${target.label}: ${note}`
            );
        }
        for (const note of summary.coverage?.notes ?? []) {
            console.log(
                `[pr-summary-table-comment] note for ${target.label}: ${note}`
            );
        }
    }

    if (summaries.length === 0) {
        console.warn(
            "[pr-summary-table-comment] No test summaries were generated; unable to produce a comparison report."
        );
    }

    const comparisonDefault = path.join("reports", "comparison.json");
    const comparisonPath =
        resolveMaybeRelativePath(options.comparison, workspaceRoot) ||
        path.resolve(workspaceRoot, comparisonDefault);

    const baseSummary = summaries.find((entry) => entry.label === "base");
    const targetSummaries = summaries.filter((entry) => entry.label !== "base");

    let comparisonResult;
    if (baseSummary && targetSummaries.length > 0) {
        const specs = [baseSummary, ...targetSummaries].map((entry) => ({
            label: entry.label,
            path: entry.outputPath
        }));

        comparisonResult = compareSummaryReports(specs, {
            outputPath: comparisonPath
        });
    } else {
        const reason = baseSummary
            ? "Unable to generate comparisons because no additional summaries were produced."
            : "Unable to generate comparisons because the base summary is missing.";
        const reports = summaries.map((entry) => ({
            label: entry.label,
            path: entry.outputPath
                ? relativeToWorkspace(path.resolve(entry.outputPath))
                : "",
            ok: Boolean(entry.outputPath),
            notes: []
        }));
        const stub = {
            generatedAt: new Date().toISOString(),
            reports,
            comparisons: [],
            notes: dedupeStrings([reason])
        };

        comparisonResult = {
            report: stub,
            outputPath: writeJsonFile(comparisonPath, stub)
        };
    }

    if (comparisonResult.outputPath) {
        console.log(
            `[pr-summary-table-comment] Wrote comparison report to ${formatDisplayPath(
                comparisonResult.outputPath
            )}.`
        );
    }

    const { status, allGreen } = computeComparisonStatus(
        comparisonResult.report
    );
    const comment = buildLegacySummaryComment({
        summaries,
        comparisons: comparisonResult.report?.comparisons ?? [],
        status,
        allGreen
    });

    if (comment) {
        console.log(comment);
    }

    return 0;
}

function formatDisplayPath(filePath) {
    if (!filePath) {
        return "";
    }
    const relative = relativeToWorkspace(path.resolve(filePath));
    return relative || filePath;
}

function runSummarizeCommand(args) {
    const options = parseSummarizeArgs(args);
    const { summary, outputPath } = summarizeReports(options);

    const tests = summary.tests ?? {};
    const lint = summary.lint ?? {};
    const coverage = summary.coverage ?? {};

    const coverageDisplay = Number.isFinite(coverage.pct)
        ? `${coverage.pct.toFixed(1)}%`
        : "—";

    console.log(
        `[summarize] tests=${tests.total ?? 0} (failed=${tests.failed ?? 0}, skipped=${tests.skipped ?? 0}) | ` +
            `lint errors=${lint.errors ?? 0}, warnings=${lint.warnings ?? 0} | coverage=${coverageDisplay}`
    );

    if (outputPath) {
        console.log(
            `[summarize] Wrote summary to ${formatDisplayPath(outputPath)}.`
        );
    }

    const notes = collectSummaryNotesFromData(summary);
    for (const note of notes) {
        console.log(`[summarize] note: ${note}`);
    }

    return 0;
}

function runCompareCommand(args) {
    const {
        reports,
        outputDir,
        outputFile,
        outputPath: outputSpec
    } = parseCompareArgs(args);
    const { report, outputPath } = compareSummaryReports(reports, {
        outputDir,
        outputFile,
        outputPath: outputSpec
    });

    if (report.comparisons.length === 0) {
        console.warn("[compare] No comparisons were generated.");
    } else {
        for (const comparison of report.comparisons) {
            const regressions = comparison.regressions ?? {};
            const status = regressions.hasRegression ? "regressions" : "clean";
            const coverageDrop = Number.isFinite(regressions.coverageDrop)
                ? regressions.coverageDrop.toFixed(1)
                : "0.0";
            console.log(
                `[compare] ${comparison.base} -> ${comparison.target}: ${status} ` +
                    `(newFailures=${regressions.newFailures ?? 0}, lintErrors=${regressions.lintErrors ?? 0}, coverageDrop=${coverageDrop}).`
            );
            for (const note of comparison.notes ?? []) {
                console.log(
                    `[compare] note for ${comparison.base} -> ${comparison.target}: ${note}`
                );
            }
        }
    }

    const globalNotes = dedupeStrings([
        ...report.notes,
        ...report.reports.flatMap((entry) => entry.notes ?? [])
    ]);
    for (const note of globalNotes) {
        console.log(`[compare] note: ${note}`);
    }

    if (outputPath) {
        console.log(
            `[compare] Wrote comparison report to ${formatDisplayPath(outputPath)}.`
        );
    }

    return 0;
}

function runCli(argv = process.argv) {
    const { command, args } = parseCommandLine(argv);
    if (command === "summarize") {
        return runSummarizeCommand(args);
    }
    if (command === "compare") {
        return runCompareCommand(args);
    }
    if (command === "pr-summary-table-comment") {
        return runLegacyPrSummaryCommand(args);
    }
    if (args.length > 0) {
        const details = args.map((arg) => `'${arg}'`).join(", ");
        const suffix = args.length === 1 ? "" : "s";
        console.warn(
            `[detect-test-regressions] Ignoring ${args.length} legacy CLI argument${suffix}: ${details}.`
        );
    }
    return runRegressionDetectionCli();
}

function runRegressionDetectionCli() {
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
            prefix: "Failed to run detect-test-regressions CLI.",
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
    reportRegressionSummary,
    summarizeReports,
    compareSummaryReports
};
