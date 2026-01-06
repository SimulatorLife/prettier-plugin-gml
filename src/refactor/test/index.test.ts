import assert from "node:assert/strict";
import test from "node:test";
import {
    Refactor,
    type HotReloadUpdate,
    type ParserBridge,
    type PartialSemanticAnalyzer,
    type RefactorEngine,
    type RenameRequest,
    type WorkspaceEdit,
    type WorkspaceReadFile,
    type WorkspaceWriteFile
} from "../src/index.js";

const {
    RefactorEngine: RefactorEngineClass,
    WorkspaceEdit: WorkspaceEditFactory,
    createRefactorEngine,
    ConflictType
} = Refactor;

void test("createRefactorEngine returns a RefactorEngine", () => {
    const engine = createRefactorEngine();
    assert.ok(engine instanceof RefactorEngineClass);
});

void test("createRefactorEngine accepts dependencies", () => {
    const mockParser: ParserBridge = {
        parse: async () => ({ start: 0, end: 0, type: "root" })
    };
    const mockSemantic: PartialSemanticAnalyzer = {};
    const engine = createRefactorEngine({
        parser: mockParser,
        semantic: mockSemantic
    });
    assert.equal(engine.parser, mockParser);
    assert.equal(engine.semantic, mockSemantic);
});

void test("WorkspaceEdit starts empty", () => {
    const ws = new WorkspaceEditFactory();
    assert.equal(ws.edits.length, 0);
});

void test("WorkspaceEdit can add edits", () => {
    const ws = new WorkspaceEditFactory();
    ws.addEdit("file.gml", 0, 10, "newText");
    assert.equal(ws.edits.length, 1);
    assert.equal(ws.edits[0].path, "file.gml");
    assert.equal(ws.edits[0].start, 0);
    assert.equal(ws.edits[0].end, 10);
    assert.equal(ws.edits[0].newText, "newText");
});

void test("WorkspaceEdit groups edits by file", () => {
    const ws = new WorkspaceEditFactory();
    ws.addEdit("file1.gml", 0, 10, "text1");
    ws.addEdit("file2.gml", 20, 30, "text2");
    ws.addEdit("file1.gml", 40, 50, "text3");

    const grouped = ws.groupByFile();
    assert.equal(grouped.size, 2);
    assert.equal(grouped.get("file1.gml").length, 2);
    assert.equal(grouped.get("file2.gml").length, 1);
});

void test("WorkspaceEdit sorts edits descending by start position", () => {
    const ws = new WorkspaceEditFactory();
    ws.addEdit("file.gml", 10, 20, "a");
    ws.addEdit("file.gml", 50, 60, "b");
    ws.addEdit("file.gml", 30, 40, "c");

    const grouped = ws.groupByFile();
    const edits = grouped.get("file.gml");
    assert.equal(edits[0].start, 50); // Highest first
    assert.equal(edits[1].start, 30);
    assert.equal(edits[2].start, 10); // Lowest last
});

void test("planRename validates missing symbolId", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () =>
            engine.planRename({
                newName: "bar"
            } as unknown as RenameRequest),
        {
            name: "TypeError",
            message: "planRename requires symbolId and newName"
        }
    );
});

void test("planRename validates missing newName", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () =>
            engine.planRename({
                symbolId: "gml/script/foo"
            } as unknown as RenameRequest),
        {
            name: "TypeError",
            message: "planRename requires symbolId and newName"
        }
    );
});

void test("planRename validates symbolId type", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () =>
            engine.planRename({
                symbolId: 123,
                newName: "bar"
            } as unknown as RenameRequest),
        {
            name: "TypeError",
            message: /symbolId must be a string/
        }
    );
});

void test("planRename validates newName type", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () =>
            engine.planRename({
                symbolId: "gml/script/foo",
                newName: 456
            } as unknown as RenameRequest),
        {
            name: "TypeError",
            message: /Identifier names must be strings/
        }
    );
});

void test("planRename rejects whitespace-padded names", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    await assert.rejects(
        () =>
            engine.planRename({
                symbolId: "gml/script/scr_test",
                newName: " scr_new "
            }),
        {
            message: /must not include leading or trailing whitespace/
        }
    );
});

void test("planRename rejects invalid identifier characters", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    await assert.rejects(
        () =>
            engine.planRename({
                symbolId: "gml/script/scr_test",
                newName: "scr-new"
            }),
        {
            message: /not a valid GML identifier/
        }
    );
});

void test("planRename rejects renaming to the existing name", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    await assert.rejects(
        () =>
            engine.planRename({
                symbolId: "gml/script/scr_test",
                newName: "scr_test"
            }),
        {
            message: /matches the existing identifier/
        }
    );
});

void test("planRename checks symbol existence with semantic analyzer", async () => {
    const mockSemantic = {
        hasSymbol: (id) => id === "gml/script/exists"
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    await assert.rejects(
        () =>
            engine.planRename({
                symbolId: "gml/script/missing",
                newName: "bar"
            }),
        {
            message: /Symbol 'gml\/script\/missing' not found/
        }
    );
});

void test("planRename detects reserved keyword conflicts", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 10, scopeId: "scope-1" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    await assert.rejects(
        () =>
            engine.planRename({
                symbolId: "gml/script/scr_test",
                newName: "if"
            }),
        {
            message: /reserved keyword/
        }
    );
});

void test("planRename creates workspace edit with occurrences", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            { path: "test.gml", start: 0, end: 10, scopeId: "scope-1" },
            { path: "test.gml", start: 50, end: 60, scopeId: "scope-1" }
        ]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const workspace = await engine.planRename({
        symbolId: "gml/script/scr_old",
        newName: "scr_new"
    });

    assert.ok(typeof workspace.addEdit === "function");
    assert.ok(typeof workspace.groupByFile === "function");
    assert.ok(Array.isArray(workspace.edits));
    assert.equal(workspace.edits.length, 2);
    assert.equal(workspace.edits[0].newText, "scr_new");
    assert.equal(workspace.edits[1].newText, "scr_new");
});

void test("validateSymbolExists requires semantic analyzer", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(() => engine.validateSymbolExists("gml/script/foo"), {
        message: /RefactorEngine requires a semantic analyzer/
    });
});

void test("validateSymbolExists returns true when semantic lacks hasSymbol", async () => {
    const mockSemantic = {}; // No hasSymbol method
    const engine = new RefactorEngineClass({ semantic: mockSemantic });
    const result = await engine.validateSymbolExists("gml/script/foo");
    assert.equal(result, true);
});

void test("validateRename detects invalid workspace", async () => {
    const engine = new RefactorEngineClass();
    const result = await engine.validateRename(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
});

void test("validateRename detects empty workspace", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    const result = await engine.validateRename(ws);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("no changes")));
});

void test("validateRename detects overlapping edits", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 10, "a");
    ws.addEdit("test.gml", 5, 15, "b"); // Overlaps with previous
    const result = await engine.validateRename(ws);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Overlapping")));
});

void test("validateRename warns about large refactorings", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    // Add many edits
    for (let i = 0; i < 60; i++) {
        ws.addEdit("test.gml", i * 100, i * 100 + 10, "x");
    }
    const result = await engine.validateRename(ws);
    assert.ok(result.warnings.some((w) => w.includes("Large number")));
});

void test("validateRename passes with valid non-overlapping edits", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 10, "a");
    ws.addEdit("test.gml", 20, 30, "b");
    ws.addEdit("test.gml", 40, 50, "c");
    const result = await engine.validateRename(ws);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
});

void test("gatherSymbolOccurrences returns empty array without semantic", async () => {
    const engine = new RefactorEngineClass();
    const occurrences = await engine.gatherSymbolOccurrences("test");
    assert.deepEqual(occurrences, []);
});

void test("gatherSymbolOccurrences uses semantic analyzer when available", async () => {
    const mockOccurrences = [
        { path: "test.gml", start: 0, end: 10 },
        { path: "test.gml", start: 50, end: 60 }
    ];
    const mockSemantic = {
        getSymbolOccurrences: () => mockOccurrences
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });
    const occurrences = await engine.gatherSymbolOccurrences("test");
    assert.deepEqual(occurrences, mockOccurrences);
});

void test("prepareHotReloadUpdates returns empty for empty workspace", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    const updates = await engine.prepareHotReloadUpdates(ws);
    assert.ok(Array.isArray(updates));
    assert.equal(updates.length, 0);
});

void test("prepareHotReloadUpdates creates updates for edited files", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 10, "newcode");
    const updates = await engine.prepareHotReloadUpdates(ws);
    assert.ok(updates.length > 0);
    assert.equal(updates[0].filePath, "test.gml");
    assert.equal(updates[0].action, "recompile");
});

void test("prepareHotReloadUpdates uses semantic file symbols when available", async () => {
    const mockSemantic = {
        getFileSymbols: () => [{ id: "gml/script/scr_test" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 10, "newcode");
    const updates = await engine.prepareHotReloadUpdates(ws);
    assert.ok(updates.length > 0);
    assert.equal(updates[0].symbolId, "gml/script/scr_test");
});

void test("prepareHotReloadUpdates includes transitive dependents from cascade", async () => {
    const mockSemantic = {
        getFileSymbols: () => [{ id: "gml/script/scr_root" }],
        getDependents: async (symbolIds: Array<string>) => {
            const id = symbolIds[0];
            if (id === "gml/script/scr_root") {
                return [
                    {
                        symbolId: "gml/script/scr_child",
                        filePath: "deps/child.gml"
                    }
                ];
            }
            if (id === "gml/script/scr_child") {
                return [
                    {
                        symbolId: "gml/script/scr_grandchild",
                        filePath: "deps/grandchild.gml"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });
    const ws = new WorkspaceEditFactory();
    ws.addEdit("scripts/root.gml", 0, 10, "updated");

    const updates = await engine.prepareHotReloadUpdates(ws);

    const childUpdate = updates.find((update) => update.symbolId === "gml/script/scr_child");
    const grandchildUpdate = updates.find((update) => update.symbolId === "gml/script/scr_grandchild");

    assert.ok(childUpdate);
    assert.equal(childUpdate?.action, "notify");
    assert.equal(childUpdate?.filePath, "deps/child.gml");
    assert.ok(grandchildUpdate);
    assert.equal(grandchildUpdate?.action, "notify");
    assert.equal(grandchildUpdate?.filePath, "deps/grandchild.gml");
});

void test("findSymbolAtLocation returns null without semantic", async () => {
    const engine = new RefactorEngineClass();
    const result = await engine.findSymbolAtLocation("test.gml", 10);
    assert.equal(result, null);
});

void test("findSymbolAtLocation uses semantic analyzer when available", async () => {
    const mockSymbol = {
        symbolId: "gml/script/scr_test",
        name: "scr_test",
        range: { start: 0, end: 10 }
    };
    const mockSemantic = {
        getSymbolAtPosition: () => mockSymbol
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });
    const result = await engine.findSymbolAtLocation("test.gml", 5);
    assert.deepEqual(result, mockSymbol);
});

void test("applyWorkspaceEdit requires a WorkspaceEdit", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () =>
            engine.applyWorkspaceEdit(null as unknown as WorkspaceEdit, {
                readFile: async () => ""
            }),
        {
            name: "TypeError",
            message: /requires a WorkspaceEdit/
        }
    );
});

void test("applyWorkspaceEdit requires readFile function", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    type ApplyWorkspaceEditParams = Parameters<RefactorEngine["applyWorkspaceEdit"]>[1];
    const invalidOptions = {} as ApplyWorkspaceEditParams;
    await assert.rejects(() => engine.applyWorkspaceEdit(ws, invalidOptions), {
        name: "TypeError",
        message: /requires a readFile function/
    });
});

void test("applyWorkspaceEdit requires writeFile when not in dry-run", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 5, "new");
    await assert.rejects(
        () =>
            engine.applyWorkspaceEdit(ws, {
                readFile: async () => "old text",
                dryRun: false
            }),
        {
            name: "TypeError",
            message: /requires a writeFile function/
        }
    );
});

void test("applyWorkspaceEdit applies edits correctly", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 3, "new");
    ws.addEdit("test.gml", 9, 13, "world");

    const readFile: WorkspaceReadFile = async () => "old text here";
    const writeFile: WorkspaceWriteFile = async () => {};

    const results = await engine.applyWorkspaceEdit(ws, {
        readFile,
        writeFile,
        dryRun: true
    });

    assert.equal(results.size, 1);
    assert.equal(results.get("test.gml"), "new text world");
});

void test("applyWorkspaceEdit handles multiple files", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("file1.gml", 0, 3, "abc");
    ws.addEdit("file2.gml", 0, 3, "xyz");

    const files = {
        "file1.gml": "old content",
        "file2.gml": "old content"
    };

    const readFile: WorkspaceReadFile = async (path) => files[path];
    const results = await engine.applyWorkspaceEdit(ws, {
        readFile,
        dryRun: true
    });

    assert.equal(results.size, 2);
    assert.equal(results.get("file1.gml"), "abc content");
    assert.equal(results.get("file2.gml"), "xyz content");
});

void test("applyWorkspaceEdit rejects invalid edits", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 10, "new");
    ws.addEdit("test.gml", 5, 15, "conflict"); // Overlapping edit

    const readFile: WorkspaceReadFile = async () => "some text here";

    await assert.rejects(() => engine.applyWorkspaceEdit(ws, { readFile, dryRun: true }), {
        message: /Overlapping edits/
    });
});

void test("executeRename validates required parameters", async () => {
    const engine = new RefactorEngineClass();
    type ExecuteRenameArgs = Parameters<RefactorEngine["executeRename"]>[0];
    const invalidRequest = {} as ExecuteRenameArgs;
    await assert.rejects(() => engine.executeRename(invalidRequest), {
        name: "TypeError",
        message: /requires symbolId and newName/
    });
});

void test("executeRename performs complete rename workflow", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            { path: "test.gml", start: 0, end: 5, scopeId: "scope-1" },
            { path: "test.gml", start: 16, end: 21, scopeId: "scope-1" }
        ]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const files = { "test.gml": "scr_a some code scr_a" };
    const readFile: WorkspaceReadFile = async (path) => files[path];
    const writeFile: WorkspaceWriteFile = async (path, content) => {
        files[path] = content;
    };

    const result = await engine.executeRename({
        symbolId: "gml/script/scr_a",
        newName: "scr_b",
        readFile,
        writeFile
    });

    assert.ok(typeof result.workspace.addEdit === "function");
    assert.ok(typeof result.workspace.groupByFile === "function");
    assert.ok(Array.isArray(result.workspace.edits));
    assert.equal(result.applied.size, 1);
    assert.equal(result.applied.get("test.gml"), "scr_b some code scr_b");
    assert.equal(files["test.gml"], "scr_b some code scr_b");
});

void test("executeRename rejects invalid planned edits", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            { path: "test.gml", start: 0, end: 5, scopeId: "scope-1" },
            { path: "test.gml", start: 4, end: 10, scopeId: "scope-1" } // Overlaps
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const readFile: WorkspaceReadFile = async () => "scr_old scr_old";
    let wrote = false;
    const writeFile: WorkspaceWriteFile = async () => {
        wrote = true;
    };

    await assert.rejects(
        () =>
            engine.executeRename({
                symbolId: "gml/script/scr_old",
                newName: "scr_new",
                readFile,
                writeFile
            }),
        { message: /Overlapping edits/ }
    );

    assert.equal(wrote, false);
});

void test("executeRename prepares hot reload updates when requested", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }],
        getFileSymbols: () => [{ id: "gml/script/scr_test" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const readFile: WorkspaceReadFile = async () => "scr_a";
    const writeFile: WorkspaceWriteFile = async () => {};

    const result = await engine.executeRename({
        symbolId: "gml/script/scr_a",
        newName: "scr_b",
        readFile,
        writeFile,
        prepareHotReload: true
    });

    assert.ok(Array.isArray(result.hotReloadUpdates));
    assert.ok(result.hotReloadUpdates.length > 0);
    assert.equal(result.hotReloadUpdates[0].action, "recompile");
});

void test("prepareRenamePlan aggregates planning, validation, and analysis", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            {
                path: "scripts/player.gml",
                start: 0,
                end: 6,
                scopeId: "scope-1",
                kind: "definition"
            },
            {
                path: "scripts/player.gml",
                start: 20,
                end: 26,
                scopeId: "scope-1",
                kind: "reference"
            }
        ],
        validateEdits: async () => ({
            errors: [],
            warnings: ["semantic warning"]
        }),
        getDependents: async () => [
            {
                symbolId: "gml/script/scr_helper",
                filePath: "scripts/helper.gml"
            }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.prepareRenamePlan({
        symbolId: "gml/script/scr_player",
        newName: "scr_player_new"
    });

    assert.ok(typeof result.workspace.addEdit === "function");
    assert.ok(typeof result.workspace.groupByFile === "function");
    assert.ok(Array.isArray(result.workspace.edits));
    assert.equal(result.validation.valid, true);
    assert.ok(result.validation.warnings.includes("semantic warning"));
    assert.equal(result.hotReload, null);
    assert.equal(result.analysis.valid, true);
    assert.equal(result.analysis.summary.newName, "scr_player_new");
    assert.ok(result.analysis.summary.dependentSymbols.includes("gml/script/scr_helper"));
});

void test("prepareRenamePlan optionally validates hot reload compatibility", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            {
                path: "scripts/player.gml",
                start: 0,
                end: 6,
                scopeId: "scope-1",
                kind: "definition"
            }
        ]
    };

    const mockFormatter = {
        transpileScript: async () => ({ kind: "script" })
    };

    const engine = new RefactorEngineClass({
        semantic: mockSemantic,
        formatter: mockFormatter
    });

    const result = await engine.prepareRenamePlan(
        {
            symbolId: "gml/script/scr_player",
            newName: "scr_player_new"
        },
        { validateHotReload: true, hotReloadOptions: { checkTranspiler: true } }
    );

    assert.equal(result.validation.valid, true);
    assert.ok(result.hotReload);
    assert.equal(result.hotReload.valid, true);
    assert.ok(
        result.hotReload.warnings.some((warning) => warning.includes("Transpiler compatibility check requested"))
    );
});

void test("prepareRenamePlan surfaces hot reload safety for macro renames", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            {
                path: "scripts/macros.gml",
                start: 0,
                end: 7,
                scopeId: "scope-1",
                kind: "definition"
            }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.prepareRenamePlan(
        {
            symbolId: "gml/macro/MAX_HP",
            newName: "MAX_HEALTH"
        },
        { validateHotReload: true }
    );

    assert.ok(result.hotReload);
    assert.equal(result.hotReload.valid, false);
    assert.ok(
        result.hotReload.warnings.some((warning) =>
            warning.includes("Macro/enum renames require dependent script recompilation")
        )
    );
    assert.ok(result.hotReload.hotReload);
    assert.equal(result.hotReload.hotReload.safe, false);
});

void test("prepareBatchRenamePlan aggregates batch planning and validation", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name: string) => [
            {
                path: `scripts/${name}.gml`,
                start: 0,
                end: name.length,
                scopeId: "scope-1",
                kind: "definition"
            }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.prepareBatchRenamePlan([
        { symbolId: "gml/script/scr_old_a", newName: "scr_new_a" },
        { symbolId: "gml/script/scr_old_b", newName: "scr_new_b" }
    ]);

    assert.ok(result.workspace);
    assert.ok(result.validation);
    assert.equal(result.validation.valid, true);
    assert.ok(result.batchValidation);
    assert.equal(result.batchValidation.valid, true);
    assert.ok(result.impactAnalyses);
    assert.equal(result.impactAnalyses.size, 2);
});

void test("prepareBatchRenamePlan includes hot reload cascade when requested", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name: string) => [
            {
                path: `scripts/${name}.gml`,
                start: 0,
                end: name.length,
                scopeId: "scope-1",
                kind: "definition"
            }
        ],
        getDependents: (symbolIds: Array<string>) => {
            // Only return dependents for the original symbols, not for the _dependent symbols
            return symbolIds
                .filter((id) => !id.includes("_dependent"))
                .map((id) => ({
                    symbolId: `${id}_dependent`,
                    filePath: `scripts/${id.split("/").pop()}_dependent.gml`
                }));
        }
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.prepareBatchRenamePlan(
        [
            { symbolId: "gml/script/scr_base", newName: "scr_base_new" },
            { symbolId: "gml/script/scr_helper", newName: "scr_helper_new" }
        ],
        { validateHotReload: true }
    );

    assert.ok(result.cascadeResult, "Cascade result should exist when hot reload is validated");
    assert.ok(result.cascadeResult.cascade.length > 0);
    assert.ok(result.cascadeResult.order.length > 0);
    assert.ok(result.cascadeResult.metadata);
});

void test("prepareBatchRenamePlan detects batch conflicts", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    // Try to rename two different symbols to the same name
    const result = await engine.prepareBatchRenamePlan([
        { symbolId: "gml/script/scr_a", newName: "scr_conflict" },
        { symbolId: "gml/script/scr_b", newName: "scr_conflict" }
    ]);

    assert.equal(result.batchValidation.valid, false);
    assert.ok(result.batchValidation.errors.length > 0);
    assert.ok(result.batchValidation.conflictingSets.length > 0);
    assert.ok(result.batchValidation.errors.some((err) => err.includes("Multiple symbols cannot be renamed to")));
});

void test("prepareBatchRenamePlan includes per-symbol impact analysis", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name: string) => {
            const count = name === "scr_many" ? 51 : 5;
            return Array.from({ length: count }, (_, i) => ({
                path: `scripts/${name}_file${i}.gml`,
                start: i * 10,
                end: i * 10 + name.length,
                scopeId: `scope-${i}`,
                kind: i === 0 ? "definition" : "reference"
            }));
        }
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.prepareBatchRenamePlan([
        { symbolId: "gml/script/scr_many", newName: "scr_many_new" },
        { symbolId: "gml/script/scr_few", newName: "scr_few_new" }
    ]);

    assert.equal(result.impactAnalyses.size, 2);

    const manyAnalysis = result.impactAnalyses.get("gml/script/scr_many");
    assert.ok(manyAnalysis);
    assert.equal(manyAnalysis.summary.totalOccurrences, 51);
    assert.ok(manyAnalysis.warnings.some((w) => w.type === ConflictType.LARGE_RENAME));

    const fewAnalysis = result.impactAnalyses.get("gml/script/scr_few");
    assert.ok(fewAnalysis);
    assert.equal(fewAnalysis.summary.totalOccurrences, 5);
});

void test("prepareBatchRenamePlan handles individual analysis failures gracefully", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name: string) => {
            // Return empty occurrences for scr_missing to simulate analysis issues
            if (name === "scr_missing") {
                return [];
            }
            return [
                {
                    path: `scripts/${name}.gml`,
                    start: 0,
                    end: name.length,
                    scopeId: "scope-1",
                    kind: "definition"
                }
            ];
        }
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.prepareBatchRenamePlan([
        { symbolId: "gml/script/scr_exists", newName: "scr_exists_new" },
        { symbolId: "gml/script/scr_missing", newName: "scr_missing_new" }
    ]);

    assert.equal(result.impactAnalyses.size, 2);

    const existsAnalysis = result.impactAnalyses.get("gml/script/scr_exists");
    assert.ok(existsAnalysis);
    assert.equal(existsAnalysis.valid, true);

    const missingAnalysis = result.impactAnalyses.get("gml/script/scr_missing");
    assert.ok(missingAnalysis);
    // With 0 occurrences, the workspace will be empty which causes validation to fail
    // The batch planning will catch this and report it
    assert.ok(result.validation.errors.length > 0 || missingAnalysis.summary.totalOccurrences === 0);
});

void test("prepareBatchRenamePlan validates hot reload compatibility when requested", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            {
                path: "scripts/test.gml",
                start: 0,
                end: 10,
                scopeId: "scope-1",
                kind: "definition"
            }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.prepareBatchRenamePlan([{ symbolId: "gml/script/scr_test", newName: "scr_test_new" }], {
        validateHotReload: true,
        hotReloadOptions: { checkTranspiler: true }
    });

    assert.ok(result.hotReload);
    assert.ok(typeof result.hotReload.valid === "boolean");
    assert.ok(Array.isArray(result.hotReload.errors));
    assert.ok(Array.isArray(result.hotReload.warnings));
});

void test("prepareBatchRenamePlan handles cascade computation failures gracefully", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name: string) => [
            {
                path: `scripts/${name}.gml`,
                start: 0,
                end: name.length,
                scopeId: "scope-1",
                kind: "definition"
            }
        ],
        getDependents: () => {
            throw new Error("Cascade computation failed");
        }
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.prepareBatchRenamePlan([{ symbolId: "gml/script/scr_test", newName: "scr_test_new" }], {
        validateHotReload: true
    });

    assert.equal(result.cascadeResult, null);
    assert.ok(result.hotReload);
    assert.ok(result.hotReload.warnings.some((w) => w.includes("Failed to compute hot reload cascade")));
});

void test("prepareBatchRenamePlan includes circular dependency detection", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name: string) => [
            {
                path: `scripts/${name}.gml`,
                start: 0,
                end: name.length,
                scopeId: "scope-1",
                kind: "definition"
            }
        ],
        getDependents: (symbolIds: Array<string>) => {
            // Create a circular dependency: A depends on B, B depends on A
            return symbolIds.map((id) => {
                return id === "gml/script/scr_a"
                    ? { symbolId: "gml/script/scr_b", filePath: "scripts/scr_b.gml" }
                    : { symbolId: "gml/script/scr_a", filePath: "scripts/scr_a.gml" };
            });
        }
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.prepareBatchRenamePlan([{ symbolId: "gml/script/scr_a", newName: "scr_a_new" }], {
        validateHotReload: true
    });

    assert.ok(result.cascadeResult);
    assert.equal(result.cascadeResult.metadata.hasCircular, true);
    assert.ok(result.cascadeResult.circular.length > 0);
});

void test("prepareBatchRenamePlan works without hot reload validation", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name: string) => [
            {
                path: `scripts/${name}.gml`,
                start: 0,
                end: name.length,
                scopeId: "scope-1",
                kind: "definition"
            }
        ]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.prepareBatchRenamePlan([{ symbolId: "gml/script/scr_test", newName: "scr_test_new" }]);

    assert.equal(result.hotReload, null);
    assert.equal(result.cascadeResult, null);
    assert.ok(result.workspace);
    assert.ok(result.validation);
    assert.ok(result.batchValidation);
});

void test("generateTranspilerPatches requires array parameter", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () => engine.generateTranspilerPatches(null as unknown as Array<HotReloadUpdate>, async () => ""),
        {
            name: "TypeError",
            message: /requires an array/
        }
    );
});

void test("generateTranspilerPatches requires readFile function", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(() => engine.generateTranspilerPatches([], null as unknown as never), {
        name: "TypeError",
        message: /requires a readFile function/
    });
});

void test("generateTranspilerPatches creates basic patches without transpiler", async () => {
    const engine = new RefactorEngineClass();
    const updates: Array<HotReloadUpdate> = [
        {
            symbolId: "gml/script/scr_test",
            action: "recompile",
            filePath: "test.gml",
            affectedRanges: []
        }
    ];

    const readFile: WorkspaceReadFile = async () => "function void test() { return 42; }";
    const patches = await engine.generateTranspilerPatches(updates, readFile);

    assert.equal(patches.length, 1);
    assert.equal(patches[0].symbolId, "gml/script/scr_test");
    assert.equal(patches[0].filePath, "test.gml");
    assert.ok(patches[0].patch);
    assert.equal(patches[0].patch.kind, "script");
});

void test("generateTranspilerPatches skips non-recompile actions", async () => {
    const engine = new RefactorEngineClass();
    const updates: Array<HotReloadUpdate> = [
        {
            symbolId: "gml/script/scr_test",
            action: "notify",
            filePath: "test.gml",
            affectedRanges: []
        }
    ];

    const readFile: WorkspaceReadFile = async () => "function void test() {}";
    const patches = await engine.generateTranspilerPatches(updates, readFile);

    assert.equal(patches.length, 0);
});

void test("generateTranspilerPatches uses transpiler when available", async () => {
    const mockTranspiler = {
        transpileScript: async ({ sourceText, symbolId }) => ({
            kind: "script",
            id: symbolId,
            js_body: "transpiled code",
            sourceText,
            version: 123
        })
    };
    const engine = new RefactorEngineClass({ formatter: mockTranspiler });

    const updates: Array<HotReloadUpdate> = [
        {
            symbolId: "gml/script/scr_test",
            action: "recompile",
            filePath: "test.gml",
            affectedRanges: []
        }
    ];

    const readFile: WorkspaceReadFile = async () => "function void test() { return 42; }";
    const patches = await engine.generateTranspilerPatches(updates, readFile);

    assert.equal(patches.length, 1);
    assert.equal(patches[0].patch.js_body, "transpiled code");
});

void test("generateTranspilerPatches continues on individual errors", async () => {
    const mockTranspiler = {
        transpileScript: async ({ symbolId }) => {
            if (symbolId.includes("fail")) {
                throw new Error("Transpile failed");
            }
            return { kind: "script", id: symbolId, js_body: "ok" };
        }
    };
    const engine = new RefactorEngineClass({ formatter: mockTranspiler });

    const updates: Array<HotReloadUpdate> = [
        {
            symbolId: "gml/script/scr_fail",
            action: "recompile",
            filePath: "fail.gml",
            affectedRanges: []
        },
        {
            symbolId: "gml/script/scr_ok",
            action: "recompile",
            filePath: "ok.gml",
            affectedRanges: []
        }
    ];

    const readFile: WorkspaceReadFile = async () => "function void test() {}";
    const patches = await engine.generateTranspilerPatches(updates, readFile);

    // Should have one successful patch despite one failure
    assert.equal(patches.length, 1);
    assert.equal(patches[0].symbolId, "gml/script/scr_ok");
});

// Batch rename tests
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

// Impact analysis tests
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
                kind: "definition"
            },
            {
                path: "file1.gml",
                start: 50,
                end: 60,
                scopeId: "scope-1",
                kind: "reference"
            },
            {
                path: "file2.gml",
                start: 20,
                end: 30,
                scopeId: "scope-2",
                kind: "reference"
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
            kind: "reference"
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

// Hot reload validation tests
void test("validateHotReloadCompatibility requires a WorkspaceEdit", async () => {
    const engine = new RefactorEngineClass();
    const result = await engine.validateHotReloadCompatibility(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Invalid workspace")));
});

void test("validateHotReloadCompatibility warns for empty workspace", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("no changes")));
});

void test("validateHotReloadCompatibility warns about non-GML files", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.txt", 0, 5, "new");
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.ok(result.warnings.some((w) => w.includes("not a GML script")));
});

void test("validateHotReloadCompatibility detects globalvar changes", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 5, "globalvar myvar;");
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.ok(result.warnings.some((w) => w.includes("globalvar")));
});

void test("validateHotReloadCompatibility detects macro changes", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 5, "#macro MAX_HP 100");
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.ok(result.warnings.some((w) => w.includes("#macro")));
});

void test("validateHotReloadCompatibility detects enum changes", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 5, "enum State { Idle, Running }");
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.ok(result.warnings.some((w) => w.includes("enum")));
});

void test("validateHotReloadCompatibility warns about large edits", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    const largeText = "x".repeat(6000);
    ws.addEdit("test.gml", 0, 5, largeText);
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.ok(result.warnings.some((w) => w.includes("Large edit")));
});

void test("validateHotReloadCompatibility handles transpiler check option", async () => {
    const mockTranspiler = {
        transpileScript: async () => ({ kind: "script", js_body: "ok" })
    };
    const engine = new RefactorEngineClass({ formatter: mockTranspiler });
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 5, "new code");

    const result = await engine.validateHotReloadCompatibility(ws, {
        checkTranspiler: true
    });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("Transpiler compatibility")));
});

void test("validateHotReloadCompatibility passes for simple renames", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 5, "newName");
    ws.addEdit("test.gml", 50, 55, "newName");

    const result = await engine.validateHotReloadCompatibility(ws);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
});

// Hot reload cascade tests
void test("computeHotReloadCascade requires array parameter", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(() => engine.computeHotReloadCascade(null), {
        name: "TypeError",
        message: /requires an array/
    });
});

void test("computeHotReloadCascade returns empty for no changes", async () => {
    const engine = new RefactorEngineClass();
    const result = await engine.computeHotReloadCascade([]);

    assert.ok(Array.isArray(result.cascade));
    assert.equal(result.cascade.length, 0);
    assert.ok(Array.isArray(result.order));
    assert.equal(result.order.length, 0);
    assert.equal(result.metadata.totalSymbols, 0);
    assert.equal(result.metadata.maxDistance, 0);
    assert.equal(result.metadata.hasCircular, false);
});

void test("computeHotReloadCascade handles single symbol with no dependents", async () => {
    const mockSemantic = {
        getDependents: async () => [] // No dependents
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_leaf"]);

    assert.equal(result.cascade.length, 1);
    assert.equal(result.cascade[0].symbolId, "gml/script/scr_leaf");
    assert.equal(result.cascade[0].distance, 0);
    assert.equal(result.cascade[0].reason, "direct change");
    assert.equal(result.metadata.totalSymbols, 1);
    assert.equal(result.metadata.maxDistance, 0);
});

void test("computeHotReloadCascade computes single-level dependencies", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            if (symbolIds[0] === "gml/script/scr_base") {
                return [
                    {
                        symbolId: "gml/script/scr_dep1",
                        filePath: "deps/dep1.gml"
                    },
                    {
                        symbolId: "gml/script/scr_dep2",
                        filePath: "deps/dep2.gml"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_base"]);

    assert.equal(result.cascade.length, 3);
    assert.equal(result.metadata.totalSymbols, 3);
    assert.equal(result.metadata.maxDistance, 1);

    // Check that dependents are at distance 1
    const deps = result.cascade.filter((c) => c.distance === 1);
    assert.equal(deps.length, 2);
    assert.ok(deps.some((d) => d.symbolId === "gml/script/scr_dep1"));
    assert.ok(deps.some((d) => d.symbolId === "gml/script/scr_dep2"));
});

void test("computeHotReloadCascade computes multi-level transitive closure", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            const id = symbolIds[0];
            if (id === "gml/script/scr_root") {
                return [
                    {
                        symbolId: "gml/script/scr_middle",
                        filePath: "deps/middle.gml"
                    }
                ];
            }
            if (id === "gml/script/scr_middle") {
                return [
                    {
                        symbolId: "gml/script/scr_leaf1",
                        filePath: "deps/leaf1.gml"
                    },
                    {
                        symbolId: "gml/script/scr_leaf2",
                        filePath: "deps/leaf2.gml"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_root"]);

    assert.equal(result.cascade.length, 4); // root + middle + 2 leaves
    assert.equal(result.metadata.maxDistance, 2);

    // Verify distances
    const root = result.cascade.find((c) => c.symbolId === "gml/script/scr_root");
    const middle = result.cascade.find((c) => c.symbolId === "gml/script/scr_middle");
    const leaf1 = result.cascade.find((c) => c.symbolId === "gml/script/scr_leaf1");
    const leaf2 = result.cascade.find((c) => c.symbolId === "gml/script/scr_leaf2");

    assert.equal(root.distance, 0);
    assert.equal(middle.distance, 1);
    assert.equal(leaf1.distance, 2);
    assert.equal(leaf2.distance, 2);
});

void test("computeHotReloadCascade orders symbols in dependency order", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            const id = symbolIds[0];
            if (id === "gml/script/scr_a") {
                return [
                    {
                        symbolId: "gml/script/scr_b",
                        filePath: "deps/b.gml"
                    }
                ];
            }
            if (id === "gml/script/scr_b") {
                return [
                    {
                        symbolId: "gml/script/scr_c",
                        filePath: "deps/c.gml"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_a"]);

    // Order should be: leaves first (c), then middle (b), then root (a)
    // Because c depends on nothing in our set, b depends on a, c depends on b
    assert.equal(result.order.length, 3);

    // Find positions in the order
    const posA = result.order.indexOf("gml/script/scr_a");
    const posB = result.order.indexOf("gml/script/scr_b");
    const posC = result.order.indexOf("gml/script/scr_c");

    // A should come before B, B should come before C (in hot reload order)
    assert.ok(posA < posB, "A should be reloaded before B");
    assert.ok(posB < posC, "B should be reloaded before C");
});

void test("computeHotReloadCascade handles multiple changed symbols", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            const id = symbolIds[0];
            if (id === "gml/script/scr_a") {
                return [
                    {
                        symbolId: "gml/script/scr_shared",
                        filePath: "deps/shared.gml"
                    }
                ];
            }
            if (id === "gml/script/scr_b") {
                return [
                    {
                        symbolId: "gml/script/scr_shared",
                        filePath: "deps/shared.gml"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_a", "gml/script/scr_b"]);

    // Should include both roots and the shared dependent (only once)
    assert.equal(result.cascade.length, 3);
    assert.ok(result.cascade.some((c) => c.symbolId === "gml/script/scr_a"));
    assert.ok(result.cascade.some((c) => c.symbolId === "gml/script/scr_b"));
    assert.ok(result.cascade.some((c) => c.symbolId === "gml/script/scr_shared"));

    // Shared dependent should be at distance 1
    const shared = result.cascade.find((c) => c.symbolId === "gml/script/scr_shared");
    assert.equal(shared.distance, 1);
});

void test("computeHotReloadCascade detects circular dependencies", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            const id = symbolIds[0];
            // Create a cycle: a -> b -> c -> a
            if (id === "gml/script/scr_a") {
                return [
                    {
                        symbolId: "gml/script/scr_b",
                        filePath: "deps/b.gml"
                    }
                ];
            }
            if (id === "gml/script/scr_b") {
                return [
                    {
                        symbolId: "gml/script/scr_c",
                        filePath: "deps/c.gml"
                    }
                ];
            }
            if (id === "gml/script/scr_c") {
                return [
                    {
                        symbolId: "gml/script/scr_a",
                        filePath: "deps/a.gml"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_a"]);

    // Should include all three symbols
    assert.equal(result.cascade.length, 3);

    // Should detect the circular dependency
    assert.equal(result.metadata.hasCircular, true);

    // All symbols should still be in the order (possibly with cycles broken)
    assert.equal(result.order.length, 3);
});

void test("computeHotReloadCascade handles diamond dependencies", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            const id = symbolIds[0];
            // Diamond: root -> left + right, left -> bottom, right -> bottom
            if (id === "gml/script/scr_root") {
                return [
                    {
                        symbolId: "gml/script/scr_left",
                        filePath: "deps/left.gml"
                    },
                    {
                        symbolId: "gml/script/scr_right",
                        filePath: "deps/right.gml"
                    }
                ];
            }
            if (id === "gml/script/scr_left" || id === "gml/script/scr_right") {
                return [
                    {
                        symbolId: "gml/script/scr_bottom",
                        filePath: "deps/bottom.gml"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_root"]);

    // Should include all 4 symbols
    assert.equal(result.cascade.length, 4);

    // Bottom should appear only once despite multiple paths
    const bottomOccurrences = result.cascade.filter((c) => c.symbolId === "gml/script/scr_bottom");
    assert.equal(bottomOccurrences.length, 1);

    // Root should come before left and right
    const posRoot = result.order.indexOf("gml/script/scr_root");
    const posLeft = result.order.indexOf("gml/script/scr_left");
    const posRight = result.order.indexOf("gml/script/scr_right");
    const posBottom = result.order.indexOf("gml/script/scr_bottom");

    assert.ok(posRoot < posLeft);
    assert.ok(posRoot < posRight);
    assert.ok(posLeft < posBottom);
    assert.ok(posRight < posBottom);
});

void test("computeHotReloadCascade provides reason metadata", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            if (symbolIds[0] === "gml/script/scr_base") {
                return [
                    {
                        symbolId: "gml/script/scr_dep",
                        filePath: "deps/dep.gml"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_base"]);

    const base = result.cascade.find((c) => c.symbolId === "gml/script/scr_base");
    const dep = result.cascade.find((c) => c.symbolId === "gml/script/scr_dep");

    assert.equal(base.reason, "direct change");
    assert.ok(dep.reason.includes("depends on"));
    assert.ok(dep.reason.includes("scr_base"));
});

void test("computeHotReloadCascade works without semantic analyzer", async () => {
    const engine = new RefactorEngineClass(); // No semantic analyzer

    const result = await engine.computeHotReloadCascade(["gml/script/scr_test"]);

    // Should only include the changed symbol, no dependents
    assert.equal(result.cascade.length, 1);
    assert.equal(result.cascade[0].symbolId, "gml/script/scr_test");
    assert.equal(result.cascade[0].distance, 0);
});

// === checkHotReloadSafety tests ===

void test("checkHotReloadSafety rejects missing symbolId", async () => {
    const engine = new RefactorEngineClass();

    const result = await engine.checkHotReloadSafety({
        newName: "scr_new"
    } as unknown as RenameRequest);

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("missing symbolId"));
    assert.equal(result.requiresRestart, true);
    assert.equal(result.canAutoFix, false);
});

void test("checkHotReloadSafety rejects missing newName", async () => {
    const engine = new RefactorEngineClass();

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/script/scr_old"
    } as unknown as RenameRequest);

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("missing"));
    assert.equal(result.requiresRestart, true);
});

void test("checkHotReloadSafety requires semantic analyzer for safety checks", async () => {
    const engine = new RefactorEngineClass();

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/script/scr_old",
        newName: "scr_new"
    });

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("semantic analyzer"));
    assert.equal(result.requiresRestart, true);
    assert.ok(result.suggestions.length > 0);
});

void test("checkHotReloadSafety rejects invalid identifier names", async () => {
    const engine = new RefactorEngineClass();

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/script/scr_old",
        newName: "123invalid"
    });

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("Invalid identifier"));
    assert.equal(result.requiresRestart, true);
    assert.equal(result.canAutoFix, false);
});

void test("checkHotReloadSafety rejects non-existent symbols", async () => {
    const mockSemantic = {
        hasSymbol: () => false
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/script/scr_missing",
        newName: "scr_new"
    });

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("not found"));
    assert.equal(result.requiresRestart, true);
    assert.ok(result.suggestions.length > 0);
});

void test("checkHotReloadSafety rejects same-name renames", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/script/scr_test",
        newName: "scr_test"
    });

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("matches the existing identifier"));
    assert.equal(result.requiresRestart, false);
});

void test("checkHotReloadSafety rejects reserved keywords", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => [{ path: "test.gml", start: 0, end: name.length, scopeId: "scope-1" }],
        getReservedKeywords: () => ["if", "else", "while", "for", "function"]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/script/scr_old",
        newName: "function"
    });

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("reserved keyword"));
    assert.equal(result.requiresRestart, true);
    assert.equal(result.canAutoFix, false);
});

void test("checkHotReloadSafety handles shadowing conflicts", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => [{ path: "test.gml", start: 0, end: name.length, scopeId: "scope-1" }],
        lookup: (name, scopeId) => {
            // Simulate existing binding for newName that isn't the symbol we're renaming
            if (name === "existing" && scopeId === "scope-1") {
                return { name: "existing" };
            }
            return null;
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/script/scr_old",
        newName: "existing"
    });

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("shadowing"));
    assert.equal(result.requiresRestart, false);
    assert.equal(result.canAutoFix, true);
    assert.ok(result.suggestions.length > 0);
});

void test("checkHotReloadSafety approves script renames", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 8, scopeId: "scope-1" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/script/scr_old",
        newName: "scr_new"
    });

    assert.equal(result.safe, true);
    assert.ok(result.reason.includes("hot-reload-safe"));
    assert.equal(result.requiresRestart, false);
    assert.equal(result.canAutoFix, true);
    assert.ok(result.suggestions.length > 0);
});

void test("checkHotReloadSafety approves instance variable renames", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 2, scopeId: "scope-1" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/var/obj_enemy::hp",
        newName: "health"
    });

    assert.equal(result.safe, true);
    assert.ok(result.reason.includes("Instance variable"));
    assert.ok(result.reason.includes("hot-reload-safe"));
    assert.equal(result.requiresRestart, false);
    assert.ok(result.suggestions.some((s) => s.includes("scope qualification")));
});

void test("checkHotReloadSafety approves global variable renames", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 10, scopeId: "scope-1" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/var/global_score",
        newName: "global_points"
    });

    assert.equal(result.safe, true);
    assert.ok(result.reason.includes("Global variable"));
    assert.equal(result.requiresRestart, false);
    assert.ok(result.suggestions.some((s) => s.includes("preserved")));
});

void test("checkHotReloadSafety approves event renames", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/event/obj_enemy#Step",
        newName: "Step_Updated"
    });

    assert.equal(result.safe, true);
    assert.ok(result.reason.includes("Event"));
    assert.equal(result.requiresRestart, false);
    assert.ok(result.suggestions.some((s) => s.includes("event handlers")));
});

void test("checkHotReloadSafety flags macro renames as requiring recompilation", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 6, scopeId: "scope-1" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/macro/MAX_HP",
        newName: "MAX_HEALTH"
    });

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("recompilation"));
    assert.equal(result.requiresRestart, false);
    assert.equal(result.canAutoFix, true);
    assert.ok(result.suggestions.some((s) => s.includes("recompile")));
});

void test("checkHotReloadSafety flags enum renames as requiring recompilation", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 6, scopeId: "scope-1" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/enum/EnemyType",
        newName: "EnemyKind"
    });

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("recompilation"));
    assert.equal(result.canAutoFix, true);
});

void test("checkHotReloadSafety handles unknown symbol kinds gracefully", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/unknown/some_symbol",
        newName: "new_symbol"
    });

    // After refactoring to use typed SymbolKind enum, invalid symbol kinds
    // are now properly rejected with a clear error message instead of being
    // silently accepted. This is the correct behavior - fail fast.
    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("Invalid symbol kind"));
    assert.equal(result.requiresRestart, true);
    assert.equal(result.canAutoFix, false);
    assert.ok(result.suggestions.some((s) => s.includes("script, var, event, macro, enum")));
});

// verifyPostEditIntegrity tests
void test("verifyPostEditIntegrity validates input parameters", async () => {
    const engine = new RefactorEngineClass();

    // Missing symbolId
    const result0 = await engine.verifyPostEditIntegrity({
        symbolId: "",
        oldName: "old",
        newName: "new",
        workspace: new WorkspaceEditFactory(),
        readFile: async () => ""
    });
    assert.equal(result0.valid, false);
    assert.ok(result0.errors.some((e) => e.includes("Invalid symbolId")));

    // Missing oldName
    const result1 = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "",
        newName: "new",
        workspace: new WorkspaceEditFactory(),
        readFile: async () => ""
    });
    assert.equal(result1.valid, false);
    assert.ok(result1.errors.some((e) => e.includes("Invalid oldName")));

    // Missing newName
    const result2 = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "old",
        newName: "",
        workspace: new WorkspaceEditFactory(),
        readFile: async () => ""
    });
    assert.equal(result2.valid, false);
    assert.ok(result2.errors.some((e) => e.includes("Invalid newName")));

    // Invalid workspace
    const result3 = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "old",
        newName: "new",
        workspace: null as unknown as WorkspaceEdit,
        readFile: async () => ""
    });
    assert.equal(result3.valid, false);
    assert.ok(result3.errors.some((e) => e.includes("Invalid workspace")));

    // Invalid readFile
    const result4 = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "old",
        newName: "new",
        workspace: new WorkspaceEditFactory(),
        readFile: null as unknown as WorkspaceReadFile
    });
    assert.equal(result4.valid, false);
    assert.ok(result4.errors.some((e) => e.includes("Invalid readFile")));
});

void test("verifyPostEditIntegrity works without semantic analyzer", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 3, "new");

    const result = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "old",
        newName: "new",
        workspace: ws,
        readFile: async () => "function new() { return 42; }"
    });

    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("No semantic analyzer")));
});

void test("verifyPostEditIntegrity detects lingering old names", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 3, "new");

    const result = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "old",
        newName: "new",
        workspace: ws,
        readFile: async () => "function new() { var old = 1; return old; }"
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Old name") && e.includes("still exists")));
});

void test("verifyPostEditIntegrity detects old names in comments", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 3, "new");

    const result = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "old",
        newName: "new",
        workspace: ws,
        readFile: async () => "function new() { // TODO: update old references\n return 42; }"
    });

    // Comments should generate warnings, not errors
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("Old name") && w.includes("comments")));
});

void test("verifyPostEditIntegrity warns if new name not found", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 3, "new");

    const result = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "old",
        newName: "new",
        workspace: ws,
        readFile: async () => "function foo() { return 42; }"
    });

    assert.ok(result.warnings.some((w) => w.includes("New name") && w.includes("does not appear")));
});

void test("verifyPostEditIntegrity detects conflicts with existing symbols", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        getSymbolOccurrences: async (name: string) => {
            if (name === "new") {
                return [
                    {
                        path: "other.gml",
                        start: 10,
                        end: 13,
                        kind: "definition"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 3, "new");

    const result = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "old",
        newName: "new",
        workspace: ws,
        readFile: async () => "function new() { return 42; }"
    });

    assert.ok(result.warnings.some((w) => w.includes("already exists") && w.includes("other.gml")));
});

void test("verifyPostEditIntegrity detects reserved keyword conflicts", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        getReservedKeywords: async () => ["if", "else", "for", "while"]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 3, "if");

    const result = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "old",
        newName: "if",
        workspace: ws,
        readFile: async () => "function if() { return 42; }"
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("reserved keyword") && e.includes("if")));
});

void test("verifyPostEditIntegrity validates parse correctness", async () => {
    const mockParser: ParserBridge = {
        parse: async (filePath: string) => {
            if (filePath === "broken.gml") {
                throw new Error("Syntax error at line 5");
            }
            return { start: 0, end: 10, type: "root" };
        }
    };
    const engine = new RefactorEngineClass({ parser: mockParser });
    const ws = new WorkspaceEditFactory();
    ws.addEdit("broken.gml", 0, 3, "new");

    const result = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "old",
        newName: "new",
        workspace: ws,
        readFile: async () => "function new( { return 42; }" // Missing closing paren
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Parse error") && e.includes("broken.gml")));
});

void test("verifyPostEditIntegrity handles file read errors", async () => {
    const engine = new RefactorEngineClass();
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 3, "new");

    const result = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/test",
        oldName: "old",
        newName: "new",
        workspace: ws,
        readFile: async () => {
            throw new Error("File not found");
        }
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Failed to read test.gml")));
});

void test("verifyPostEditIntegrity succeeds for valid rename", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        getSymbolOccurrences: async () => [],
        getReservedKeywords: async () => ["if", "else", "for"]
    };
    const mockParser: ParserBridge = {
        parse: async () => ({ start: 0, end: 30, type: "root" })
    };
    const engine = new RefactorEngineClass({
        semantic: mockSemantic,
        parser: mockParser
    });
    const ws = new WorkspaceEditFactory();
    ws.addEdit("test.gml", 0, 7, "newFunc");

    const result = await engine.verifyPostEditIntegrity({
        symbolId: "gml/script/oldFunc",
        oldName: "oldFunc",
        newName: "newFunc",
        workspace: ws,
        readFile: async () => "function newFunc() { return 42; }"
    });

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
});

void test("validateRenameRequest validates missing parameters", async () => {
    const engine = new RefactorEngineClass();

    const result = await engine.validateRenameRequest({
        newName: "bar"
    } as unknown as RenameRequest);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("required")));
});

void test("validateRenameRequest validates parameter types", async () => {
    const engine = new RefactorEngineClass();

    const result = await engine.validateRenameRequest({
        symbolId: 123,
        newName: "bar"
    } as unknown as RenameRequest);

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("must be a string")));
});

void test("validateRenameRequest validates identifier syntax", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: async () => true
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.validateRenameRequest({
        symbolId: "gml/script/test",
        newName: "invalid-name"
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("not a valid GML identifier")));
});

void test("validateRenameRequest checks symbol existence", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: async (id) => id === "gml/script/exists"
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.validateRenameRequest({
        symbolId: "gml/script/missing",
        newName: "bar"
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("not found in semantic index")));
});

void test("validateRenameRequest detects same name", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.validateRenameRequest({
        symbolId: "gml/script/scr_test",
        newName: "scr_test"
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("matches the existing identifier")));
});

void test("validateRenameRequest detects reserved keywords", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [{ path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }],
        getReservedKeywords: async () => ["if", "else", "for"]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.validateRenameRequest({
        symbolId: "gml/script/scr_test",
        newName: "if"
    });

    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("reserved keyword")));
});

void test("validateRenameRequest can include hot reload safety summary", async () => {
    class MockEngine extends RefactorEngineClass {
        override async checkHotReloadSafety() {
            return {
                safe: false,
                reason: "Mock hot reload block",
                requiresRestart: true,
                canAutoFix: false,
                suggestions: []
            };
        }
    }

    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [{ path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }],
        getReservedKeywords: async () => []
    };

    const engine = new MockEngine({ semantic: mockSemantic });

    const result = await engine.validateRenameRequest(
        {
            symbolId: "gml/script/scr_test",
            newName: "scr_new"
        },
        { includeHotReload: true }
    );

    assert.equal(result.valid, true);
    assert.ok(result.hotReload);
    assert.equal(result.hotReload?.safe, false);
    assert.ok(result.warnings.some((warning) => warning.includes("Hot reload unavailable")));
});

void test("validateRenameRequest passes through safe hot reload summary", async () => {
    class MockEngine extends RefactorEngineClass {
        override async checkHotReloadSafety() {
            return {
                safe: true,
                reason: "Safe to hot reload",
                requiresRestart: false,
                canAutoFix: true,
                suggestions: ["none"]
            };
        }
    }

    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [{ path: "test.gml", start: 0, end: 3, scopeId: "scope-1" }],
        getReservedKeywords: async () => []
    };

    const engine = new MockEngine({ semantic: mockSemantic });

    const result = await engine.validateRenameRequest(
        {
            symbolId: "gml/script/scr_test",
            newName: "scr_new"
        },
        { includeHotReload: true }
    );

    assert.equal(result.valid, true);
    assert.ok(result.hotReload);
    assert.equal(result.hotReload?.safe, true);
    assert.equal(result.warnings.length, 0);
});

void test("validateRenameRequest warns about no occurrences", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.validateRenameRequest({
        symbolId: "gml/script/scr_test",
        newName: "scr_new"
    });

    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("No occurrences found")));
    assert.equal(result.occurrenceCount, 0);
});

void test("validateRenameRequest succeeds for valid rename", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: async () => true,
        getSymbolOccurrences: async () => [
            { path: "test.gml", start: 0, end: 5, scopeId: "scope-1" },
            { path: "test2.gml", start: 10, end: 15, scopeId: "scope-2" }
        ],
        getReservedKeywords: async () => ["if", "else"]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.validateRenameRequest({
        symbolId: "gml/script/scr_test",
        newName: "scr_new"
    });

    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.symbolName, "scr_test");
    assert.equal(result.occurrenceCount, 2);
});

void test("validateRenameRequest works without semantic analyzer", async () => {
    const engine = new RefactorEngineClass();

    const result = await engine.validateRenameRequest({
        symbolId: "gml/script/test",
        newName: "scr_new"
    });

    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("No semantic analyzer")));
});

void test("getFileSymbols returns empty array without semantic analyzer", async () => {
    const engine = new RefactorEngineClass();
    const symbols = await engine.getFileSymbols("test.gml");
    assert.deepStrictEqual(symbols, []);
});

void test("getFileSymbols queries semantic analyzer", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        getFileSymbols: async (path) => {
            if (path === "scripts/player.gml") {
                return [{ id: "gml/script/scr_player_move" }, { id: "gml/script/scr_player_attack" }];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const symbols = await engine.getFileSymbols("scripts/player.gml");
    assert.equal(symbols.length, 2);
    assert.equal(symbols[0].id, "gml/script/scr_player_move");
    assert.equal(symbols[1].id, "gml/script/scr_player_attack");
});

void test("getFileSymbols validates file path", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(() => engine.getFileSymbols(null as unknown as string), {
        name: "TypeError",
        message: /requires a valid file path/
    });
});

void test("getSymbolDependents returns empty array without semantic analyzer", async () => {
    const engine = new RefactorEngineClass();
    const dependents = await engine.getSymbolDependents(["gml/script/scr_test"]);
    assert.deepStrictEqual(dependents, []);
});

void test("getSymbolDependents queries semantic analyzer", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        getDependents: async (symbolIds) => {
            if (symbolIds.includes("gml/script/scr_base") || symbolIds.includes("gml/script/scr_helper")) {
                return [
                    {
                        symbolId: "gml/script/scr_dependent1",
                        filePath: "scripts/dependent1.gml"
                    },
                    {
                        symbolId: "gml/script/scr_dependent2",
                        filePath: "scripts/dependent2.gml"
                    }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const dependents = await engine.getSymbolDependents(["gml/script/scr_base", "gml/script/scr_helper"]);
    assert.equal(dependents.length, 2);
    assert.equal(dependents[0].symbolId, "gml/script/scr_dependent1");
    assert.equal(dependents[0].filePath, "scripts/dependent1.gml");
});

void test("getSymbolDependents validates input type", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(() => engine.getSymbolDependents("not-an-array" as unknown as Array<string>), {
        name: "TypeError",
        message: /requires an array/
    });
});

void test("getSymbolDependents handles empty array", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        getDependents: async () => {
            throw new Error("Should not be called");
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const dependents = await engine.getSymbolDependents([]);
    assert.deepStrictEqual(dependents, []);
});

void test("computeHotReloadCascade traces full circular dependency path", async () => {
    // Create a circular dependency: A -> B -> C -> A
    const mockSemantic: PartialSemanticAnalyzer = {
        getDependents: async (symbolIds: Array<string>) => {
            const id = symbolIds[0];
            switch (id) {
                case "gml/script/scr_a": {
                    return [
                        {
                            symbolId: "gml/script/scr_b",
                            filePath: "scripts/b.gml"
                        }
                    ];
                }
                case "gml/script/scr_b": {
                    return [
                        {
                            symbolId: "gml/script/scr_c",
                            filePath: "scripts/c.gml"
                        }
                    ];
                }
                case "gml/script/scr_c": {
                    return [
                        {
                            symbolId: "gml/script/scr_a",
                            filePath: "scripts/a.gml"
                        }
                    ];
                }
                // No default
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_a"]);

    // Should detect circular dependency
    assert.ok(result.metadata.hasCircular);
    assert.equal(result.circular.length, 1);

    // The cycle path should be complete: [A, B, C, A]
    const cycle = result.circular[0];
    assert.ok(cycle.length >= 3, "Cycle should contain at least 3 nodes");
    assert.equal(cycle[0], cycle.at(-1), "Cycle should start and end with the same symbol");
    // Verify the cycle contains the expected symbols
    assert.ok(cycle.includes("gml/script/scr_a"));
    assert.ok(cycle.includes("gml/script/scr_b"));
    assert.ok(cycle.includes("gml/script/scr_c"));
});

void test("computeHotReloadCascade handles multiple separate cycles", async () => {
    // Create two separate cycles:
    // Cycle 1: A -> B -> A
    // Cycle 2: X -> Y -> X
    const mockSemantic: PartialSemanticAnalyzer = {
        getDependents: async (symbolIds: Array<string>) => {
            const id = symbolIds[0];
            switch (id) {
                case "gml/script/scr_a": {
                    return [
                        {
                            symbolId: "gml/script/scr_b",
                            filePath: "scripts/b.gml"
                        }
                    ];
                }
                case "gml/script/scr_b": {
                    return [
                        {
                            symbolId: "gml/script/scr_a",
                            filePath: "scripts/a.gml"
                        }
                    ];
                }
                case "gml/script/scr_x": {
                    return [
                        {
                            symbolId: "gml/script/scr_y",
                            filePath: "scripts/y.gml"
                        }
                    ];
                }
                case "gml/script/scr_y": {
                    return [
                        {
                            symbolId: "gml/script/scr_x",
                            filePath: "scripts/x.gml"
                        }
                    ];
                }
                // No default
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_a", "gml/script/scr_x"]);

    // Should detect both cycles
    assert.ok(result.metadata.hasCircular);
    assert.ok(result.circular.length >= 2, "Should detect at least 2 separate cycles");

    // Verify each cycle is properly traced
    for (const cycle of result.circular) {
        assert.ok(cycle.length >= 2, "Each cycle should have at least 2 nodes");
        assert.equal(cycle[0], cycle.at(-1), "Each cycle should start and end with the same symbol");
    }
});

void test("computeHotReloadCascade handles non-circular dependencies correctly", async () => {
    // Create a linear dependency chain: A -> B -> C (no cycle)
    const mockSemantic: PartialSemanticAnalyzer = {
        getDependents: async (symbolIds: Array<string>) => {
            const id = symbolIds[0];
            if (id === "gml/script/scr_a") {
                return [{ symbolId: "gml/script/scr_b", filePath: "scripts/b.gml" }];
            } else if (id === "gml/script/scr_b") {
                return [{ symbolId: "gml/script/scr_c", filePath: "scripts/c.gml" }];
            }
            return [];
        }
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_a"]);

    // Should not detect any cycles
    assert.equal(result.metadata.hasCircular, false);
    assert.equal(result.circular.length, 0);

    // Should still build proper cascade
    assert.equal(result.cascade.length, 3);
    assert.equal(result.order.length, 3);

    // Verify distance increases along the chain
    const aEntry = result.cascade.find((e) => e.symbolId === "gml/script/scr_a");
    const bEntry = result.cascade.find((e) => e.symbolId === "gml/script/scr_b");
    const cEntry = result.cascade.find((e) => e.symbolId === "gml/script/scr_c");

    assert.equal(aEntry.distance, 0);
    assert.equal(bEntry.distance, 1);
    assert.equal(cEntry.distance, 2);
    assert.equal(result.metadata.maxDistance, 2);
});

void test("validateBatchRenameRequest validates empty array", async () => {
    const engine = new RefactorEngineClass();
    const validation = await engine.validateBatchRenameRequest([]);

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes("at least one rename request")));
});

void test("validateBatchRenameRequest validates non-array input", async () => {
    const engine = new RefactorEngineClass();
    const validation = await engine.validateBatchRenameRequest(null as unknown as Array<RenameRequest>);

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes("array")));
});

void test("validateBatchRenameRequest validates individual rename requests", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const validation = await engine.validateBatchRenameRequest([
        { symbolId: "gml/script/scr_a", newName: "scr_x" },
        { symbolId: "gml/script/scr_b", newName: "invalid-name" }
    ]);

    assert.equal(validation.valid, false);
    assert.equal(validation.renameValidations.size, 2);

    const validationA = validation.renameValidations.get("gml/script/scr_a");
    const validationB = validation.renameValidations.get("gml/script/scr_b");

    assert.ok(validationA);
    assert.equal(validationA.valid, true);

    assert.ok(validationB);
    assert.equal(validationB.valid, false);
});

void test("validateBatchRenameRequest detects duplicate target names", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const validation = await engine.validateBatchRenameRequest([
        { symbolId: "gml/script/scr_a", newName: "scr_same" },
        { symbolId: "gml/script/scr_b", newName: "scr_same" }
    ]);

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes("scr_same")));
    assert.equal(validation.conflictingSets.length, 1);
    assert.equal(validation.conflictingSets[0].length, 2);
});

void test("validateBatchRenameRequest detects circular rename chains", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const validation = await engine.validateBatchRenameRequest([
        { symbolId: "gml/script/scr_a", newName: "scr_b" },
        { symbolId: "gml/script/scr_b", newName: "scr_a" }
    ]);

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes("Circular")));
    assert.ok(validation.conflictingSets.length > 0);
});

void test("validateBatchRenameRequest warns about cross-rename confusion", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const validation = await engine.validateBatchRenameRequest([
        { symbolId: "gml/script/scr_a", newName: "scr_temp" },
        { symbolId: "gml/script/scr_b", newName: "scr_a" }
    ]);

    assert.equal(validation.valid, true);
    assert.ok(validation.warnings.some((w) => w.includes("potential confusion")));
});

void test("validateBatchRenameRequest passes for valid batch", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const validation = await engine.validateBatchRenameRequest([
        { symbolId: "gml/script/scr_a", newName: "scr_x" },
        { symbolId: "gml/script/scr_b", newName: "scr_y" }
    ]);

    assert.equal(validation.valid, true);
    assert.equal(validation.errors.length, 0);
    assert.equal(validation.renameValidations.size, 2);
    assert.equal(validation.conflictingSets.length, 0);
});

void test("validateBatchRenameRequest includes hot reload checks when requested", async () => {
    const mockSemantic: PartialSemanticAnalyzer = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [{ path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }]
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const validation = await engine.validateBatchRenameRequest([{ symbolId: "gml/script/scr_a", newName: "scr_x" }], {
        includeHotReload: true
    });

    const renameValidation = validation.renameValidations.get("gml/script/scr_a");
    assert.ok(renameValidation);
    assert.ok(renameValidation.hotReload);
});

void test("validateBatchRenameRequest handles invalid request objects", async () => {
    const engine = new RefactorEngineClass();

    const validation = await engine.validateBatchRenameRequest([
        null as unknown as RenameRequest,
        { symbolId: "gml/script/scr_a", newName: "scr_x" }
    ]);

    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((e) => e.includes("valid request object")));
});

// detectRenameConflicts tests
void test("detectRenameConflicts validates oldName parameter", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () =>
            engine.detectRenameConflicts({
                oldName: null as unknown as string,
                newName: "newVar",
                occurrences: []
            }),
        {
            name: "TypeError",
            message: /oldName as a non-empty string/
        }
    );
});

void test("detectRenameConflicts validates newName parameter", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () =>
            engine.detectRenameConflicts({
                oldName: "oldVar",
                newName: 123 as unknown as string,
                occurrences: []
            }),
        {
            name: "TypeError",
            message: /newName as a non-empty string/
        }
    );
});

void test("detectRenameConflicts validates occurrences parameter", async () => {
    const engine = new RefactorEngineClass();
    await assert.rejects(
        () =>
            engine.detectRenameConflicts({
                oldName: "oldVar",
                newName: "newVar",
                occurrences: "not an array" as unknown as Array<{
                    path: string;
                    start: number;
                    end: number;
                }>
            }),
        {
            name: "TypeError",
            message: /occurrences as an array/
        }
    );
});

void test("detectRenameConflicts returns empty array for valid rename", async () => {
    const engine = new RefactorEngineClass();
    const conflicts = await engine.detectRenameConflicts({
        oldName: "oldVar",
        newName: "newVar",
        occurrences: [
            { path: "test.gml", start: 10, end: 16 },
            { path: "test.gml", start: 50, end: 56 }
        ]
    });

    assert.ok(Array.isArray(conflicts));
    assert.equal(conflicts.length, 0);
});

void test("detectRenameConflicts detects invalid identifier names", async () => {
    const engine = new RefactorEngineClass();
    const conflicts = await engine.detectRenameConflicts({
        oldName: "oldVar",
        newName: "123invalid",
        occurrences: [{ path: "test.gml", start: 10, end: 16 }]
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, "invalid_identifier");
    assert.ok(conflicts[0].message.includes("not a valid GML identifier"));
});

void test("detectRenameConflicts detects reserved keyword conflicts", async () => {
    const engine = new RefactorEngineClass();
    const conflicts = await engine.detectRenameConflicts({
        oldName: "myVar",
        newName: "function",
        occurrences: [{ path: "test.gml", start: 10, end: 15 }]
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, "reserved");
    assert.ok(conflicts[0].message.includes("reserved keyword"));
});

void test("detectRenameConflicts detects shadowing with semantic analyzer", async () => {
    const mockSemantic = {
        lookup: async (name: string, scopeId?: string) => {
            if (name === "existingVar" && scopeId === "scope1") {
                return { name: "existingVar" };
            }
            return null;
        }
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });
    const conflicts = await engine.detectRenameConflicts({
        oldName: "myVar",
        newName: "existingVar",
        occurrences: [{ path: "test.gml", start: 10, end: 15, scopeId: "scope1" }]
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, "shadow");
    assert.ok(conflicts[0].message.includes("would shadow"));
    assert.equal(conflicts[0].path, "test.gml");
});

void test("detectRenameConflicts allows rename to same symbol in scope", async () => {
    const mockSemantic = {
        lookup: async (name: string) => {
            if (name === "myVar") {
                return { name: "myVar" };
            }
            return null;
        }
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });
    const conflicts = await engine.detectRenameConflicts({
        oldName: "myVar",
        newName: "myVar",
        occurrences: [{ path: "test.gml", start: 10, end: 15 }]
    });

    // Renaming to the same name that already exists is allowed
    // because it's the same symbol
    assert.equal(conflicts.length, 0);
});

void test("detectRenameConflicts uses semantic analyzer reserved keywords", async () => {
    const mockSemantic = {
        getReservedKeywords: async () => ["customKeyword", "anotherReserved"]
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });
    const conflicts = await engine.detectRenameConflicts({
        oldName: "myVar",
        newName: "customKeyword",
        occurrences: [{ path: "test.gml", start: 10, end: 15 }]
    });

    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, "reserved");
    assert.ok(conflicts[0].message.includes("reserved keyword"));
});

void test("detectRenameConflicts works without semantic analyzer", async () => {
    const engine = new RefactorEngineClass();
    const conflicts = await engine.detectRenameConflicts({
        oldName: "oldVar",
        newName: "validNewName",
        occurrences: [{ path: "test.gml", start: 10, end: 16 }]
    });

    assert.ok(Array.isArray(conflicts));
    assert.equal(conflicts.length, 0);
});

void test("detectRenameConflicts handles multiple occurrences with different scopes", async () => {
    const mockSemantic = {
        lookup: async (name: string, scopeId?: string) => {
            if (name === "conflictVar" && scopeId === "scope2") {
                return { name: "conflictVar" };
            }
            return null;
        }
    };

    const engine = new RefactorEngineClass({ semantic: mockSemantic });
    const conflicts = await engine.detectRenameConflicts({
        oldName: "myVar",
        newName: "conflictVar",
        occurrences: [
            { path: "test1.gml", start: 10, end: 15, scopeId: "scope1" },
            { path: "test2.gml", start: 20, end: 25, scopeId: "scope2" },
            { path: "test3.gml", start: 30, end: 35, scopeId: "scope3" }
        ]
    });

    // Only scope2 has a conflict
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].type, "shadow");
    assert.equal(conflicts[0].path, "test2.gml");
});

void test("checkHotReloadSafety rejects malformed symbolId", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const testCases = [
        { id: "gml", desc: "missing parts" },
        { id: "gml/", desc: "missing kind and name" },
        { id: "gml/script", desc: "missing name" },
        { id: "invalid_format", desc: "wrong pattern" }
    ];

    for (const testCase of testCases) {
        const result = await engine.checkHotReloadSafety({
            symbolId: testCase.id,
            newName: "new_name"
        });

        assert.equal(result.safe, false, `Expected safe=false for ${testCase.desc} (id: ${testCase.id})`);
        assert.ok(
            result.reason.includes("Malformed") || result.reason.includes("Invalid"),
            `Expected error message for ${testCase.desc}`
        );
    }
});

void test("checkHotReloadSafety rejects invalid symbol kinds", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/invalid_kind/test_symbol",
        newName: "new_symbol"
    });

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("Invalid symbol kind"));
    assert.ok(result.suggestions.some((s) => s.includes("script, var, event, macro, enum")));
});

void test("checkHotReloadSafety handles valid script symbol kind", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/script/test_script",
        newName: "new_script"
    });

    assert.equal(result.safe, true);
    assert.ok(result.reason.includes("Script renames are hot-reload-safe"));
});

void test("checkHotReloadSafety handles valid var symbol kind", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/var/test_var",
        newName: "new_var"
    });

    assert.equal(result.safe, true);
    assert.ok(result.reason.includes("Global variable renames are hot-reload-safe"));
});

void test("checkHotReloadSafety handles valid macro symbol kind", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/macro/TEST_MACRO",
        newName: "NEW_MACRO"
    });

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("Macro/enum renames require"));
});

void test("checkHotReloadSafety handles valid enum symbol kind", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngineClass({ semantic: mockSemantic });

    const result = await engine.checkHotReloadSafety({
        symbolId: "gml/enum/TestEnum",
        newName: "NewEnum"
    });

    assert.equal(result.safe, false);
    assert.ok(result.reason.includes("Macro/enum renames require"));
});
