import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { Core } from "@gmloop/core";

import type { FixtureProfileReport } from "../types.js";

function formatMetric(value: number): string {
    return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function formatCaseMetricLine(prefix: string, value: number): string {
    return `${prefix}: ${formatMetric(value)}`;
}

/**
 * Render a compact human-readable summary of fixture profile results.
 *
 * @param report Profile report to summarize.
 * @returns Human-readable summary text.
 */
export function renderHumanProfileReport(report: FixtureProfileReport): string {
    const slowestEntries = [...report.entries].sort((left, right) => right.totalMs - left.totalMs).slice(0, 10);
    const largestHeapEntries = [...report.entries]
        .sort((left, right) => {
            const leftHeap = left.stages.find((stage) => stage.stageName === "total")?.heapUsedDeltaBytes ?? 0;
            const rightHeap = right.stages.find((stage) => stage.stageName === "total")?.heapUsedDeltaBytes ?? 0;
            return rightHeap - leftHeap;
        })
        .slice(0, 10);
    const highestCpuUserEntries = [...report.entries]
        .sort((left, right) => {
            const leftCpu = left.stages.find((stage) => stage.stageName === "total")?.cpuUserMicros ?? 0;
            const rightCpu = right.stages.find((stage) => stage.stageName === "total")?.cpuUserMicros ?? 0;
            return rightCpu - leftCpu;
        })
        .slice(0, 10);
    const highestCpuSystemEntries = [...report.entries]
        .sort((left, right) => {
            const leftCpu = left.stages.find((stage) => stage.stageName === "total")?.cpuSystemMicros ?? 0;
            const rightCpu = right.stages.find((stage) => stage.stageName === "total")?.cpuSystemMicros ?? 0;
            return rightCpu - leftCpu;
        })
        .slice(0, 10);

    return [
        `Fixture profile report generated at ${report.generatedAt}`,
        "",
        "Budget failures:",
        ...(report.failingBudgets.length > 0
            ? report.failingBudgets.map(
                  (failure) =>
                      `- ${failure.workspace}/${failure.caseId} ${failure.metricName} ${formatMetric(failure.actual)} > ${formatMetric(failure.budget)} on ${failure.stageName}`
              )
            : ["- none"]),
        "",
        "Slowest cases:",
        ...slowestEntries.map((entry) => `- ${entry.workspace}/${entry.caseId}: ${formatMetric(entry.totalMs)}ms`),
        "",
        "Largest heap deltas:",
        ...largestHeapEntries.map((entry) => {
            const totalStage = entry.stages.find((stage) => stage.stageName === "total");
            return formatCaseMetricLine(
                `- ${entry.workspace}/${entry.caseId}`,
                totalStage?.heapUsedDeltaBytes ?? 0
            ).concat(" bytes");
        }),
        "",
        "Highest CPU user time:",
        ...highestCpuUserEntries.map((entry) => {
            const totalStage = entry.stages.find((stage) => stage.stageName === "total");
            return formatCaseMetricLine(`- ${entry.workspace}/${entry.caseId}`, totalStage?.cpuUserMicros ?? 0).concat(
                "us"
            );
        }),
        "",
        "Highest CPU system time:",
        ...highestCpuSystemEntries.map((entry) => {
            const totalStage = entry.stages.find((stage) => stage.stageName === "total");
            return formatCaseMetricLine(
                `- ${entry.workspace}/${entry.caseId}`,
                totalStage?.cpuSystemMicros ?? 0
            ).concat("us");
        }),
        "",
        "Workspace totals:",
        ...report.workspaceAggregates.map(
            (aggregate) =>
                `- ${aggregate.workspace}: ${formatMetric(aggregate.summary.durationMs)}ms, ${formatMetric(
                    aggregate.summary.heapUsedDeltaBytes
                )} bytes heap, ${formatMetric(aggregate.summary.cpuUserMicros)}us user CPU, ${formatMetric(
                    aggregate.summary.cpuSystemMicros
                )}us system CPU`
        ),
        "",
        "Stage totals:",
        ...report.stageAggregates.map(
            (aggregate) =>
                `- ${aggregate.stageName}: ${formatMetric(aggregate.summary.durationMs)}ms, ${formatMetric(
                    aggregate.summary.heapUsedDeltaBytes
                )} bytes heap, ${formatMetric(aggregate.summary.cpuUserMicros)}us user CPU, ${formatMetric(
                    aggregate.summary.cpuSystemMicros
                )}us system CPU`
        )
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
