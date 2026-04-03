import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { Refactor } from "../index.js";
import type { ConfiguredCodemodRunResult, NamingConventionTarget, PartialSemanticAnalyzer } from "../src/types.js";

const FILE_COUNT = 180;
const TARGETS_PER_FILE = 32;
const PERFORMANCE_THRESHOLD_MS = 150;

type SyntheticFileFixture = {
    sourceText: string;
    targets: Array<NamingConventionTarget>;
};

function createSyntheticLocalNamingFixture(
    filePath: string,
    fileIndex: number,
    targetsPerFile: number
): SyntheticFileFixture {
    const lines: Array<string> = [];
    const targets: Array<NamingConventionTarget> = [];
    let offset = 0;

    for (let targetIndex = 0; targetIndex < targetsPerFile; targetIndex += 1) {
        const currentName = `bad_name_${fileIndex}_${targetIndex}`;
        const declarationLine = `var ${currentName} = ${targetIndex};\n`;
        const referenceLine = `show_debug_message(${currentName});\n`;
        const declarationStart = offset + declarationLine.indexOf(currentName);
        const referenceStart = offset + declarationLine.length + referenceLine.indexOf(currentName);

        lines.push(declarationLine, referenceLine);
        targets.push({
            name: currentName,
            category: "localVariable",
            path: filePath,
            scopeId: `scope:${fileIndex}:${targetIndex}`,
            symbolId: null,
            occurrences: [
                {
                    path: filePath,
                    start: declarationStart,
                    end: declarationStart + currentName.length,
                    kind: Refactor.OccurrenceKind.DEFINITION,
                    scopeId: `scope:${fileIndex}:${targetIndex}`
                },
                {
                    path: filePath,
                    start: referenceStart,
                    end: referenceStart + currentName.length,
                    kind: Refactor.OccurrenceKind.REFERENCE,
                    scopeId: `scope:${fileIndex}:${targetIndex}`
                }
            ]
        });

        offset += declarationLine.length + referenceLine.length;
    }

    return {
        sourceText: lines.join(""),
        targets
    };
}

/**
 * Build a minimal {@link PartialSemanticAnalyzer} stub that returns pre-built
 * naming targets for the given file-to-targets map.  Accepts an optional
 * callback that is invoked on every call, allowing callers to track
 * invocation counts or perform side effects per query.
 */
function buildNamingConventionSemanticStub(
    targetsByFile: Map<string, Array<NamingConventionTarget>>,
    onCall?: () => void
): PartialSemanticAnalyzer {
    return {
        listNamingConventionTargets: async (filePaths?: Array<string>) => {
            onCall?.();
            const selectedPaths = filePaths === undefined ? null : new Set(filePaths);
            const matchingTargets: Array<NamingConventionTarget> = [];

            for (const [filePath, targets] of targetsByFile.entries()) {
                const resourcePath = filePath.replace(/\.gml$/i, ".yy");
                if (selectedPaths !== null && !selectedPaths.has(filePath) && !selectedPaths.has(resourcePath)) {
                    continue;
                }

                matchingTargets.push(...targets);
            }

            return matchingTargets;
        },
        validateEdits: async () => ({
            errors: [],
            warnings: []
        })
    };
}

async function measureMedianDurationMs<T>(
    sampleCount: number,
    execute: () => Promise<T>
): Promise<{
    durationMs: number;
    result: T;
}> {
    const durations: Array<number> = [];
    let latestResult: T | undefined;

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
        const startTime = performance.now();
        latestResult = await execute();
        durations.push(performance.now() - startTime);
    }

    durations.sort((left, right) => left - right);
    const medianIndex = Math.floor(durations.length / 2);

    if (latestResult === undefined) {
        throw new Error("measureMedianDurationMs requires at least one sample");
    }

    return {
        durationMs: durations[medianIndex] ?? 0,
        result: latestResult
    };
}

/**
 * Build the {@link Refactor.RefactorEngine.executeConfiguredCodemods} executor
 * used by both stress tests.  Each test supplies its own engine, file list, and
 * source-text map so the captured closure variables differ, while the call-site
 * shape is shared through this factory.
 */
function buildNamingConventionCodemodExecutor(
    engine: InstanceType<typeof Refactor.RefactorEngine>,
    gmlFilePaths: Array<string>,
    sourceTexts: Map<string, string>,
    projectRoot: string
): () => Promise<ConfiguredCodemodRunResult> {
    return async () =>
        await engine.executeConfiguredCodemods({
            projectRoot,
            targetPaths: [projectRoot],
            gmlFilePaths,
            config: {
                namingConventionPolicy: {
                    rules: {
                        localVariable: {
                            caseStyle: "camel"
                        }
                    }
                },
                codemods: {
                    namingConvention: {}
                }
            },
            readFile: async (filePath) => sourceTexts.get(filePath) ?? "",
            dryRun: true
        });
}

void test("namingConvention stress test stays within the selected-file planning threshold", async () => {
    const projectRoot = "/project";
    const sourceTexts = new Map<string, string>();
    const targetsByFile = new Map<string, Array<NamingConventionTarget>>();
    const gmlFilePaths = Array.from({ length: FILE_COUNT }, (_, fileIndex) => `scripts/script_${fileIndex}.gml`);

    for (const [fileIndex, filePath] of gmlFilePaths.entries()) {
        const fixture = createSyntheticLocalNamingFixture(filePath, fileIndex, TARGETS_PER_FILE);
        sourceTexts.set(filePath, fixture.sourceText);
        targetsByFile.set(filePath, fixture.targets);
    }

    let listNamingTargetsCallCount = 0;
    const semantic = buildNamingConventionSemanticStub(targetsByFile, () => {
        listNamingTargetsCallCount += 1;
    });

    const engine = new Refactor.RefactorEngine({ semantic });
    const executeStressRun = buildNamingConventionCodemodExecutor(engine, gmlFilePaths, sourceTexts, projectRoot);

    await executeStressRun();

    const listNamingTargetsCallCountAfterWarmup = listNamingTargetsCallCount;
    const SAMPLE_COUNT = 5;
    const { durationMs, result } = await measureMedianDurationMs(SAMPLE_COUNT, executeStressRun);

    assert.equal(listNamingTargetsCallCount - listNamingTargetsCallCountAfterWarmup, SAMPLE_COUNT);
    assert.equal(result.summaries.length, 1);
    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, true);
    assert.equal(result.appliedFiles.size, FILE_COUNT);
    assert.ok(
        durationMs <= PERFORMANCE_THRESHOLD_MS,
        `Expected namingConvention stress test to finish within ${PERFORMANCE_THRESHOLD_MS}ms, received ${durationMs.toFixed(2)}ms`
    );
});

// Larger stress test that exercises the full hot path at a scale representative
// of real GameMaker projects (300 files × 50 targets = 15 000 identifiers).
// This test locks in the performance improvements introduced in the
// "Refactor Performance Lock-In" optimisation pass:
//   - eliminating the double composeExpectedIdentifierName call in evaluateNamingConvention
//   - caching path-resolution results inside createPathSelectionMatcher
//   - pre-sorting bannedAffixes at resolve time to avoid per-call spread+sort
//
// Baseline (before optimisations): ~148 ms standalone, ~350 ms under CI suite load.
// After optimisations: ~88 ms standalone, ~175 ms under CI suite load.
// Threshold is set to 280 ms — well below the pre-optimisation estimate under load
// while providing enough headroom to absorb normal CI variance.
const LARGE_FILE_COUNT = 300;
const LARGE_TARGETS_PER_FILE = 50;
const LARGE_PERFORMANCE_THRESHOLD_MS = 280;

void test("namingConvention large-scale stress test locks in the hot-path optimisation gain", async () => {
    const projectRoot = "/project";
    const sourceTexts = new Map<string, string>();
    const targetsByFile = new Map<string, Array<NamingConventionTarget>>();
    const gmlFilePaths = Array.from({ length: LARGE_FILE_COUNT }, (_, fileIndex) => `scripts/script_${fileIndex}.gml`);

    for (const [fileIndex, filePath] of gmlFilePaths.entries()) {
        const fixture = createSyntheticLocalNamingFixture(filePath, fileIndex, LARGE_TARGETS_PER_FILE);
        sourceTexts.set(filePath, fixture.sourceText);
        targetsByFile.set(filePath, fixture.targets);
    }

    const semantic = buildNamingConventionSemanticStub(targetsByFile);

    const engine = new Refactor.RefactorEngine({ semantic });
    const executeStressRun = buildNamingConventionCodemodExecutor(engine, gmlFilePaths, sourceTexts, projectRoot);

    // Warm up JIT and module caches before measuring.
    await executeStressRun();

    const SAMPLE_COUNT = 5;
    const { durationMs, result } = await measureMedianDurationMs(SAMPLE_COUNT, executeStressRun);

    assert.equal(result.summaries.length, 1);
    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, true);
    assert.equal(result.appliedFiles.size, LARGE_FILE_COUNT);
    assert.ok(
        durationMs <= LARGE_PERFORMANCE_THRESHOLD_MS,
        `Expected large-scale namingConvention stress test to finish within ${LARGE_PERFORMANCE_THRESHOLD_MS}ms, ` +
            `received ${durationMs.toFixed(2)}ms`
    );
});
