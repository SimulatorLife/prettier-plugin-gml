#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

    const indexPattern = /(^|\/)index\.(?:[cm]?jsx?|[cm]?ts|d\.ts)$/;
    return files.filter((file) => indexPattern.test(file));
}

function analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    const findings = [];

    const starExports = [
        ...content.matchAll(/export\s*\*\s*from\s*['"][^'"]+['"]/g)
    ];
    if (starExports.length > 0) {
        findings.push({
            type: "wildcard-re-export",
            occurrences: starExports.map((match) => match[0])
        });
    }

    const namedExportRegex = /export\s*{([^}]*)}/g;
    const namedExports = [];
    let match;
    while ((match = namedExportRegex.exec(content)) !== null) {
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

    const threshold = 8;
    const wideExports = namedExports.filter(
        (entry) => entry.count >= threshold
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
    const lines = ["### " + file];
    findings.forEach((finding) => {
        if (finding.type === "wildcard-re-export") {
            lines.push(
                "- Re-exports entire modules with `export * from` statements:"
            );
            finding.occurrences.forEach((occurrence) => {
                lines.push("  - `" + occurrence + "`");
            });
        }

        if (finding.type === "large-named-export") {
            lines.push("- Exports a wide surface area via named exports:");
            finding.occurrences.forEach((entry) => {
                const sanitized = entry.raw.replace(/\s+/g, " ");
                lines.push(
                    "  - " +
                        entry.count +
                        " symbols exported in `" +
                        sanitized +
                        "`:" +
                        " " +
                        entry.symbols.join(", ")
                );
            });
        }
    });

    lines.push("");
    return lines.join("\n");
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

    indexFiles.forEach((file) => {
        const findings = analyzeFile(path.join(repoRoot, file));
        if (findings.length > 0) {
            entries.push(formatReportEntry(file, findings));
        }
    });

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
