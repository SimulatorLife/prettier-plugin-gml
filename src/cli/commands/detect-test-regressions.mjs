import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
    isNonEmptyTrimmedString,
    toTrimmedString
} from "../../shared/string-utils.js";
import { toArray } from "../../shared/array-utils.js";

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

const hasOwnProperty = Object.prototype.hasOwnProperty;

function hasOwn(object, key) {
    return hasOwnProperty.call(object, key);
}

function hasAnyOwn(object, keys) {
    return keys.some((key) => hasOwn(object, key));
}

function looksLikeTestCase(node) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
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

function decodeEntities(value) {
    if (typeof value !== "string" || value.length === 0) return value ?? "";
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
    if (!error || typeof error !== "object") return false;
    if (error.code !== "ERR_MODULE_NOT_FOUND") return false;
    if (typeof error.message === "string") {
        return error.message.includes("'fast-xml-parser'");
    }
    return false;
}

function createFallbackXmlParser() {
    return {
        parse(xml) {
            try {
                return parseXmlDocument(xml);
            } catch (innerError) {
                const message =
                    innerError && typeof innerError.message === "string"
                        ? innerError.message
                        : String(innerError);
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
    if (!source) return attributes;
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
        if (stack.length === 0) return;
        const target = stack.at(-1).value;
        const normalized = preserveWhitespace
            ? text
            : text.replaceAll(/\s+/g, " ").trim();
        if (!normalized) return;
        const decoded = decodeEntities(normalized);
        if (Object.prototype.hasOwnProperty.call(target, "#text")) {
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
        const trimmed = rawContent.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("/")) {
            if (stack.length === 0) continue;
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
        if (!content) continue;

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

function buildTestKey(testNode, suitePath) {
    const parts = [];
    const normalizedSuitePath = suitePath
        .map(normalizeSuiteName)
        .filter(Boolean);
    if (normalizedSuitePath.length > 0) {
        parts.push(...normalizedSuitePath);
    }
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
    const normalizedSuitePath = suitePath
        .map(normalizeSuiteName)
        .filter(Boolean);
    if (normalizedSuitePath.length > 0) {
        parts.push(...normalizedSuitePath);
    }
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
        Object.prototype.hasOwnProperty.call(testNode, "failure") ||
        Object.prototype.hasOwnProperty.call(testNode, "failures") ||
        Object.prototype.hasOwnProperty.call(testNode, "error") ||
        Object.prototype.hasOwnProperty.call(testNode, "errors");
    if (hasFailure) {
        return "failed";
    }
    if (Object.prototype.hasOwnProperty.call(testNode, "skipped")) {
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

        if (typeof node !== "object") {
            continue;
        }

        const hasTestcase = Object.prototype.hasOwnProperty.call(
            node,
            "testcase"
        );
        const hasTestsuite = Object.prototype.hasOwnProperty.call(
            node,
            "testsuite"
        );
        const normalizedSuiteName = normalizeSuiteName(node.name);
        const shouldExtendSuitePath =
            normalizedSuiteName && (hasTestcase || hasTestsuite);
        const nextSuitePath = shouldExtendSuitePath
            ? [...suitePath, normalizedSuiteName]
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

            if (!value || typeof value !== "object") {
                continue;
            }

            queue.push({ node: value, suitePath: nextSuitePath });
        }
    }

    return cases;
}

function normalizeResultDirectories(candidateDirs, workspaceRoot) {
    return (Array.isArray(candidateDirs) ? candidateDirs : [candidateDirs])
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

function scanResultDirectory({ resolved, display }) {
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return { status: "missing", notes: [], cases: [] };
    }

    const xmlFiles = fs
        .readdirSync(resolved)
        .filter((file) => file.endsWith(".xml"));
    if (xmlFiles.length === 0) {
        return { status: "empty", notes: [], cases: [] };
    }

    const notes = [];
    const cases = [];

    for (const file of xmlFiles) {
        const filePath = path.join(resolved, file);
        let xml = "";
        try {
            xml = fs.readFileSync(filePath, "utf8");
        } catch (error) {
            notes.push(
                `Failed to read ${path.join(display, file)}: ${error?.message}`
            );
            continue;
        }

        if (!xml.trim()) {
            continue;
        }

        try {
            const data = parser.parse(xml);
            cases.push(...collectTestCases(data));
        } catch (error) {
            notes.push(
                `Failed to parse ${path.join(display, file)}: ${error?.message}`
            );
        }
    }

    if (cases.length === 0) {
        return { status: "empty", notes, cases: [] };
    }

    return { status: "found", notes, cases };
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

function readTestResults(candidateDirs, { workspace } = {}) {
    const workspaceRoot =
        workspace || process.env.GITHUB_WORKSPACE || process.cwd();
    const directories = normalizeResultDirectories(
        candidateDirs,
        workspaceRoot
    );

    const notes = [];
    const aggregates = {
        results: new Map(),
        stats: { total: 0, passed: 0, failed: 0, skipped: 0 }
    };

    const missingDirs = [];
    const emptyDirs = [];

    for (const directory of directories) {
        const scan = scanResultDirectory(directory);
        notes.push(...scan.notes);

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

function detectRegressions(baseResults, targetResults) {
    const regressions = [];
    for (const [key, targetRecord] of targetResults.results.entries()) {
        if (!targetRecord || targetRecord.status !== "failed") continue;
        const baseRecord = baseResults.results.get(key);
        const baseStatus = baseRecord?.status;
        if (baseStatus === "failed") continue;
        regressions.push({
            key,
            from: baseStatus ?? "missing",
            to: targetRecord.status,
            detail: targetRecord
        });
    }
    return regressions;
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
        [path.join("base", "test-results"), "base-test-results"],
        "BASE_RESULTS_DIR"
    );
    const mergeCandidates = buildResultCandidates(
        [path.join("merge", "test-results"), "merge-test-results"],
        "MERGE_RESULTS_DIR"
    );

    const base = readTestResults(baseCandidates, { workspace: workspaceRoot });
    const head = readTestResults(["test-results"], {
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
        ? `synthetic merge (${merged.displayDir || "merge/test-results"})`
        : `PR head (${head.displayDir || "test-results"})`;

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
        console.log(
            "Unable to locate base test results; regression detection cannot proceed."
        );
        process.exit(1);
    }

    if (!target.usedDir) {
        console.log(
            "Unable to locate target test results; regression detection cannot proceed."
        );
        process.exit(1);
    }
}

function reportRegressionSummary(regressions, targetLabel) {
    if (regressions.length > 0) {
        console.log(
            `New failing tests detected (compared to base using ${targetLabel}):`
        );
        for (const regression of regressions) {
            console.log(formatRegression(regression));
        }
        process.exit(1);
        return;
    }

    console.log(`No new failing tests compared to base using ${targetLabel}.`);
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
    reportRegressionSummary(regressions, targetLabel);
}

const isMainModule = process.argv[1]
    ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
    : false;

if (isMainModule) {
    runCli();
}

export { collectTestCases, detectRegressions, readTestResults };
