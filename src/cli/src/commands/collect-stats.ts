import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Command } from "commander";
import { applyStandardCommandOptions } from "../cli-core/command-standard-options.js";
import { ensureDirSync } from "../shared/ensure-dir.js";

function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getSourceFiles(dir: string, fileList: string[] = []) {
    if (!fs.existsSync(dir)) {
        return fileList;
    }
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (
                file !== "node_modules" &&
                file !== "dist" &&
                file !== "generated" &&
                file !== "vendor" &&
                file !== "tmp"
            ) {
                getSourceFiles(filePath, fileList);
            }
        } else if (file.endsWith(".ts") && !file.endsWith(".d.ts")) {
            fileList.push(filePath);
        }
    }
    return fileList;
}

function getBuildSize(dir: string) {
    let size = 0;
    if (!fs.existsSync(dir)) {
        return 0;
    }

    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            size += getBuildSize(filePath);
        } else if (file.endsWith(".js")) {
            size += stat.size;
        }
    }
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
        buildSize: formatBytes(totalBuildSize)
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
