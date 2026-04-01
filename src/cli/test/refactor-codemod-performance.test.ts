import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { Refactor } from "@gmloop/refactor";

import { GmlSemanticBridge } from "../src/modules/refactor/semantic-bridge.js";

const FUNCTION_COUNT = 2400;
const PERFORMANCE_THRESHOLD_MS = 420;

type RenameValidationCacheStats = {
    evictions: number;
    hits: number;
    misses: number;
    size: number;
};

function createTopLevelNamingConventionFixture(): {
    files: Record<string, { declarations: Array<{ filePath: string; identifierId: string; name: string }> }>;
    projectIndex: Record<string, unknown>;
    projectRoot: string;
    sourceTexts: Map<string, string>;
} {
    const projectRoot = "/project";
    const files: Record<string, { declarations: Array<{ filePath: string; identifierId: string; name: string }> }> = {};
    const scripts: Record<
        string,
        {
            declarations: Array<Record<string, unknown>>;
            identifierId: string;
            name: string;
            references: Array<Record<string, unknown>>;
            resourcePath: string;
        }
    > = {};
    const sourceTexts = new Map<string, string>();
    const usagePath = "scripts/usage.gml";
    const usageLines: Array<string> = [];
    let usageOffset = 0;

    for (let index = 0; index < FUNCTION_COUNT; index += 1) {
        const currentName = `bad_name_${index}`;
        const filePath = `scripts/${currentName}.gml`;
        const sourceText = `function ${currentName}() {\n    return ${index};\n}\n`;
        const declarationStart = sourceText.indexOf(currentName);
        const declarationEndInclusive = declarationStart + currentName.length - 1;

        sourceTexts.set(filePath, sourceText);
        files[filePath] = {
            declarations: [{ name: currentName, identifierId: `script:${currentName}`, filePath }]
        };
        scripts[`script:${currentName}`] = {
            identifierId: `script:${currentName}`,
            name: currentName,
            declarations: [
                {
                    name: currentName,
                    filePath,
                    start: { index: declarationStart },
                    end: { index: declarationEndInclusive }
                }
            ],
            references: [],
            resourcePath: `scripts/${currentName}/${currentName}.yy`
        };
        usageLines.push(`${currentName}();\n`);
    }

    const usageSource = usageLines.join("");
    sourceTexts.set(usagePath, usageSource);
    files[usagePath] = { declarations: [] };

    for (let index = 0; index < FUNCTION_COUNT; index += 1) {
        const currentName = `bad_name_${index}`;
        const referenceEndInclusive = usageOffset + currentName.length - 1;
        scripts[`script:${currentName}`].references.push({
            targetName: currentName,
            name: currentName,
            filePath: usagePath,
            start: { index: usageOffset },
            end: { index: referenceEndInclusive }
        });
        usageOffset += `${currentName}();\n`.length;
    }

    return {
        files,
        projectIndex: {
            identifiers: { scripts },
            files,
            resources: {}
        },
        projectRoot,
        sourceTexts
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

void test("refactor codemod runtime stays within the indexed semantic bridge threshold", async () => {
    const fixture = createTopLevelNamingConventionFixture();
    const executeStressRun = async () => {
        const semantic = new GmlSemanticBridge(fixture.projectIndex, fixture.projectRoot);
        const engine = new Refactor.RefactorEngine({ semantic });
        const result = await engine.executeConfiguredCodemods({
            projectRoot: fixture.projectRoot,
            targetPaths: [fixture.projectRoot],
            gmlFilePaths: [...fixture.sourceTexts.keys()],
            config: {
                namingConventionPolicy: {
                    rules: {
                        function: {
                            caseStyle: "camel"
                        }
                    }
                },
                codemods: {
                    namingConvention: {}
                }
            },
            readFile: async (filePath) => fixture.sourceTexts.get(filePath) ?? "",
            dryRun: true,
            onlyCodemods: ["namingConvention"]
        });

        return {
            cacheStats: (
                engine as unknown as {
                    renameValidationCache: { getStats(): RenameValidationCacheStats };
                }
            ).renameValidationCache.getStats(),
            result
        };
    };

    await executeStressRun();
    const { durationMs, result } = await measureMedianDurationMs(3, executeStressRun);

    assert.equal(result.result.summaries.length, 1);
    assert.equal(result.result.summaries[0]?.id, "namingConvention");
    assert.equal(result.result.summaries[0]?.changed, true);
    assert.equal(result.result.appliedFiles.size, FUNCTION_COUNT + 1);
    assert.ok(result.cacheStats.hits > 0, "Expected warmed top-level rename validation cache hits during planning");
    assert.equal(result.cacheStats.evictions, 0);
    assert.ok(
        durationMs <= PERFORMANCE_THRESHOLD_MS,
        `Expected namingConvention codemod runtime to finish within ${PERFORMANCE_THRESHOLD_MS}ms, received ${durationMs.toFixed(2)}ms`
    );
});
