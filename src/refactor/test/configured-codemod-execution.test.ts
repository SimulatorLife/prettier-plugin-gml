import assert from "node:assert/strict";
import test from "node:test";

import { Parser } from "@gmloop/parser";

import { type BatchRenamePlanSummary, type PartialSemanticAnalyzer, Refactor } from "../index.js";
import type { StorageBackend, StorageBackendStats } from "../src/backends/index.js";
import type { CodemodExecutionTelemetry } from "../src/types.js";

/**
 * Create a minimal batch rename plan summary for codemod tests.
 */
function createBatchRenamePlanSummary(
    errors: Array<string>,
    workspace = new Refactor.WorkspaceEdit()
): BatchRenamePlanSummary {
    return {
        workspace,
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

class InMemoryOverlayStorageBackend implements StorageBackend {
    private readonly valuesByKey = new Map<string, string>();
    private disposed = false;
    public disposeCallCount = 0;
    public readonly stats: StorageBackendStats = {
        writes: 0,
        reads: 0,
        cacheHits: 0,
        cacheMisses: 0,
        spilledEntries: 0
    };

    async writeEntry(key: string, content: string): Promise<void> {
        if (this.disposed) {
            throw new Error("InMemoryOverlayStorageBackend cannot write after dispose");
        }

        this.valuesByKey.set(key, content);
        this.stats.writes += 1;
        this.stats.spilledEntries = this.valuesByKey.size;
    }

    async readEntry(key: string): Promise<string | null> {
        this.stats.reads += 1;
        if (!this.valuesByKey.has(key)) {
            this.stats.cacheMisses += 1;
            return null;
        }

        this.stats.cacheHits += 1;
        return this.valuesByKey.get(key) ?? null;
    }

    async deleteEntry(key: string): Promise<void> {
        this.valuesByKey.delete(key);
        this.stats.spilledEntries = this.valuesByKey.size;
    }

    async dispose(): Promise<void> {
        this.disposed = true;
        this.valuesByKey.clear();
        this.stats.spilledEntries = 0;
        this.disposeCallCount += 1;
    }

    getStats(): StorageBackendStats {
        return {
            ...this.stats,
            spilledEntries: this.valuesByKey.size
        };
    }
}

void test("listRegisteredCodemods returns the v1 configured codemod set", () => {
    assert.deepEqual(
        Refactor.listRegisteredCodemods().map((codemod) => codemod.id),
        ["loopLengthHoisting", "namingConvention"]
    );
});

void test("listConfiguredCodemods reports normalized effective config and selection state", () => {
    assert.deepEqual(
        Refactor.listConfiguredCodemods({ codemods: { loopLengthHoisting: {} } }, ["loopLengthHoisting"]),
        [
            {
                id: "loopLengthHoisting",
                description: "Hoist repeated loop-length helper calls out of for-loop test expressions.",
                configured: true,
                selected: true,
                effectiveConfig: {}
            },
            {
                id: "namingConvention",
                description: "Plan and apply naming-policy-driven renames using namingConventionPolicy.",
                configured: false,
                selected: false,
                effectiveConfig: null
            }
        ]
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

void test("executeConfiguredCodemods deduplicates repeated target and gml file paths", async () => {
    const sourceText = "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n";
    const engine = new Refactor.RefactorEngine();
    const reads = new Map<string, number>();

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project", "/project"],
        gmlFilePaths: ["scripts/example.gml", "scripts/example.gml"],
        config: {
            codemods: {
                loopLengthHoisting: {}
            }
        },
        readFile: async (filePath) => {
            reads.set(filePath, (reads.get(filePath) ?? 0) + 1);
            return sourceText;
        }
    });

    assert.equal(reads.get("scripts/example.gml"), 2);
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

void test("executeConfiguredCodemods avoids retaining full file content in write mode", async () => {
    const sourceText = "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n";
    const writes = new Map<string, string>();
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
        readFile: async () => sourceText,
        writeFile: async (filePath, content) => {
            writes.set(filePath, content);
        },
        dryRun: false
    });

    assert.equal(result.dryRun, false);
    assert.equal(result.appliedFiles.get("scripts/example.gml"), "");
    assert.match(writes.get("scripts/example.gml") ?? "", /var len = array_length\(items\);/);
});

void test("executeConfiguredCodemods reports overlay telemetry and emits callback", async () => {
    const sourceText = "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n";
    const engine = new Refactor.RefactorEngine();
    const telemetrySnapshots: Array<CodemodExecutionTelemetry> = [];

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/example.gml"],
        config: {
            codemods: {
                loopLengthHoisting: {}
            }
        },
        readFile: async () => sourceText,
        onTelemetry: (telemetry) => {
            telemetrySnapshots.push(telemetry);
        }
    });

    assert.ok(result.telemetry);
    assert.equal(result.telemetry?.queueCount, 1);
    assert.ok((result.telemetry?.overlayEntryCount ?? 0) >= 1);
    assert.ok((result.telemetry?.overlayHighWaterBytes ?? 0) > 0);
    assert.equal(telemetrySnapshots.length, 1);
    assert.equal(telemetrySnapshots[0]?.queueCount, 1);
});

void test("executeConfiguredCodemods spills dry-run overlay when threshold is exceeded", async () => {
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
        readFile: async () => sourceText,
        dryRunOverlaySpillThresholdBytes: 1,
        dryRunOverlayReadCacheMaxEntries: 1
    });

    assert.ok(result.telemetry);
    assert.ok((result.telemetry?.overlaySpillWrites ?? 0) > 0);
    assert.ok((result.telemetry?.overlayEntryCount ?? 0) >= (result.telemetry?.overlaySpilledEntries ?? 0));
    assert.match(result.appliedFiles.get("scripts/example.gml") ?? "", /var len = array_length\(items\);/);
});

void test("executeConfiguredCodemods uses injected dry-run overlay backend and disposes it", async () => {
    const sourceText = "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n";
    const engine = new Refactor.RefactorEngine();
    const backend = new InMemoryOverlayStorageBackend();

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/example.gml"],
        config: {
            codemods: {
                loopLengthHoisting: {}
            }
        },
        readFile: async () => sourceText,
        dryRunOverlaySpillThresholdBytes: 1,
        dryRunOverlayStorageBackend: backend
    });

    assert.ok(result.telemetry);
    assert.equal(result.telemetry?.overlaySpillWrites, 1);
    assert.equal(result.telemetry?.overlaySpilledEntries, 1);
    assert.equal(result.telemetry?.overlayEntryCount, 1);
    assert.equal(backend.disposeCallCount, 1);
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

void test("executeConfiguredCodemods skips invalid namingConvention top-level renames and still applies safe dry-run edits", async () => {
    const sourceText = "function good_name() {}\nfunction bad_name() {}\n";
    const goodNameStart = sourceText.indexOf("good_name");
    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "good_name",
                category: "function",
                path: "scripts/example.gml",
                scopeId: null,
                symbolId: "gml/script/good_name",
                occurrences: []
            },
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
        async validateRenameRequest(request: { symbolId: string; newName: string }) {
            if (request.symbolId === "gml/script/bad_name") {
                return {
                    valid: false,
                    errors: ["Rename target collides with an existing symbol."],
                    warnings: []
                };
            }

            return {
                valid: true,
                errors: [],
                warnings: []
            };
        },
        async prepareBatchRenamePlan(
            renames: Array<{ symbolId: string; newName: string }>
        ): Promise<BatchRenamePlanSummary> {
            assert.deepEqual(renames, [{ symbolId: "gml/script/good_name", newName: "goodName" }]);
            const workspace = new Refactor.WorkspaceEdit();
            workspace.addEdit("scripts/example.gml", goodNameStart, goodNameStart + "good_name".length, "goodName");

            return {
                ...createBatchRenamePlanSummary([]),
                workspace
            };
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
        readFile: async () => sourceText
    });

    assert.equal(result.summaries.length, 1);
    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, true);
    assert.deepEqual(result.summaries[0]?.errors, []);
    assert.match(result.summaries[0]?.warnings[0] ?? "", /Skipping top-level rename 'gml\/script\/bad_name'/);
    assert.equal(result.appliedFiles.get("scripts/example.gml"), "function goodName() {}\nfunction bad_name() {}\n");
});

void test("executeConfiguredCodemods uses lightweight batch planning for namingConvention top-level renames", async () => {
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
    const calls: Array<{ includeImpactAnalyses: boolean | undefined; validateHotReload: boolean | undefined }> = [];
    Object.assign(engine, {
        async prepareBatchRenamePlan(
            _renames: Array<{ symbolId: string; newName: string }>,
            options?: { includeImpactAnalyses?: boolean; validateHotReload?: boolean }
        ): Promise<BatchRenamePlanSummary> {
            calls.push({
                includeImpactAnalyses: options?.includeImpactAnalyses,
                validateHotReload: options?.validateHotReload
            });
            return createBatchRenamePlanSummary([]);
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

    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.includeImpactAnalyses, false);
    assert.equal(calls[0]?.validateHotReload, undefined);
});

void test("executeConfiguredCodemods applies structDeclaration policy to constructor targets and new-expression references", async () => {
    const sourceText = "function vector3() constructor {}\nvar value = new vector3();\n";
    const declarationStart = sourceText.indexOf("vector3");
    const referenceStart = sourceText.lastIndexOf("vector3");
    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "vector3",
                category: "constructorFunction",
                path: "scripts/vector3/vector3.gml",
                scopeId: null,
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/vector3/vector3.gml",
                        start: declarationStart,
                        end: declarationStart + "vector3".length,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: null
                    },
                    {
                        path: "scripts/vector3/vector3.gml",
                        start: referenceStart,
                        end: referenceStart + "vector3".length,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: null
                    }
                ]
            }
        ]
    };
    const engine = new Refactor.RefactorEngine({ semantic });

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/vector3/vector3.gml"],
        config: {
            namingConventionPolicy: {
                rules: {
                    structDeclaration: {
                        caseStyle: "pascal"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        },
        readFile: async () => sourceText
    });

    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, true);
    assert.equal(
        result.appliedFiles.get("scripts/vector3/vector3.gml"),
        "function Vector3() constructor {}\nvar value = new Vector3();\n"
    );
});

void test("executeConfiguredCodemods preserves allowed leading underscores for resource renames", async () => {
    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "__input_error",
                category: "scriptResourceName",
                path: "scripts/__input_error/__input_error.gml",
                scopeId: null,
                symbolId: "gml/scripts/__input_error",
                occurrences: []
            }
        ]
    };
    const engine = new Refactor.RefactorEngine({ semantic });
    const preparedRenameRequests: Array<Array<{ newName: string; symbolId: string }>> = [];

    Object.assign(engine, {
        async prepareBatchRenamePlan(
            request: Array<{ symbolId: string; newName: string }>
        ): Promise<BatchRenamePlanSummary> {
            preparedRenameRequests.push(request);
            return createBatchRenamePlanSummary([]);
        }
    });

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/__input_error/__input_error.gml"],
        config: {
            namingConventionPolicy: {
                rules: {
                    resource: {
                        caseStyle: "lower_snake"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        },
        readFile: async () => "",
        dryRun: true
    });

    assert.deepEqual(preparedRenameRequests, []);
    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, false);
    assert.deepEqual(result.summaries[0]?.warnings, []);
});

void test("executeConfiguredCodemods applies namingConvention write-mode renames through one merged workspace", async () => {
    const namingTargets = Array.from({ length: 65 }, (_, index) => ({
        name: `bad_name_${index}`,
        category: "function" as const,
        path: `scripts/script_${index}.gml`,
        scopeId: null,
        symbolId: `gml/script/bad_name_${index}`,
        occurrences: []
    }));
    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => namingTargets
    };
    const engine = new Refactor.RefactorEngine({ semantic });
    const preparedRenameBatchSizes: Array<number> = [];
    const applyWorkspaceCalls: Array<InstanceType<typeof Refactor.WorkspaceEdit>> = [];
    const topLevelWorkspace = new Refactor.WorkspaceEdit();
    topLevelWorkspace.addEdit("scripts/script_0.gml", 0, 8, "goodName");

    Object.assign(engine, {
        async prepareBatchRenamePlan(
            request: Array<{ symbolId: string; newName: string }>
        ): Promise<BatchRenamePlanSummary> {
            preparedRenameBatchSizes.push(request.length);
            return createBatchRenamePlanSummary([], topLevelWorkspace);
        },
        async applyWorkspaceEdit(workspace: InstanceType<typeof Refactor.WorkspaceEdit>) {
            applyWorkspaceCalls.push(workspace);
            return new Map<string, string>([
                ["scripts/script_0.gml", ""],
                ["scripts/script_64.gml", ""]
            ]);
        },
        async executeBatchRename(): Promise<never> {
            throw new Error("write mode should apply the merged workspace instead of executeBatchRename");
        }
    });

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/a.gml", "scripts/b.gml"],
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
        readFile: async () => "",
        writeFile: async () => {},
        dryRun: false
    });

    assert.deepEqual(preparedRenameBatchSizes, [65]);
    assert.equal(applyWorkspaceCalls.length, 1);
    assert.equal(applyWorkspaceCalls[0]?.edits.length, 1);
    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, true);
    assert.equal(result.appliedFiles.get("scripts/script_0.gml"), "");
});

void test("executeConfiguredCodemods skips invalid namingConvention top-level renames in write mode", async () => {
    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "good_one",
                category: "function",
                path: "scripts/a.gml",
                scopeId: null,
                symbolId: "gml/script/good_one",
                occurrences: []
            },
            {
                name: "bad_one",
                category: "function",
                path: "scripts/b.gml",
                scopeId: null,
                symbolId: "gml/script/bad_one",
                occurrences: []
            }
        ]
    };
    const engine = new Refactor.RefactorEngine({ semantic });
    const preparedRenameBatches: Array<Array<{ symbolId: string; newName: string }>> = [];
    const topLevelWorkspace = new Refactor.WorkspaceEdit();
    topLevelWorkspace.addEdit("scripts/a.gml", 0, 8, "goodOne");

    Object.assign(engine, {
        async validateRenameRequest(request: { symbolId: string; newName: string }) {
            if (request.symbolId === "gml/script/bad_one") {
                return {
                    valid: false,
                    errors: ["Rename target collides with an existing symbol."],
                    warnings: []
                };
            }

            return {
                valid: true,
                errors: [],
                warnings: []
            };
        },
        async prepareBatchRenamePlan(
            request: Array<{ symbolId: string; newName: string }>
        ): Promise<BatchRenamePlanSummary> {
            preparedRenameBatches.push(request);
            return createBatchRenamePlanSummary([], topLevelWorkspace);
        },
        async applyWorkspaceEdit() {
            return new Map<string, string>([["scripts/a.gml", ""]]);
        },
        async executeBatchRename(): Promise<never> {
            throw new Error("write mode should apply the merged workspace instead of executeBatchRename");
        }
    });

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/a.gml", "scripts/b.gml"],
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
        readFile: async () => "",
        writeFile: async () => {},
        dryRun: false
    });

    assert.deepEqual(preparedRenameBatches, [[{ symbolId: "gml/script/good_one", newName: "goodOne" }]]);
    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, true);
    assert.deepEqual(result.summaries[0]?.errors, []);
    assert.match(result.summaries[0]?.warnings[0] ?? "", /Skipping top-level rename 'gml\/script\/bad_one'/);
    assert.equal(result.appliedFiles.get("scripts/a.gml"), "");
    assert.equal(result.appliedFiles.has("scripts/b.gml"), false);
});

void test("executeConfiguredCodemods keeps mixed local and top-level namingConvention renames aligned in write mode", async () => {
    const sourceText = [
        "function setup() {",
        "    var treeMesh = levelColmesh;",
        "    cm_add(levelColmesh, treeMesh);",
        "}",
        ""
    ].join("\n");
    const filePath = "objects/demo/Create_0.gml";
    const localDefinitionStart = sourceText.indexOf("treeMesh");
    const localReferenceStart = sourceText.lastIndexOf("treeMesh");
    const firstGlobalReferenceStart = sourceText.indexOf("levelColmesh");
    const secondGlobalReferenceStart = sourceText.lastIndexOf("levelColmesh");
    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "treeMesh",
                category: "localVariable",
                path: filePath,
                scopeId: "scope:treeMesh",
                symbolId: null,
                occurrences: [
                    {
                        path: filePath,
                        start: localDefinitionStart,
                        end: localDefinitionStart + "treeMesh".length,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:treeMesh"
                    },
                    {
                        path: filePath,
                        start: localReferenceStart,
                        end: localReferenceStart + "treeMesh".length,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:treeMesh"
                    }
                ]
            },
            {
                name: "levelColmesh",
                category: "globalVariable",
                path: filePath,
                scopeId: null,
                symbolId: "gml/globalvar/levelColmesh",
                occurrences: []
            }
        ]
    };
    const engine = new Refactor.RefactorEngine({ semantic });
    const writes = new Map<string, string>();
    const topLevelWorkspace = new Refactor.WorkspaceEdit();
    topLevelWorkspace.addEdit(
        filePath,
        secondGlobalReferenceStart,
        secondGlobalReferenceStart + "levelColmesh".length,
        "level_colmesh"
    );
    topLevelWorkspace.addEdit(
        filePath,
        firstGlobalReferenceStart,
        firstGlobalReferenceStart + "levelColmesh".length,
        "level_colmesh"
    );

    Object.assign(engine, {
        async prepareBatchRenamePlan(
            request: Array<{ symbolId: string; newName: string }>
        ): Promise<BatchRenamePlanSummary> {
            assert.deepEqual(request, [{ symbolId: "gml/globalvar/levelColmesh", newName: "level_colmesh" }]);
            return createBatchRenamePlanSummary([], topLevelWorkspace);
        },
        async executeBatchRename(): Promise<never> {
            throw new Error("write mode should not apply stale top-level batch renames after local edits");
        }
    });

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: [filePath],
        config: {
            namingConventionPolicy: {
                rules: {
                    localVariable: {
                        caseStyle: "lower_snake"
                    },
                    globalVariable: {
                        caseStyle: "lower_snake"
                    }
                }
            },
            codemods: {
                namingConvention: {}
            }
        },
        readFile: async () => sourceText,
        writeFile: async (writtenFilePath, content) => {
            writes.set(writtenFilePath, content);
        },
        dryRun: false
    });

    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, true);
    assert.equal(
        writes.get(filePath),
        [
            "function setup() {",
            "    var tree_mesh = level_colmesh;",
            "    cm_add(level_colmesh, tree_mesh);",
            "}",
            ""
        ].join("\n")
    );
    assert.equal(result.appliedFiles.get(filePath), "");
});

void test("executeConfiguredCodemods honors project-relative target paths for namingConvention selection", async () => {
    const sourceText = "var bad_name = 1;\nshow_debug_message(bad_name);\n";
    const firstOccurrence = sourceText.indexOf("bad_name");
    const secondOccurrence = sourceText.lastIndexOf("bad_name");
    const otherSourceText = "var leave_me = 1;\nshow_debug_message(leave_me);\n";
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
            },
            {
                name: "leave_me",
                category: "localVariable",
                path: "other/skip.gml",
                scopeId: "scope:other",
                symbolId: null,
                occurrences: [
                    {
                        path: "other/skip.gml",
                        start: 4,
                        end: 12,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:other"
                    }
                ]
            }
        ]
    };
    const engine = new Refactor.RefactorEngine({ semantic });

    const fileContents = new Map<string, string>([
        ["scripts/example.gml", sourceText],
        ["other/skip.gml", otherSourceText]
    ]);

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["scripts"],
        gmlFilePaths: [],
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
        readFile: async (filePath) => fileContents.get(filePath) ?? ""
    });

    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.deepEqual(result.summaries[0]?.changedFiles, ["scripts/example.gml"]);
    assert.equal(result.appliedFiles.get("scripts/example.gml"), "var badName = 1;\nshow_debug_message(badName);\n");
    assert.equal(result.appliedFiles.has("other/skip.gml"), false);
});

void test("executeConfiguredCodemods applies enum + enumMember renames and preserves parse validity", async () => {
    const sourceText = "enum ecm { x, y, z };\nvar a = ecm.x;\nvar b = ecm.y;\nvar c = ecm.z;\n";
    const enumStart = sourceText.indexOf("ecm");
    const xDefStart = sourceText.indexOf("x,");
    const yDefStart = sourceText.indexOf("y,");
    const zDefStart = sourceText.indexOf("z");
    const xRefStart = sourceText.indexOf("ecm.x");
    const yRefStart = sourceText.indexOf("ecm.y");
    const zRefStart = sourceText.indexOf("ecm.z");

    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "ecm",
                category: "enum",
                path: "scripts/enum_test.gml",
                scopeId: null,
                symbolId: "gml/enum/ecm",
                occurrences: []
            },
            {
                name: "x",
                category: "enumMember",
                path: "scripts/enum_test.gml",
                scopeId: null,
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/enum_test.gml",
                        start: xDefStart,
                        end: xDefStart + 1,
                        kind: Refactor.OccurrenceKind.DEFINITION
                    },
                    {
                        path: "scripts/enum_test.gml",
                        start: xRefStart + 4,
                        end: xRefStart + 5,
                        kind: Refactor.OccurrenceKind.REFERENCE
                    }
                ]
            },
            {
                name: "y",
                category: "enumMember",
                path: "scripts/enum_test.gml",
                scopeId: null,
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/enum_test.gml",
                        start: yDefStart,
                        end: yDefStart + 1,
                        kind: Refactor.OccurrenceKind.DEFINITION
                    },
                    {
                        path: "scripts/enum_test.gml",
                        start: yRefStart + 4,
                        end: yRefStart + 5,
                        kind: Refactor.OccurrenceKind.REFERENCE
                    }
                ]
            },
            {
                name: "z",
                category: "enumMember",
                path: "scripts/enum_test.gml",
                scopeId: null,
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/enum_test.gml",
                        start: zDefStart,
                        end: zDefStart + 1,
                        kind: Refactor.OccurrenceKind.DEFINITION
                    },
                    {
                        path: "scripts/enum_test.gml",
                        start: zRefStart + 4,
                        end: zRefStart + 5,
                        kind: Refactor.OccurrenceKind.REFERENCE
                    }
                ]
            }
        ],
        getSymbolOccurrences: async (symbolName: string, symbolId: string | null = null) => {
            if (symbolId === "gml/enum/ecm") {
                return [
                    {
                        path: "scripts/enum_test.gml",
                        start: enumStart,
                        end: enumStart + 3,
                        kind: Refactor.OccurrenceKind.DEFINITION
                    },
                    {
                        path: "scripts/enum_test.gml",
                        start: xRefStart,
                        end: xRefStart + 3,
                        kind: Refactor.OccurrenceKind.REFERENCE
                    },
                    {
                        path: "scripts/enum_test.gml",
                        start: yRefStart,
                        end: yRefStart + 3,
                        kind: Refactor.OccurrenceKind.REFERENCE
                    },
                    {
                        path: "scripts/enum_test.gml",
                        start: zRefStart,
                        end: zRefStart + 3,
                        kind: Refactor.OccurrenceKind.REFERENCE
                    }
                ];
            }
            return [];
        }
    };

    const engine = new Refactor.RefactorEngine({ semantic });
    const fileContents = new Map<string, string>([["scripts/enum_test.gml", sourceText]]);

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/enum_test.gml"],
        config: {
            namingConventionPolicy: {
                rules: {
                    enum: { caseStyle: "camel", suffix: "M" },
                    enumMember: { caseStyle: "lower", suffix: "X" }
                }
            },
            codemods: { namingConvention: {} }
        },
        readFile: async (path) => fileContents.get(path) ?? "",
        writeFile: async (path, content) => {
            fileContents.set(path, content);
        },
        dryRun: false
    });

    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, true);
    const finalText = fileContents.get("scripts/enum_test.gml");
    assert.ok(finalText?.includes("enum ecmM"));
    assert.ok(finalText?.includes("xX"));
    assert.ok(finalText?.includes("yX"));
    assert.ok(finalText?.includes("zX"));

    assert.doesNotThrow(() => {
        const ast = Parser.GMLParser.parse(finalText ?? "");
        assert.ok(ast && ast.type === "Program");
    });
});

void test("executeConfiguredCodemods skips local variable renames that would redeclare built-in instance variables", async () => {
    const sourceText = [
        "function cm_collider_check(collider) {",
        "    var X = collider[CM.X];",
        "    var Y = collider[CM.Y];",
        "    var halfX = 1;",
        "    return X + Y + halfX;",
        "}",
        ""
    ].join("\n");
    const firstXOccurrence = sourceText.indexOf("X");
    const secondXOccurrence = sourceText.lastIndexOf("X");
    const firstYOccurrence = sourceText.indexOf("Y");
    const secondYOccurrence = sourceText.lastIndexOf("Y");
    const firstHalfXOccurrence = sourceText.indexOf("halfX");
    const secondHalfXOccurrence = sourceText.lastIndexOf("halfX");

    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "X",
                category: "localVariable",
                path: "scripts/cm_collider.gml",
                scopeId: "scope:cm_collider",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/cm_collider.gml",
                        start: firstXOccurrence,
                        end: firstXOccurrence + "X".length,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:cm_collider"
                    },
                    {
                        path: "scripts/cm_collider.gml",
                        start: secondXOccurrence,
                        end: secondXOccurrence + "X".length,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:cm_collider"
                    }
                ]
            },
            {
                name: "Y",
                category: "localVariable",
                path: "scripts/cm_collider.gml",
                scopeId: "scope:cm_collider",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/cm_collider.gml",
                        start: firstYOccurrence,
                        end: firstYOccurrence + "Y".length,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:cm_collider"
                    },
                    {
                        path: "scripts/cm_collider.gml",
                        start: secondYOccurrence,
                        end: secondYOccurrence + "Y".length,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:cm_collider"
                    }
                ]
            },
            {
                name: "halfX",
                category: "localVariable",
                path: "scripts/cm_collider.gml",
                scopeId: "scope:cm_collider",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/cm_collider.gml",
                        start: firstHalfXOccurrence,
                        end: firstHalfXOccurrence + "halfX".length,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:cm_collider"
                    },
                    {
                        path: "scripts/cm_collider.gml",
                        start: secondHalfXOccurrence,
                        end: secondHalfXOccurrence + "halfX".length,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:cm_collider"
                    }
                ]
            }
        ]
    };

    const engine = new Refactor.RefactorEngine({ semantic });
    const fileContents = new Map<string, string>([["scripts/cm_collider.gml", sourceText]]);

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/cm_collider.gml"],
        config: {
            namingConventionPolicy: {
                rules: {
                    variable: { caseStyle: "lower_snake" }
                }
            },
            codemods: { namingConvention: {} }
        },
        readFile: async (filePath) => fileContents.get(filePath) ?? "",
        writeFile: async (filePath, content) => {
            fileContents.set(filePath, content);
        },
        dryRun: false
    });

    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, true);
    assert.ok(
        result.summaries[0]?.warnings.some((warning) => warning.includes("reserved GameMaker identifier")),
        "expected a warning when a reserved local rename is skipped"
    );

    const finalText = fileContents.get("scripts/cm_collider.gml");
    assert.match(finalText ?? "", /var X = collider\[CM\.X\];/);
    assert.match(finalText ?? "", /var Y = collider\[CM\.Y\];/);
    assert.match(finalText ?? "", /var half_x = 1;/);
    assert.match(finalText ?? "", /return X \+ Y \+ half_x;/);

    assert.doesNotThrow(() => {
        const ast = Parser.GMLParser.parse(finalText ?? "");
        assert.ok(ast && ast.type === "Program");
    });
});

void test("executeConfiguredCodemods skips exclusive-prefix variable renames when the stripped name is reserved", async () => {
    const sourceText = [
        "function group_smf(path, texName) {",
        "    var spr_id = asset_get_index(filename_change_ext(filename_name(path), texName));",
        "    return spr_id;",
        "}",
        ""
    ].join("\n");
    const firstSprIdOccurrence = sourceText.indexOf("spr_id");
    const secondSprIdOccurrence = sourceText.lastIndexOf("spr_id");

    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "spr_id",
                category: "localVariable",
                path: "scripts/group_smf.gml",
                scopeId: "scope:group_smf",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/group_smf.gml",
                        start: firstSprIdOccurrence,
                        end: firstSprIdOccurrence + "spr_id".length,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:group_smf"
                    },
                    {
                        path: "scripts/group_smf.gml",
                        start: secondSprIdOccurrence,
                        end: secondSprIdOccurrence + "spr_id".length,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:group_smf"
                    }
                ]
            }
        ]
    };

    const engine = new Refactor.RefactorEngine({ semantic });
    const fileContents = new Map<string, string>([["scripts/group_smf.gml", sourceText]]);

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/group_smf.gml"],
        config: {
            namingConventionPolicy: {
                rules: {
                    variable: { caseStyle: "lower_snake" },
                    spriteResourceName: { prefix: "spr_", caseStyle: "lower_snake" }
                },
                exclusivePrefixes: {
                    spr_: "spriteResourceName"
                }
            },
            codemods: { namingConvention: {} }
        },
        readFile: async (filePath) => fileContents.get(filePath) ?? "",
        writeFile: async (filePath, content) => {
            fileContents.set(filePath, content);
        },
        dryRun: false
    });

    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, false);
    assert.ok(
        result.summaries[0]?.warnings.some((warning) => warning.includes("reserved GameMaker identifier")),
        "expected a warning when a reserved local rename is skipped"
    );

    const finalText = fileContents.get("scripts/group_smf.gml");
    assert.match(finalText ?? "", /var spr_id = asset_get_index/);
    assert.match(finalText ?? "", /return spr_id;/);

    assert.doesNotThrow(() => {
        const ast = Parser.GMLParser.parse(finalText ?? "");
        assert.ok(ast && ast.type === "Program");
    });
});

void test("executeConfiguredCodemods skips local renames that referenced macro expansions depend on", async () => {
    const sourceText = [
        "function cm_triangle(collider) {",
        "    var Z = collider[1];",
        "    CM_TRIANGLE_GET_CAPSULE_REF;",
        "    return Z;",
        "}",
        ""
    ].join("\n");
    const zDefinitionStart = sourceText.indexOf("Z =");
    const zReferenceStart = sourceText.lastIndexOf("Z;");

    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "Z",
                category: "localVariable",
                path: "scripts/cm_triangle.gml",
                scopeId: "scope:cm_triangle",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/cm_triangle.gml",
                        start: zDefinitionStart,
                        end: zDefinitionStart + 1,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:cm_triangle"
                    },
                    {
                        path: "scripts/cm_triangle.gml",
                        start: zReferenceStart,
                        end: zReferenceStart + 1,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:cm_triangle"
                    }
                ]
            }
        ],
        listMacroExpansionDependencies: async () => [
            {
                path: "scripts/cm_triangle.gml",
                macroName: "CM_TRIANGLE_GET_CAPSULE_REF",
                referencedNames: ["Z"]
            }
        ]
    };

    const engine = new Refactor.RefactorEngine({ semantic });
    const fileContents = new Map<string, string>([["scripts/cm_triangle.gml", sourceText]]);

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/cm_triangle.gml"],
        config: {
            namingConventionPolicy: {
                rules: {
                    variable: { caseStyle: "lower_snake" }
                }
            },
            codemods: { namingConvention: {} }
        },
        readFile: async (filePath) => fileContents.get(filePath) ?? "",
        writeFile: async (filePath, content) => {
            fileContents.set(filePath, content);
        },
        dryRun: false
    });

    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, false);
    assert.ok(
        result.summaries[0]?.warnings.some((warning) =>
            warning.includes("macro expansion 'CM_TRIANGLE_GET_CAPSULE_REF' depends on 'Z'")
        ),
        "expected a warning when a macro expansion depends on the current local name"
    );

    const finalText = fileContents.get("scripts/cm_triangle.gml");
    assert.equal(finalText, sourceText);
});

void test("executeConfiguredCodemods skips argument renames that would collide with locals in reachable scopes", async () => {
    const sourceText = [
        "function sample_builder(M, AABB, N) {",
        "    var m = array_create(16);",
        "    var aabb = CM_SPATIALHASH_AABB;",
        "    for (var n = 3; n > 0; --n) {",
        "        show_debug_message(M[0] + AABB[0] + N.x + m[0] + aabb[0] + n);",
        "    }",
        "}",
        ""
    ].join("\n");
    const mParameterStart = sourceText.indexOf("M,");
    const mReferenceStart = sourceText.indexOf("M[0]");
    const localMDefinitionStart = sourceText.indexOf("var m");
    const localMReferenceStart = sourceText.indexOf("m[0]");
    const aabbParameterStart = sourceText.indexOf("AABB");
    const aabbReferenceStart = sourceText.indexOf("AABB[0]");
    const localAabbDefinitionStart = sourceText.indexOf("var aabb");
    const localAabbReferenceStart = sourceText.indexOf("aabb[0]");
    const nParameterStart = sourceText.indexOf("N)");
    const nReferenceStart = sourceText.indexOf("N.x");
    const loopNDefinitionStart = sourceText.indexOf("var n");
    const loopNReferenceStart = sourceText.lastIndexOf("n)");

    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "M",
                category: "argument",
                path: "scripts/sample_builder.gml",
                scopeId: "scope:function:sample_builder",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/sample_builder.gml",
                        start: mParameterStart,
                        end: mParameterStart + 1,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:function:sample_builder"
                    },
                    {
                        path: "scripts/sample_builder.gml",
                        start: mReferenceStart,
                        end: mReferenceStart + 1,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:function:sample_builder"
                    }
                ]
            },
            {
                name: "m",
                category: "localVariable",
                path: "scripts/sample_builder.gml",
                scopeId: "scope:function:sample_builder",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/sample_builder.gml",
                        start: localMDefinitionStart + 4,
                        end: localMDefinitionStart + 5,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:function:sample_builder"
                    },
                    {
                        path: "scripts/sample_builder.gml",
                        start: localMReferenceStart,
                        end: localMReferenceStart + 1,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:function:sample_builder"
                    }
                ]
            },
            {
                name: "AABB",
                category: "argument",
                path: "scripts/sample_builder.gml",
                scopeId: "scope:function:sample_builder",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/sample_builder.gml",
                        start: aabbParameterStart,
                        end: aabbParameterStart + 4,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:function:sample_builder"
                    },
                    {
                        path: "scripts/sample_builder.gml",
                        start: aabbReferenceStart,
                        end: aabbReferenceStart + 4,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:function:sample_builder"
                    }
                ]
            },
            {
                name: "aabb",
                category: "localVariable",
                path: "scripts/sample_builder.gml",
                scopeId: "scope:function:sample_builder",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/sample_builder.gml",
                        start: localAabbDefinitionStart + 4,
                        end: localAabbDefinitionStart + 8,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:function:sample_builder"
                    },
                    {
                        path: "scripts/sample_builder.gml",
                        start: localAabbReferenceStart,
                        end: localAabbReferenceStart + 4,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:function:sample_builder"
                    }
                ]
            },
            {
                name: "N",
                category: "argument",
                path: "scripts/sample_builder.gml",
                scopeId: "scope:function:sample_builder",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/sample_builder.gml",
                        start: nParameterStart,
                        end: nParameterStart + 1,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:function:sample_builder"
                    },
                    {
                        path: "scripts/sample_builder.gml",
                        start: nReferenceStart,
                        end: nReferenceStart + 1,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:function:sample_builder"
                    }
                ]
            },
            {
                name: "n",
                category: "loopIndexVariable",
                path: "scripts/sample_builder.gml",
                scopeId: "scope:function:sample_builder",
                symbolId: null,
                occurrences: [
                    {
                        path: "scripts/sample_builder.gml",
                        start: loopNDefinitionStart + 4,
                        end: loopNDefinitionStart + 5,
                        kind: Refactor.OccurrenceKind.DEFINITION,
                        scopeId: "scope:function:sample_builder"
                    },
                    {
                        path: "scripts/sample_builder.gml",
                        start: loopNReferenceStart,
                        end: loopNReferenceStart + 1,
                        kind: Refactor.OccurrenceKind.REFERENCE,
                        scopeId: "scope:function:sample_builder"
                    }
                ]
            }
        ]
    };

    const engine = new Refactor.RefactorEngine({ semantic });
    const fileContents = new Map<string, string>([["scripts/sample_builder.gml", sourceText]]);

    const result = await engine.executeConfiguredCodemods({
        projectRoot: "/project",
        targetPaths: ["/project"],
        gmlFilePaths: ["scripts/sample_builder.gml"],
        config: {
            namingConventionPolicy: {
                rules: {
                    argument: { caseStyle: "lower_snake" }
                }
            },
            codemods: { namingConvention: {} }
        },
        readFile: async (filePath) => fileContents.get(filePath) ?? "",
        writeFile: async (filePath, content) => {
            fileContents.set(filePath, content);
        },
        dryRun: false
    });

    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, false);
    assert.ok(
        result.summaries[0]?.warnings.some((warning) => warning.includes("already exists in the same scope")),
        "expected a warning when a rename would collide with an existing same-scope declaration"
    );

    const finalText = fileContents.get("scripts/sample_builder.gml");
    assert.match(finalText ?? "", /function sample_builder\(M, AABB, N\)/);
    assert.match(finalText ?? "", /var m = array_create\(16\);/);
    assert.match(finalText ?? "", /var aabb = CM_SPATIALHASH_AABB;/);
    assert.match(finalText ?? "", /for \(var n = 3; n > 0; --n\)/);

    assert.doesNotThrow(() => {
        const ast = Parser.GMLParser.parse(finalText ?? "");
        assert.ok(ast && ast.type === "Program");
    });
});

void test("executeConfiguredCodemods requests naming targets by selected GML file paths", async () => {
    const sourceText = "var bad_name = 1;\nshow_debug_message(bad_name);\n";
    const firstOccurrence = sourceText.indexOf("bad_name");
    const secondOccurrence = sourceText.lastIndexOf("bad_name");
    const listCalls: Array<Array<string> | undefined> = [];
    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async (filePaths?: Array<string>) => {
            listCalls.push(filePaths);

            if (filePaths && !filePaths.includes("scripts/example.gml")) {
                return [];
            }

            return [
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
            ];
        }
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

    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.appliedFiles.get("scripts/example.gml"), "var badName = 1;\nshow_debug_message(badName);\n");
    assert.equal(listCalls.length, 1);
    assert.ok(Array.isArray(listCalls[0]));
    assert.equal(listCalls[0]?.length, 4);
    assert.ok(listCalls[0]?.includes("scripts/example.gml"));
    assert.ok(listCalls[0]?.includes("/project/scripts/example.gml"));
    assert.ok(listCalls[0]?.includes("scripts/example.yy"));
    assert.ok(listCalls[0]?.includes("/project/scripts/example.yy"));
});

void test("executeConfiguredCodemods surfaces namingConvention hot reload warnings from top-level plans", async () => {
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
            return {
                ...createBatchRenamePlanSummary([]),
                hotReload: {
                    valid: true,
                    errors: [],
                    warnings: ["Transpiler compatibility validated for 1 symbol(s) in 1 file(s)"]
                }
            };
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

    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.ok(
        result.summaries[0]?.warnings.some((warning) => /Transpiler compatibility validated/.test(warning)) ?? false
    );
});
