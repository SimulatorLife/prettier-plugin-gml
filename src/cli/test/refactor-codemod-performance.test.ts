import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { Refactor } from "@gmloop/refactor";

import { GmlSemanticBridge } from "../src/modules/refactor/semantic-bridge.js";

const FUNCTION_COUNT = 600;
const PERFORMANCE_THRESHOLD_MS = 150;

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

void test("refactor codemod runtime stays within the indexed semantic bridge threshold", async () => {
    const fixture = createTopLevelNamingConventionFixture();
    const executeStressRun = async () => {
        const semantic = new GmlSemanticBridge(fixture.projectIndex, fixture.projectRoot);
        const engine = new Refactor.RefactorEngine({ semantic });

        return await engine.executeConfiguredCodemods({
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
    };

    await executeStressRun();

    const startTime = performance.now();
    const result = await executeStressRun();

    const durationMs = performance.now() - startTime;

    assert.equal(result.summaries.length, 1);
    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, true);
    assert.equal(result.appliedFiles.size, FUNCTION_COUNT + 1);
    assert.ok(
        durationMs <= PERFORMANCE_THRESHOLD_MS,
        `Expected namingConvention codemod runtime to finish within ${PERFORMANCE_THRESHOLD_MS}ms, received ${durationMs.toFixed(2)}ms`
    );
});
