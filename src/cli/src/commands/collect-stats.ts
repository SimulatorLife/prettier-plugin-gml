import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { Command } from "commander";

import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import { ensureDirSync } from "../shared/ensure-dir.js";
import { formatByteSizeDisplay } from "../shared/reporting/byte-format.js";

const ignoredDirectories = new Set(["node_modules", "dist", "generated", "vendor", "tmp"]);

type DirectoryTraversalOptions = {
    onFile: (filePath: string, entry: fs.Dirent) => void;
    shouldDescend?: (fullPath: string, entry: fs.Dirent) => boolean;
};

function traverseDirectoryEntries(root: string, options: DirectoryTraversalOptions) {
    if (!fs.existsSync(root)) {
        return;
    }
    const stack = [root];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
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

function getSourceFiles(dir: string) {
    const fileList: string[] = [];
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

function getBuildSize(dir: string) {
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

function scanProjectHealth(rootDir: string) {
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
        buildSize: formatByteSizeDisplay(totalBuildSize, {
            decimals: 2,
            separator: " ",
            invalidValue: "Invalid"
        })
    };
}

export function createCollectStatsCommand() {
    return applyStandardCommandOptions(
        new Command()
            .name("collect-stats")
            .description("Collect project health statistics (build size, TODOs, etc.)")
            .option("--output <path>", "Path to write the JSON report", "reports/project-health.json")
    );
}

export function runCollectStats({ command }: any = {}) {
    const options = command?.opts() || {};
    const workspaceRoot = process.env.GITHUB_WORKSPACE || process.cwd();
    const outputPath = options.output || path.join("reports", "project-health.json");

    const stats = scanProjectHealth(workspaceRoot);

    const outputDir = path.dirname(outputPath);
    ensureDirSync(outputDir);

    fs.writeFileSync(outputPath, JSON.stringify(stats, null, 2));
    console.log(`Project health stats written to ${outputPath}`);
}
