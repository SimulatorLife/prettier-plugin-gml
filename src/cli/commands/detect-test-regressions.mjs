import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
    assertArray,
    getErrorMessage,
    getErrorMessageOrFallback,
    getNonEmptyTrimmedString,
    hasOwn,
    isMissingModuleDependency,
    isNonEmptyString,
    isNonEmptyTrimmedString,
    isObjectLike,
    toArray,
    toTrimmedString
} from "../shared/dependencies.js";
import { CliUsageError, handleCliError } from "../core/errors.js";
import { ensureMap } from "../shared/dependencies.js";

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

const HTML_DOUBLE_QUOTE = '"';

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
        .replaceAll("&quot;", HTML_DOUBLE_QUOTE)
        .replaceAll("&amp;", "&");
}

function isMissingFastXmlParserError(error) {
    return isMissingModuleDependency(error, "fast-xml-parser");
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
        return;
    }

    if (Array.isArray(existing)) {
        existing.push(value);
        return;
    }

    parent[name] = [existing, value];
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
    return fs.readdirSync(resolvedPath).filter((file) => file.endsWith(".xml"));
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
            hasOwn(current, "testcase") ||
            hasOwn(current, "testsuite") ||
            hasOwn(current, "testsuites")
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
