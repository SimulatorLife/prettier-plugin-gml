import { mkdir, writeFile } from "node:fs/promises";
import { Session } from "node:inspector/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { Core } from "@gmloop/core";

import type {
    FixtureProfileBudgetFailure,
    FixtureProfileBudgets,
    FixtureProfileCollector,
    FixtureProfileEntry,
    FixtureProfileReport,
    FixtureStageMetrics,
    FixtureStageName
} from "../types.js";

type ResourceUsageSnapshot = ReturnType<typeof process.resourceUsage>;
type MemoryUsageSnapshot = ReturnType<typeof process.memoryUsage>;
type CpuUsageSnapshot = ReturnType<typeof process.cpuUsage>;

function captureStageSnapshot() {
    return Object.freeze({
        startedAt: performance.now(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        resource: process.resourceUsage()
    });
}

function toStageMetrics(stageName: FixtureStageName, snapshot: ReturnType<typeof captureStageSnapshot>): FixtureStageMetrics {
    const memoryAfter: MemoryUsageSnapshot = process.memoryUsage();
    const cpuAfter: CpuUsageSnapshot = process.cpuUsage();
    const resourceAfter: ResourceUsageSnapshot = process.resourceUsage();

    return Object.freeze({
        stageName,
        durationMs: performance.now() - snapshot.startedAt,
        heapUsedDeltaBytes: memoryAfter.heapUsed - snapshot.memory.heapUsed,
        cpuUserMicros: cpuAfter.user - snapshot.cpu.user,
        cpuSystemMicros: cpuAfter.system - snapshot.cpu.system,
        maxRssDelta: resourceAfter.maxRSS - snapshot.resource.maxRSS,
        voluntaryContextSwitchesDelta:
            resourceAfter.voluntaryContextSwitches - snapshot.resource.voluntaryContextSwitches,
        involuntaryContextSwitchesDelta:
            resourceAfter.involuntaryContextSwitches - snapshot.resource.involuntaryContextSwitches
    });
}

function readBudgetValue(
    budgets: FixtureProfileBudgets | null,
    metricName: keyof FixtureProfileBudgets,
    stageName: FixtureStageName
): number | null {
    const budgetMap = budgets?.[metricName];
    const rawValue = budgetMap?.[stageName];
    return typeof rawValue === "number" ? rawValue : null;
}

export function collectBudgetFailures(
    stages: ReadonlyArray<FixtureStageMetrics>,
    budgets: FixtureProfileBudgets | null
): ReadonlyArray<FixtureProfileBudgetFailure> {
    if (!budgets) {
        return Object.freeze([]);
    }

    const failures: Array<FixtureProfileBudgetFailure> = [];
    for (const stage of stages) {
        const trackedMetrics = [
            ["durationMs", stage.durationMs],
            ["heapUsedDeltaBytes", stage.heapUsedDeltaBytes],
            ["cpuUserMicros", stage.cpuUserMicros],
            ["cpuSystemMicros", stage.cpuSystemMicros]
        ] as const;

        for (const [metricName, actualValue] of trackedMetrics) {
            const budget = readBudgetValue(budgets, metricName, stage.stageName);
            if (budget !== null && actualValue > budget) {
                failures.push({
                    stageName: stage.stageName,
                    metricName,
                    actual: actualValue,
                    budget
                });
            }
        }
    }

    return Object.freeze(failures);
}

/**
 * Create an in-memory collector for fixture profiling entries.
 *
 * @returns Mutable collector used by fixture suites and profile tests.
 */
export function createProfileCollector(): FixtureProfileCollector {
    const entries: Array<FixtureProfileEntry> = [];

    return Object.freeze({
        addEntry(entry: FixtureProfileEntry) {
            entries.push(entry);
        },
        createReport(): FixtureProfileReport {
            return Object.freeze({
                schemaVersion: 1 as const,
                generatedAt: new Date().toISOString(),
                entries: Object.freeze([...entries])
            });
        }
    });
}

export function createStageTimer() {
    const stages: Array<FixtureStageMetrics> = [];

    return Object.freeze({
        async runStage<T>(stageName: FixtureStageName, operation: () => Promise<T>): Promise<T> {
            const snapshot = captureStageSnapshot();
            try {
                return await operation();
            } finally {
                stages.push(toStageMetrics(stageName, snapshot));
            }
        },
        getStages(): ReadonlyArray<FixtureStageMetrics> {
            return Object.freeze([...stages]);
        }
    });
}

/**
 * Optionally capture a V8 CPU profile for a fixture case.
 *
 * @param outputPath Artifact path to write when profiling is enabled.
 * @param operation Work wrapped by the CPU profiler.
 * @returns The operation result.
 */
export async function withDeepCpuProfile<T>(outputPath: string | null, operation: () => Promise<T>): Promise<T> {
    if (!outputPath) {
        return await operation();
    }

    const session = new Session();
    session.connect();

    try {
        await session.post("Profiler.enable");
        await session.post("Profiler.start");
        const result = await operation();
        const profile = await session.post("Profiler.stop");
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, Core.stringifyJsonForFile(profile.profile, { space: 2 }), "utf8");
        return result;
    } finally {
        session.disconnect();
    }
}
