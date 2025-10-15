#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const INDEX_FILE_PATTERN = /(^|\/)index\.(?:[cm]?jsx?|[cm]?ts|d\.ts)$/;
const STAR_EXPORT_PATTERN = /export\s*\*\s*from\s*['"][^'"]+['"]/g;
const NAMED_EXPORT_PATTERN = /export\s*{([^}]*)}/g;
const LARGE_EXPORT_THRESHOLD = 8;

function getRepoRoot() {
    return execSync("git rev-parse --show-toplevel", {
        encoding: "utf8"
    }).trim();
}

function getIndexFiles() {
    const files = execSync("git ls-files", { encoding: "utf8" })
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    return files.filter((file) => INDEX_FILE_PATTERN.test(file));
}

function analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const findings = [];

    const starExports = [...content.matchAll(STAR_EXPORT_PATTERN)];
    if (starExports.length > 0) {
        findings.push({
            type: "wildcard-re-export",
            occurrences: starExports.map((match) => match[0])
        });
    }

    const namedExportPattern = new RegExp(NAMED_EXPORT_PATTERN);
    const namedExports = [];
    let match;
    while ((match = namedExportPattern.exec(content)) !== null) {
        const body = match[1];
        const symbols = body
            .split(",")
            .map((symbol) => symbol.trim())
            .filter(Boolean)
            .map((symbol) => symbol.replace(/\sas\s.+$/, "").trim());
        if (symbols.length > 0) {
            namedExports.push({
                raw: match[0],
                symbols,
                count: symbols.length
            });
        }
    }

    const wideExports = namedExports.filter(
        (entry) => entry.count >= LARGE_EXPORT_THRESHOLD
    );
    if (wideExports.length > 0) {
        findings.push({
            type: "large-named-export",
            occurrences: wideExports
        });
    }

    return findings;
}

function formatReportEntry(file, findings) {
    const sections = findings.flatMap((finding) => {
        if (finding.type === "wildcard-re-export") {
            return [
                "- Re-exports entire modules with `export * from` statements:",
                ...finding.occurrences.map(
                    (occurrence) => `  - \`${occurrence}\``
                )
            ];
        }

        if (finding.type === "large-named-export") {
            return [
                "- Exports a wide surface area via named exports:",
                ...finding.occurrences.map((entry) => {
                    const sanitized = entry.raw.replaceAll(/\s+/g, " ");
                    return `  - ${entry.count} symbols exported in \`${sanitized}\`: ${entry.symbols.join(", ")}`;
                })
            ];
        }

        return [];
    });

    return ["### " + file, ...sections, ""].join("\n");
}

function writeReport(reportPath, entries) {
    const header = [
        "# Minimal Surface Audit",
        "",
        "The following index files have potentially broad public APIs. Consider narrowing the exports to the minimal surface area and marking remaining modules as internal/private.",
        ""
    ];

    const content = header.concat(entries).join("\n");
    fs.writeFileSync(reportPath, content, "utf8");
}

function main() {
    const args = process.argv.slice(2);
    const reportFlagIndex = args.indexOf("--report");
    const reportPath =
        reportFlagIndex !== -1 && args[reportFlagIndex + 1]
            ? args[reportFlagIndex + 1]
            : "minimal-surface-report.md";

    const repoRoot = getRepoRoot();
    const indexFiles = getIndexFiles();
    const entries = [];

    for (const file of indexFiles) {
        const findings = analyzeFile(path.join(repoRoot, file));
        if (findings.length > 0) {
            entries.push(formatReportEntry(file, findings));
        }
    }

    if (entries.length === 0) {
        const message = "No broad index exports found. No report generated.";
        console.log(message);
        fs.writeFileSync(reportPath, message + "\n", "utf8");
        return;
    }

    writeReport(reportPath, entries);
    console.log("Audit report written to " + reportPath);
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    try {
        main();
    } catch (error) {
        console.error("Failed to analyze minimal surface exports.");
        console.error(error);
        process.exit(1);
    }
}
