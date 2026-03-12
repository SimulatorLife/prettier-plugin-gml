import assert from "node:assert/strict";
import test from "node:test";

import { type BatchRenamePlanSummary, type PartialSemanticAnalyzer, Refactor } from "../index.js";

/**
 * Create a minimal batch rename plan summary for codemod tests.
 */
function createBatchRenamePlanSummary(errors: Array<string>): BatchRenamePlanSummary {
    return {
        workspace: new Refactor.WorkspaceEdit(),
        validation: {
            valid: errors.length === 0,
            errors: [...errors],
            warnings: []
        },
        hotReload: null,
        batchValidation: {
            valid: errors.length === 0,
            errors: [...errors],
            warnings: [],
            renameValidations: new Map(),
            conflictingSets: []
        },
        impactAnalyses: new Map(),
        cascadeResult: null
    };
}

void test("listRegisteredCodemods returns the v1 configured codemod set", () => {
    assert.deepEqual(
        Refactor.listRegisteredCodemods().map((codemod) => codemod.id),
        ["loopLengthHoisting", "namingConvention"]
    );
});

void test("executeConfiguredCodemods defaults to dry-run for loop-length hoisting", async () => {
    const sourceText = "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n";
    const engine = new Refactor.RefactorEngine();
    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/example.gml"],
        config: {
            codemods: {
                loopLengthHoisting: {}
            }
        },
        readFile: async () => sourceText
    });

    assert.equal(result.dryRun, true);
    assert.deepEqual(result.summaries, [
        {
            id: "loopLengthHoisting",
            changed: true,
            changedFiles: ["scripts/example.gml"],
            warnings: [],
            errors: []
        }
    ]);
    assert.match(result.appliedFiles.get("scripts/example.gml") ?? "", /var len = array_length\(items\);/);
});

void test("executeConfiguredCodemods applies namingConvention local renames without a batch rename plan", async () => {
    const sourceText = "var bad_name = 1;\nshow_debug_message(bad_name);\n";
    const firstOccurrence = sourceText.indexOf("bad_name");
    const secondOccurrence = sourceText.lastIndexOf("bad_name");
    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "bad_name",
                category: "localVariable",
                path: "scripts/example.gml",
                scopeId: "scope:local",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/example.gml",
                        start: firstOccurrence,
                        end: firstOccurrence + "bad_name".length,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:local"
                    },
                    {
                        path: "scripts/example.gml",
                        start: secondOccurrence,
                        end: secondOccurrence + "bad_name".length,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:local"
                    }
                ]
            }
        ]
    };
    const engine = new Refactor.RefactorEngine({ semantic });

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/example.gml"],
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
        readFile: async () => sourceText
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.summaries.length, 1);
    assert.deepEqual(result.summaries[0], {
        id: "namingConvention",
        changed: true,
        changedFiles: ["scripts/example.gml"],
        warnings: [],
        errors: []
    });
    assert.equal(result.appliedFiles.get("scripts/example.gml"), "var badName = 1;\nshow_debug_message(badName);\n");
});

void test("executeConfiguredCodemods reports namingConvention batch rename conflicts without applying edits", async () => {
    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "bad_name",
                category: "function",
                path: "scripts/example.gml",
                scopeId: null,
                symbolId: "gml/script/bad_name",
                occurrences: []
            }
        ]
    };
    const engine = new Refactor.RefactorEngine({ semantic });
    Object.assign(engine, {
        async prepareBatchRenamePlan(): Promise<BatchRenamePlanSummary> {
            return createBatchRenamePlanSummary(["Rename target collides with an existing symbol."]);
        }
    });

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: [],
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
        readFile: async () => "function bad_name() {}\n"
    });

    assert.equal(result.appliedFiles.size, 0);
    assert.equal(result.summaries.length, 1);
    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, false);
    assert.match(result.summaries[0]?.errors[0] ?? "", /collides/);
});
