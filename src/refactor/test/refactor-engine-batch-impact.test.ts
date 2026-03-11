import assert from "node:assert/strict";
import test from "node:test";

import {
    Refactor,
    type RefactorEngine,
    type RenameRequest,
    type WorkspaceReadFile,
    type WorkspaceWriteFile
} from "../index.js";

const { RefactorEngine: RefactorEngineClass, OccurrenceKind } = Refactor;

void test("planBatchRename requires an array", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(() => engine.planBatchRename(null as unknown as Array<RenameRequest>), {
        name: "TypeError",
        message: /requires an array/
    });
});

void test("planBatchRename requires at least one rename", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(() => engine.planBatchRename([]), {
        message: /at least one rename/
    });
});

void test("planBatchRename validates each rename request", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () => engine.planBatchRename([{ symbolId: "gml/script/foo" }] as unknown as Array<RenameRequest>),
        {
            name: "TypeError",
            message: /requires symbolId and newName/
        }
    );
});

void test("planBatchRename rejects duplicate symbol IDs", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    await assert.rejects(
        () =>
            engine.planBatchRename([
                { symbolId: "gml/script/scr_a", newName: "scr_new_a" },
                { symbolId: "gml/script/scr_a", newName: "scr_new_b" }
            ]),
        {
            message: /Duplicate rename request for symbolId/
        }
    );
});

void test("planBatchRename detects duplicate target names", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    await assert.rejects(
        () =>
            engine.planBatchRename([
                { symbolId: "gml/script/scr_a", newName: "scr_new" },
                { symbolId: "gml/script/scr_b", newName: "scr_new" }
            ]),
        {
            message: /Cannot rename multiple symbols to 'scr_new'/
        }
    );
});

void test("planBatchRename combines multiple renames", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => {
            if (name === "scr_a") {
                return [{ path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }];
            }
            if (name === "scr_b") {
                return [{ path: "test.gml", start: 20, end: 25, scopeId: "scope-1" }];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const workspace = await engine.planBatchRename([
        { symbolId: "gml/script/scr_a", newName: "scr_new_a" },
        { symbolId: "gml/script/scr_b", newName: "scr_new_b" }
    ]);

    assert.ok(typeof workspace.addEdit === "function");
    assert.ok(typeof workspace.groupByFile === "function");
    assert.ok(Array.isArray(workspace.edits));
    assert.equal(workspace.edits.length, 2);
    assert.equal(workspace.edits[0].newText, "scr_new_a");
    assert.equal(workspace.edits[1].newText, "scr_new_b");
});

void test("planBatchRename validates merged edits for overlaps", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => {
            // Create overlapping ranges
            if (name === "scr_a") {
                return [{ path: "test.gml", start: 0, end: 10, scopeId: "scope-1" }];
            }
            if (name === "scr_b") {
                return [{ path: "test.gml", start: 5, end: 15, scopeId: "scope-1" }];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    await assert.rejects(
        () =>
            engine.planBatchRename([
                { symbolId: "gml/script/scr_a", newName: "scr_new_a" },
                { symbolId: "gml/script/scr_b", newName: "scr_new_b" }
            ]),
        {
            message: /Batch rename validation failed.*Overlapping/
        }
    );
});

void test("planBatchRename detects simple circular rename (A→B, B→A)", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    await assert.rejects(
        () =>
            engine.planBatchRename([
                { symbolId: "gml/script/scr_foo", newName: "scr_bar" },
                { symbolId: "gml/script/scr_bar", newName: "scr_foo" }
            ]),
        {
            message: /Circular rename chain detected.*scr_foo.*scr_bar/
        }
    );
});

void test("planBatchRename detects three-way circular rename (A→B→C→A)", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    await assert.rejects(
        () =>
            engine.planBatchRename([
                { symbolId: "gml/script/scr_alpha", newName: "scr_beta" },
                { symbolId: "gml/script/scr_beta", newName: "scr_gamma" },
                { symbolId: "gml/script/scr_gamma", newName: "scr_alpha" }
            ]),
        {
            message: /Circular rename chain detected/
        }
    );
});

void test("planBatchRename allows non-circular chain renames (A→B→C)", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => {
            if (name === "scr_alpha") {
                return [
                    {
                        path: "file1.gml",
                        start: 0,
                        end: 9,
                        scopeId: "scope-1"
                    }
                ];
            }
            if (name === "scr_beta") {
                return [
                    {
                        path: "file2.gml",
                        start: 10,
                        end: 18,
                        scopeId: "scope-2"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    // This should succeed because scr_alpha→scr_beta, scr_beta→scr_gamma forms
    // a non-circular chain (scr_gamma is not renamed back to scr_alpha)
    const workspace = await engine.planBatchRename([
        { symbolId: "gml/script/scr_alpha", newName: "scr_beta" },
        { symbolId: "gml/script/scr_beta", newName: "scr_gamma" }
    ]);

    assert.ok(typeof workspace.addEdit === "function");
    assert.ok(typeof workspace.groupByFile === "function");
    assert.ok(Array.isArray(workspace.edits));
    assert.ok(workspace.edits.length > 0);
});

void test("planBatchRename allows independent renames without cycles", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => {
            if (name === "scr_foo") {
                return [
                    {
                        path: "file1.gml",
                        start: 0,
                        end: 7,
                        scopeId: "scope-1"
                    }
                ];
            }
            if (name === "scr_bar") {
                return [
                    {
                        path: "file2.gml",
                        start: 20,
                        end: 27,
                        scopeId: "scope-2"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    // Independent renames should succeed
    const workspace = await engine.planBatchRename([
        { symbolId: "gml/script/scr_foo", newName: "scr_foo_renamed" },
        { symbolId: "gml/script/scr_bar", newName: "scr_bar_renamed" }
    ]);

    assert.ok(typeof workspace.addEdit === "function");
    assert.ok(typeof workspace.groupByFile === "function");
    assert.ok(Array.isArray(workspace.edits));
    assert.equal(workspace.edits.length, 2);
});

void test("executeBatchRename validates required parameters", async () => {
    const engine = new RefactorEngineClass();
    type ExecuteBatchRenameArgs = Parameters<RefactorEngine["executeBatchRename"]>[0];
    const invalidRequest = {} as ExecuteBatchRenameArgs;
    await assert.rejects(() => engine.executeBatchRename(invalidRequest), {
        name: "TypeError",
        message: /requires renames array/
    });
});

void test("executeBatchRename performs complete batch rename workflow", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => {
            if (name === "scr_a") {
                return [{ path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }];
            }
            if (name === "scr_b") {
                return [{ path: "test.gml", start: 16, end: 21, scopeId: "scope-1" }];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const files = { "test.gml": "scr_a some code scr_b" };
    const readFile: WorkspaceReadFile = async (path) => files[path];
    const writeFile: WorkspaceWriteFile = async (path, content) => {
        files[path] = content;
    };

    const result = await engine.executeBatchRename({
        renames: [
            { symbolId: "gml/script/scr_a", newName: "scr_x" },
            { symbolId: "gml/script/scr_b", newName: "scr_y" }
        ],
        readFile,
        writeFile
    });

    assert.ok(typeof result.workspace.addEdit === "function");
    assert.ok(typeof result.workspace.groupByFile === "function");
    assert.ok(Array.isArray(result.workspace.edits));
    assert.equal(result.applied.size, 1);
    assert.equal(result.applied.get("test.gml"), "scr_x some code scr_y");
    assert.equal(files["test.gml"], "scr_x some code scr_y");
});

void test("executeBatchRename prepares hot reload when requested", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => {
            if (name === "scr_a") {
                return [{ path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }];
            }
            return [];
        },
        getFileSymbols: () => [{ id: "gml/script/scr_test" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const readFile: WorkspaceReadFile = async () => "scr_a";
    const writeFile: WorkspaceWriteFile = async () => {};

    const result = await engine.executeBatchRename({
        renames: [{ symbolId: "gml/script/scr_a", newName: "scr_x" }],
        readFile,
        writeFile,
        prepareHotReload: true
    });

    assert.ok(Array.isArray(result.hotReloadUpdates));
    assert.ok(result.hotReloadUpdates.length > 0);
    assert.equal(result.hotReloadUpdates[0].action, "recompile");
});

// Impact analysis tests.
void test("analyzeRenameImpact requires symbolId and newName", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () =>
            engine.analyzeRenameImpact({
                symbolId: "gml/script/foo"
            } as unknown as RenameRequest),
        {
            name: "TypeError",
            message: /requires symbolId and newName/
        }
    );
});

void test("analyzeRenameImpact detects missing symbol", async () => {
    const mockSemantic = {
        hasSymbol: () => false
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.analyzeRenameImpact({
        symbolId: "gml/script/missing",
        newName: "scr_new"
    });

    assert.equal(result.valid, false);
    assert.ok(result.conflicts.length > 0);
    assert.equal(result.conflicts[0].type, "missing_symbol");
});

void test("analyzeRenameImpact provides comprehensive summary", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            {
                path: "file1.gml",
                start: 0,
                end: 10,
                scopeId: "scope-1",
                kind: OccurrenceKind.DEFINITION
            },
            {
                path: "file1.gml",
                start: 50,
                end: 60,
                scopeId: "scope-1",
                kind: OccurrenceKind.REFERENCE
            },
            {
                path: "file2.gml",
                start: 20,
                end: 30,
                scopeId: "scope-2",
                kind: OccurrenceKind.REFERENCE
            }
        ]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.analyzeRenameImpact({
        symbolId: "gml/script/scr_test",
        newName: "scr_renamed"
    });

    assert.equal(result.valid, true);
    assert.equal(result.summary.oldName, "scr_test");
    assert.equal(result.summary.newName, "scr_renamed");
    assert.equal(result.summary.totalOccurrences, 3);
    assert.equal(result.summary.definitionCount, 1);
    assert.equal(result.summary.referenceCount, 2);
    assert.equal(result.summary.affectedFiles.length, 2);
    assert.ok(result.summary.affectedFiles.includes("file1.gml"));
    assert.ok(result.summary.affectedFiles.includes("file2.gml"));
    assert.equal(result.summary.hotReloadRequired, true);
});

void test("analyzeRenameImpact detects reserved keyword conflicts", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 10, scopeId: "scope-1" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.analyzeRenameImpact({
        symbolId: "gml/script/scr_test",
        newName: "if"
    });

    assert.equal(result.valid, false);
    assert.ok(result.conflicts.length > 0);
    assert.equal(result.conflicts[0].type, "reserved");
});

void test("analyzeRenameImpact warns about large renames", async () => {
    const occurrences = [];
    for (let i = 0; i < 60; i++) {
        occurrences.push({
            path: `file${i % 10}.gml`,
            start: i * 100,
            end: i * 100 + 10,
            scopeId: `scope-${i}`,
            kind: OccurrenceKind.REFERENCE
        });
    }

    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => occurrences
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.analyzeRenameImpact({
        symbolId: "gml/script/scr_test",
        newName: "scr_renamed"
    });

    assert.equal(result.valid, true);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings.some((w) => w.type === "large_rename"));
});

void test("analyzeRenameImpact tracks dependent symbols", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 10, scopeId: "scope-1" }],
        getDependents: async () => [
            {
                symbolId: "gml/script/scr_dependent1",
                filePath: "deps/dependent1.gml"
            },
            {
                symbolId: "gml/script/scr_dependent2",
                filePath: "deps/dependent2.gml"
            }
        ]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.analyzeRenameImpact({
        symbolId: "gml/script/scr_test",
        newName: "scr_renamed"
    });

    assert.equal(result.valid, true);
    assert.equal(result.summary.dependentSymbols.length, 2);
    assert.ok(result.summary.dependentSymbols.includes("gml/script/scr_dependent1"));
    assert.ok(result.summary.dependentSymbols.includes("gml/script/scr_dependent2"));
});

void test("analyzeRenameImpact handles errors gracefully", async () => {
    const mockSemantic = {
        hasSymbol: () => {
            throw new Error("Semantic analyzer error");
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.analyzeRenameImpact({
        symbolId: "gml/script/scr_test",
        newName: "scr_renamed"
    });

    assert.equal(result.valid, false);
    assert.ok(result.conflicts.length > 0);
    assert.equal(result.conflicts[0].type, "analysis_error");
});
