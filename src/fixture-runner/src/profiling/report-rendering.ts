import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Core } from "@gmloop/core";

import type { FixtureProfileReport } from "../types.js";

function formatMetric(value: number): string {
    return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

/**
 * Render a compact human-readable summary of fixture profile results.
 *
 * @param report Profile report to summarize.
 * @returns Human-readable summary text.
 */
export function renderHumanProfileReport(report: FixtureProfileReport): string {
    const slowestEntries = [...report.entries]
        .sort((left, right) => right.totalMs - left.totalMs)
        .slice(0, 10);
    const largestHeapEntries = [...report.entries]
        .sort((left, right) => {
            const leftHeap = left.stages.find((stage) => stage.stageName === "total")?.heapUsedDeltaBytes ?? 0;
            const rightHeap = right.stages.find((stage) => stage.stageName === "total")?.heapUsedDeltaBytes ?? 0;
            return rightHeap - leftHeap;
        })
        .slice(0, 10);
    const budgetFailures = report.entries.flatMap((entry) =>
        entry.budgetFailures.map((failure) => `${entry.workspace}/${entry.caseId} ${failure.metricName} ${formatMetric(failure.actual)} > ${formatMetric(failure.budget)} on ${failure.stageName}`)
    );

    return [
        `Fixture profile report generated at ${report.generatedAt}`,
        "",
        "Slowest cases:",
        ...slowestEntries.map((entry) => `- ${entry.workspace}/${entry.caseId}: ${formatMetric(entry.totalMs)}ms`),
        "",
        "Largest heap deltas:",
        ...largestHeapEntries.map((entry) => {
            const totalStage = entry.stages.find((stage) => stage.stageName === "total");
            return `- ${entry.workspace}/${entry.caseId}: ${formatMetric(totalStage?.heapUsedDeltaBytes ?? 0)} bytes`;
        }),
        "",
        "Budget failures:",
        ...(budgetFailures.length > 0 ? budgetFailures.map((line) => `- ${line}`) : ["- none"])
    ].join("\n");
}

/**
 * Persist a JSON fixture profile report to disk.
 *
 * @param report Profile report payload.
 * @param outputPath Destination file path.
 */
export async function writeJsonProfileReport(report: FixtureProfileReport, outputPath: string): Promise<void> {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Core.stringifyJsonForFile(report, { space: 2 }), "utf8");
}
