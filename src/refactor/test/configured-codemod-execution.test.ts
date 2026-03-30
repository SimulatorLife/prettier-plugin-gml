import assert from "node:assert/strict";
import test from "node:test";

import { type BatchRenamePlanSummary, type PartialSemanticAnalyzer, Refactor } from "../index.js";
import type { StorageBackend, StorageBackendStats } from "../src/backends/index.js";
import type { CodemodExecutionTelemetry } from "../src/types.js";

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

void test("executeConfiguredCodemods streams namingConvention top-level renames in write mode", async () => {
    const semantic: PartialSemanticAnalyzer = {
        listNamingConventionTargets: async () => [
            {
                name: "bad_one",
                category: "function",
                path: "scripts/a.gml",
                scopeId: null,
                symbolId: "gml/script/bad_one",
                occurrences: []
            },
            {
                name: "bad_two",
                category: "function",
                path: "scripts/b.gml",
                scopeId: null,
                symbolId: "gml/script/bad_two",
                occurrences: []
            }
        ]
    };
    const engine = new Refactor.RefactorEngine({ semantic });
    const executeBatchCalls: Array<number> = [];

    Object.assign(engine, {
        async prepareBatchRenamePlan(): Promise<BatchRenamePlanSummary> {
            throw new Error("write mode should not call prepareBatchRenamePlan for top-level naming renames");
        },
        async executeBatchRename(request: { renames: Array<{ symbolId: string; newName: string }> }) {
            executeBatchCalls.push(request.renames.length);
            return {
                workspace: new Refactor.WorkspaceEdit(),
                applied: new Map<string, string>([
                    ["scripts/a.gml", ""],
                    ["scripts/b.gml", ""]
                ]),
                hotReloadUpdates: [],
                fileRenames: []
            };
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

    assert.equal(executeBatchCalls.length, 1);
    assert.equal(result.summaries[0]?.id, "namingConvention");
    assert.equal(result.summaries[0]?.changed, true);
    assert.equal(result.appliedFiles.get("scripts/a.gml"), "");
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
    assert.ok(listCalls.every((paths) => Array.isArray(paths) && paths.length === 4));
    assert.ok(listCalls.every((paths) => paths?.includes("scripts/example.gml")));
    assert.ok(listCalls.every((paths) => paths?.includes("scripts/example.yy")));
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
    assert.match(result.summaries[0]?.warnings[0] ?? "", /Transpiler compatibility validated/);
});
