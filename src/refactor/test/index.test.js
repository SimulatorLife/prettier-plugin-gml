import assert from "node:assert/strict";
import test from "node:test";
import {
    RefactorEngine,
    WorkspaceEdit,
    createRefactorEngine
} from "../src/index.js";

test("createRefactorEngine returns a RefactorEngine", () => {
    const engine = createRefactorEngine();
    assert.ok(engine instanceof RefactorEngine);
});

test("createRefactorEngine accepts dependencies", () => {
    const mockParser = { parse: () => {} };
    const mockSemantic = { analyze: () => {} };
    const engine = createRefactorEngine({
        parser: mockParser,
        semantic: mockSemantic
    });
    assert.equal(engine.parser, mockParser);
    assert.equal(engine.semantic, mockSemantic);
});

test("WorkspaceEdit starts empty", () => {
    const ws = new WorkspaceEdit();
    assert.equal(ws.edits.length, 0);
});

test("WorkspaceEdit can add edits", () => {
    const ws = new WorkspaceEdit();
    ws.addEdit("file.gml", 0, 10, "newText");
    assert.equal(ws.edits.length, 1);
    assert.equal(ws.edits[0].path, "file.gml");
    assert.equal(ws.edits[0].start, 0);
    assert.equal(ws.edits[0].end, 10);
    assert.equal(ws.edits[0].newText, "newText");
});

test("WorkspaceEdit groups edits by file", () => {
    const ws = new WorkspaceEdit();
    ws.addEdit("file1.gml", 0, 10, "text1");
    ws.addEdit("file2.gml", 20, 30, "text2");
    ws.addEdit("file1.gml", 40, 50, "text3");

    const grouped = ws.groupByFile();
    assert.equal(grouped.size, 2);
    assert.equal(grouped.get("file1.gml").length, 2);
    assert.equal(grouped.get("file2.gml").length, 1);
});

test("WorkspaceEdit sorts edits descending by start position", () => {
    const ws = new WorkspaceEdit();
    ws.addEdit("file.gml", 10, 20, "a");
    ws.addEdit("file.gml", 50, 60, "b");
    ws.addEdit("file.gml", 30, 40, "c");

    const grouped = ws.groupByFile();
    const edits = grouped.get("file.gml");
    assert.equal(edits[0].start, 50); // Highest first
    assert.equal(edits[1].start, 30);
    assert.equal(edits[2].start, 10); // Lowest last
});

test("planRename validates missing symbolId", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(() => engine.planRename({ newName: "bar" }), {
        name: "TypeError",
        message: "planRename requires symbolId and newName"
    });
});

test("planRename validates missing newName", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(
        () => engine.planRename({ symbolId: "gml/script/foo" }),
        {
            name: "TypeError",
            message: "planRename requires symbolId and newName"
        }
    );
});

test("planRename validates symbolId type", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(
        () => engine.planRename({ symbolId: 123, newName: "bar" }),
        {
            name: "TypeError",
            message: /symbolId must be a string/
        }
    );
});

test("planRename validates newName type", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(
        () => engine.planRename({ symbolId: "gml/script/foo", newName: 456 }),
        {
            name: "TypeError",
            message: /newName must be a string/
        }
    );
});

test("planRename checks symbol existence with semantic analyzer", async () => {
    const mockSemantic = {
        hasSymbol: (id) => id === "gml/script/exists"
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

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

test("planRename detects reserved keyword conflicts", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            { path: "test.gml", start: 0, end: 10, scopeId: "scope-1" }
        ]
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

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

test("planRename creates workspace edit with occurrences", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            { path: "test.gml", start: 0, end: 10, scopeId: "scope-1" },
            { path: "test.gml", start: 50, end: 60, scopeId: "scope-1" }
        ]
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const workspace = await engine.planRename({
        symbolId: "gml/script/scr_old",
        newName: "scr_new"
    });

    assert.ok(workspace instanceof WorkspaceEdit);
    assert.equal(workspace.edits.length, 2);
    assert.equal(workspace.edits[0].newText, "scr_new");
    assert.equal(workspace.edits[1].newText, "scr_new");
});

test("validateSymbolExists requires semantic analyzer", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(() => engine.validateSymbolExists("gml/script/foo"), {
        message: /RefactorEngine requires a semantic analyzer/
    });
});

test("validateSymbolExists returns true when semantic lacks hasSymbol", async () => {
    const mockSemantic = {}; // No hasSymbol method
    const engine = new RefactorEngine({ semantic: mockSemantic });
    const result = await engine.validateSymbolExists("gml/script/foo");
    assert.equal(result, true);
});

test("validateRename detects invalid workspace", async () => {
    const engine = new RefactorEngine();
    const result = await engine.validateRename(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
});

test("validateRename detects empty workspace", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    const result = await engine.validateRename(ws);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("no changes")));
});

test("validateRename detects overlapping edits", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 10, "a");
    ws.addEdit("test.gml", 5, 15, "b"); // Overlaps with previous
    const result = await engine.validateRename(ws);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Overlapping")));
});

test("validateRename warns about large refactorings", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    // Add many edits
    for (let i = 0; i < 60; i++) {
        ws.addEdit("test.gml", i * 100, i * 100 + 10, "x");
    }
    const result = await engine.validateRename(ws);
    assert.ok(result.warnings.some((w) => w.includes("Large number")));
});

test("validateRename passes with valid non-overlapping edits", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 10, "a");
    ws.addEdit("test.gml", 20, 30, "b");
    ws.addEdit("test.gml", 40, 50, "c");
    const result = await engine.validateRename(ws);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
});

test("gatherSymbolOccurrences returns empty array without semantic", async () => {
    const engine = new RefactorEngine();
    const occurrences = await engine.gatherSymbolOccurrences("test");
    assert.deepEqual(occurrences, []);
});

test("gatherSymbolOccurrences uses semantic analyzer when available", async () => {
    const mockOccurrences = [
        { path: "test.gml", start: 0, end: 10 },
        { path: "test.gml", start: 50, end: 60 }
    ];
    const mockSemantic = {
        getSymbolOccurrences: () => mockOccurrences
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });
    const occurrences = await engine.gatherSymbolOccurrences("test");
    assert.deepEqual(occurrences, mockOccurrences);
});

test("detectRenameConflicts detects reserved keywords", async () => {
    const engine = new RefactorEngine();
    const conflicts = await engine.detectRenameConflicts("old", "if", []);
    assert.ok(conflicts.length > 0);
    assert.ok(conflicts.some((c) => c.type === "reserved"));
});

test("prepareHotReloadUpdates returns empty for empty workspace", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    const updates = await engine.prepareHotReloadUpdates(ws);
    assert.ok(Array.isArray(updates));
    assert.equal(updates.length, 0);
});

test("prepareHotReloadUpdates creates updates for edited files", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 10, "newcode");
    const updates = await engine.prepareHotReloadUpdates(ws);
    assert.ok(updates.length > 0);
    assert.equal(updates[0].filePath, "test.gml");
    assert.equal(updates[0].action, "recompile");
});

test("prepareHotReloadUpdates uses semantic file symbols when available", async () => {
    const mockSemantic = {
        getFileSymbols: () => [{ id: "gml/script/scr_test" }]
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 10, "newcode");
    const updates = await engine.prepareHotReloadUpdates(ws);
    assert.ok(updates.length > 0);
    assert.equal(updates[0].symbolId, "gml/script/scr_test");
});

test("findSymbolAtLocation returns null without semantic", async () => {
    const engine = new RefactorEngine();
    const result = await engine.findSymbolAtLocation("test.gml", 10);
    assert.equal(result, null);
});

test("findSymbolAtLocation uses semantic analyzer when available", async () => {
    const mockSymbol = {
        symbolId: "gml/script/scr_test",
        name: "scr_test",
        range: { start: 0, end: 10 }
    };
    const mockSemantic = {
        getSymbolAtPosition: () => mockSymbol
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });
    const result = await engine.findSymbolAtLocation("test.gml", 5);
    assert.deepEqual(result, mockSymbol);
});

test("applyWorkspaceEdit requires a WorkspaceEdit", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(
        () => engine.applyWorkspaceEdit(null, { readFile: () => {} }),
        {
            name: "TypeError",
            message: /requires a WorkspaceEdit/
        }
    );
});

test("applyWorkspaceEdit requires readFile function", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    await assert.rejects(() => engine.applyWorkspaceEdit(ws, {}), {
        name: "TypeError",
        message: /requires a readFile function/
    });
});

test("applyWorkspaceEdit requires writeFile when not in dry-run", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 5, "new");
    await assert.rejects(
        () =>
            engine.applyWorkspaceEdit(ws, {
                readFile: () => "old text",
                dryRun: false
            }),
        {
            name: "TypeError",
            message: /requires a writeFile function/
        }
    );
});

test("applyWorkspaceEdit applies edits correctly", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 3, "new");
    ws.addEdit("test.gml", 9, 13, "world");

    const readFile = async () => "old text here";
    const writeFile = async () => {};

    const results = await engine.applyWorkspaceEdit(ws, {
        readFile,
        writeFile,
        dryRun: true
    });

    assert.equal(results.size, 1);
    assert.equal(results.get("test.gml"), "new text world");
});

test("applyWorkspaceEdit handles multiple files", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("file1.gml", 0, 3, "abc");
    ws.addEdit("file2.gml", 0, 3, "xyz");

    const files = {
        "file1.gml": "old content",
        "file2.gml": "old content"
    };

    const readFile = async (path) => files[path];
    const results = await engine.applyWorkspaceEdit(ws, {
        readFile,
        dryRun: true
    });

    assert.equal(results.size, 2);
    assert.equal(results.get("file1.gml"), "abc content");
    assert.equal(results.get("file2.gml"), "xyz content");
});

test("applyWorkspaceEdit rejects invalid edits", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 10, "new");
    ws.addEdit("test.gml", 5, 15, "conflict"); // Overlapping edit

    const readFile = async () => "some text here";

    await assert.rejects(
        () => engine.applyWorkspaceEdit(ws, { readFile, dryRun: true }),
        {
            message: /Overlapping edits/
        }
    );
});

test("executeRename validates required parameters", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(() => engine.executeRename({}), {
        name: "TypeError",
        message: /requires symbolId and newName/
    });
});

test("executeRename performs complete rename workflow", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            { path: "test.gml", start: 0, end: 5, scopeId: "scope-1" },
            { path: "test.gml", start: 16, end: 21, scopeId: "scope-1" }
        ]
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const files = { "test.gml": "scr_a some code scr_a" };
    const readFile = async (path) => files[path];
    const writeFile = async (path, content) => {
        files[path] = content;
    };

    const result = await engine.executeRename({
        symbolId: "gml/script/scr_a",
        newName: "scr_b",
        readFile,
        writeFile
    });

    assert.ok(result.workspace instanceof WorkspaceEdit);
    assert.equal(result.applied.size, 1);
    assert.equal(result.applied.get("test.gml"), "scr_b some code scr_b");
    assert.equal(files["test.gml"], "scr_b some code scr_b");
});

test("executeRename prepares hot reload updates when requested", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            { path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }
        ],
        getFileSymbols: () => [{ id: "gml/script/scr_test" }]
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const readFile = async () => "scr_a";
    const writeFile = async () => {};

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

test("generateTranspilerPatches requires array parameter", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(
        () => engine.generateTranspilerPatches(null, () => {}),
        {
            name: "TypeError",
            message: /requires an array/
        }
    );
});

test("generateTranspilerPatches requires readFile function", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(() => engine.generateTranspilerPatches([], null), {
        name: "TypeError",
        message: /requires a readFile function/
    });
});

test("generateTranspilerPatches creates basic patches without transpiler", async () => {
    const engine = new RefactorEngine();
    const updates = [
        {
            symbolId: "gml/script/scr_test",
            action: "recompile",
            filePath: "test.gml"
        }
    ];

    const readFile = async () => "function test() { return 42; }";
    const patches = await engine.generateTranspilerPatches(updates, readFile);

    assert.equal(patches.length, 1);
    assert.equal(patches[0].symbolId, "gml/script/scr_test");
    assert.equal(patches[0].filePath, "test.gml");
    assert.ok(patches[0].patch);
    assert.equal(patches[0].patch.kind, "script");
});

test("generateTranspilerPatches skips non-recompile actions", async () => {
    const engine = new RefactorEngine();
    const updates = [
        {
            symbolId: "gml/script/scr_test",
            action: "notify",
            filePath: "test.gml"
        }
    ];

    const readFile = async () => "function test() {}";
    const patches = await engine.generateTranspilerPatches(updates, readFile);

    assert.equal(patches.length, 0);
});

test("generateTranspilerPatches uses transpiler when available", async () => {
    const mockTranspiler = {
        transpileScript: async ({ sourceText, symbolId }) => ({
            kind: "script",
            id: symbolId,
            js_body: "transpiled code",
            sourceText,
            version: 123
        })
    };
    const engine = new RefactorEngine({ formatter: mockTranspiler });

    const updates = [
        {
            symbolId: "gml/script/scr_test",
            action: "recompile",
            filePath: "test.gml"
        }
    ];

    const readFile = async () => "function test() { return 42; }";
    const patches = await engine.generateTranspilerPatches(updates, readFile);

    assert.equal(patches.length, 1);
    assert.equal(patches[0].patch.js_body, "transpiled code");
});

test("generateTranspilerPatches continues on individual errors", async () => {
    const mockTranspiler = {
        transpileScript: async ({ symbolId }) => {
            if (symbolId.includes("fail")) {
                throw new Error("Transpile failed");
            }
            return { kind: "script", id: symbolId, js_body: "ok" };
        }
    };
    const engine = new RefactorEngine({ formatter: mockTranspiler });

    const updates = [
        {
            symbolId: "gml/script/scr_fail",
            action: "recompile",
            filePath: "fail.gml"
        },
        {
            symbolId: "gml/script/scr_ok",
            action: "recompile",
            filePath: "ok.gml"
        }
    ];

    const readFile = async () => "function test() {}";
    const patches = await engine.generateTranspilerPatches(updates, readFile);

    // Should have one successful patch despite one failure
    assert.equal(patches.length, 1);
    assert.equal(patches[0].symbolId, "gml/script/scr_ok");
});

// Batch rename tests
test("planBatchRename requires an array", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(() => engine.planBatchRename(null), {
        name: "TypeError",
        message: /requires an array/
    });
});

test("planBatchRename requires at least one rename", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(() => engine.planBatchRename([]), {
        message: /at least one rename/
    });
});

test("planBatchRename validates each rename request", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(
        () => engine.planBatchRename([{ symbolId: "gml/script/foo" }]),
        {
            name: "TypeError",
            message: /requires symbolId and newName/
        }
    );
});

test("planBatchRename detects duplicate target names", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => []
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

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

test("planBatchRename combines multiple renames", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => {
            if (name === "scr_a") {
                return [
                    { path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }
                ];
            }
            if (name === "scr_b") {
                return [
                    { path: "test.gml", start: 20, end: 25, scopeId: "scope-1" }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const workspace = await engine.planBatchRename([
        { symbolId: "gml/script/scr_a", newName: "scr_new_a" },
        { symbolId: "gml/script/scr_b", newName: "scr_new_b" }
    ]);

    assert.ok(workspace instanceof WorkspaceEdit);
    assert.equal(workspace.edits.length, 2);
    assert.equal(workspace.edits[0].newText, "scr_new_a");
    assert.equal(workspace.edits[1].newText, "scr_new_b");
});

test("planBatchRename validates merged edits for overlaps", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => {
            // Create overlapping ranges
            if (name === "scr_a") {
                return [
                    { path: "test.gml", start: 0, end: 10, scopeId: "scope-1" }
                ];
            }
            if (name === "scr_b") {
                return [
                    { path: "test.gml", start: 5, end: 15, scopeId: "scope-1" }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

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

test("executeBatchRename validates required parameters", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(() => engine.executeBatchRename({}), {
        name: "TypeError",
        message: /requires renames array/
    });
});

test("executeBatchRename performs complete batch rename workflow", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => {
            if (name === "scr_a") {
                return [
                    { path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }
                ];
            }
            if (name === "scr_b") {
                return [
                    { path: "test.gml", start: 16, end: 21, scopeId: "scope-1" }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const files = { "test.gml": "scr_a some code scr_b" };
    const readFile = async (path) => files[path];
    const writeFile = async (path, content) => {
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

    assert.ok(result.workspace instanceof WorkspaceEdit);
    assert.equal(result.applied.size, 1);
    assert.equal(result.applied.get("test.gml"), "scr_x some code scr_y");
    assert.equal(files["test.gml"], "scr_x some code scr_y");
});

test("executeBatchRename prepares hot reload when requested", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: (name) => {
            if (name === "scr_a") {
                return [
                    { path: "test.gml", start: 0, end: 5, scopeId: "scope-1" }
                ];
            }
            return [];
        },
        getFileSymbols: () => [{ id: "gml/script/scr_test" }]
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const readFile = async () => "scr_a";
    const writeFile = async () => {};

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
test("analyzeRenameImpact requires symbolId and newName", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(
        () => engine.analyzeRenameImpact({ symbolId: "gml/script/foo" }),
        {
            name: "TypeError",
            message: /requires symbolId and newName/
        }
    );
});

test("analyzeRenameImpact detects missing symbol", async () => {
    const mockSemantic = {
        hasSymbol: () => false
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.analyzeRenameImpact({
        symbolId: "gml/script/missing",
        newName: "scr_new"
    });

    assert.equal(result.valid, false);
    assert.ok(result.conflicts.length > 0);
    assert.equal(result.conflicts[0].type, "missing_symbol");
});

test("analyzeRenameImpact provides comprehensive summary", async () => {
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
    const engine = new RefactorEngine({ semantic: mockSemantic });

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

test("analyzeRenameImpact detects reserved keyword conflicts", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            { path: "test.gml", start: 0, end: 10, scopeId: "scope-1" }
        ]
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.analyzeRenameImpact({
        symbolId: "gml/script/scr_test",
        newName: "if"
    });

    assert.equal(result.valid, false);
    assert.ok(result.conflicts.length > 0);
    assert.equal(result.conflicts[0].type, "reserved");
});

test("analyzeRenameImpact warns about large renames", async () => {
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
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.analyzeRenameImpact({
        symbolId: "gml/script/scr_test",
        newName: "scr_renamed"
    });

    assert.equal(result.valid, true);
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings.some((w) => w.type === "large_rename"));
});

test("analyzeRenameImpact tracks dependent symbols", async () => {
    const mockSemantic = {
        hasSymbol: () => true,
        getSymbolOccurrences: () => [
            { path: "test.gml", start: 0, end: 10, scopeId: "scope-1" }
        ],
        getDependents: async () => [
            { symbolId: "gml/script/scr_dependent1" },
            { symbolId: "gml/script/scr_dependent2" }
        ]
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.analyzeRenameImpact({
        symbolId: "gml/script/scr_test",
        newName: "scr_renamed"
    });

    assert.equal(result.valid, true);
    assert.equal(result.summary.dependentSymbols.length, 2);
    assert.ok(
        result.summary.dependentSymbols.includes("gml/script/scr_dependent1")
    );
    assert.ok(
        result.summary.dependentSymbols.includes("gml/script/scr_dependent2")
    );
});

test("analyzeRenameImpact handles errors gracefully", async () => {
    const mockSemantic = {
        hasSymbol: () => {
            throw new Error("Semantic analyzer error");
        }
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.analyzeRenameImpact({
        symbolId: "gml/script/scr_test",
        newName: "scr_renamed"
    });

    assert.equal(result.valid, false);
    assert.ok(result.conflicts.length > 0);
    assert.equal(result.conflicts[0].type, "analysis_error");
});

// Hot reload validation tests
test("validateHotReloadCompatibility requires a WorkspaceEdit", async () => {
    const engine = new RefactorEngine();
    const result = await engine.validateHotReloadCompatibility(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("Invalid workspace")));
});

test("validateHotReloadCompatibility warns for empty workspace", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("no changes")));
});

test("validateHotReloadCompatibility warns about non-GML files", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("test.txt", 0, 5, "new");
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.ok(result.warnings.some((w) => w.includes("not a GML script")));
});

test("validateHotReloadCompatibility detects globalvar changes", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 5, "globalvar myvar;");
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.ok(result.warnings.some((w) => w.includes("globalvar")));
});

test("validateHotReloadCompatibility detects macro changes", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 5, "#macro MAX_HP 100");
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.ok(result.warnings.some((w) => w.includes("#macro")));
});

test("validateHotReloadCompatibility detects enum changes", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 5, "enum State { Idle, Running }");
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.ok(result.warnings.some((w) => w.includes("enum")));
});

test("validateHotReloadCompatibility warns about large edits", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    const largeText = "x".repeat(6000);
    ws.addEdit("test.gml", 0, 5, largeText);
    const result = await engine.validateHotReloadCompatibility(ws);
    assert.ok(result.warnings.some((w) => w.includes("Large edit")));
});

test("validateHotReloadCompatibility handles transpiler check option", async () => {
    const mockTranspiler = {
        transpileScript: async () => ({ kind: "script", js_body: "ok" })
    };
    const engine = new RefactorEngine({ formatter: mockTranspiler });
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 5, "new code");

    const result = await engine.validateHotReloadCompatibility(ws, {
        checkTranspiler: true
    });
    assert.equal(result.valid, true);
    assert.ok(
        result.warnings.some((w) => w.includes("Transpiler compatibility"))
    );
});

test("validateHotReloadCompatibility passes for simple renames", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("test.gml", 0, 5, "newName");
    ws.addEdit("test.gml", 50, 55, "newName");

    const result = await engine.validateHotReloadCompatibility(ws);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
});

// Hot reload cascade tests
test("computeHotReloadCascade requires array parameter", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(() => engine.computeHotReloadCascade(null), {
        name: "TypeError",
        message: /requires an array/
    });
});

test("computeHotReloadCascade returns empty for no changes", async () => {
    const engine = new RefactorEngine();
    const result = await engine.computeHotReloadCascade([]);

    assert.ok(Array.isArray(result.cascade));
    assert.equal(result.cascade.length, 0);
    assert.ok(Array.isArray(result.order));
    assert.equal(result.order.length, 0);
    assert.equal(result.metadata.totalSymbols, 0);
    assert.equal(result.metadata.maxDistance, 0);
    assert.equal(result.metadata.hasCircular, false);
});

test("computeHotReloadCascade handles single symbol with no dependents", async () => {
    const mockSemantic = {
        getDependents: async () => [] // No dependents
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade([
        "gml/script/scr_leaf"
    ]);

    assert.equal(result.cascade.length, 1);
    assert.equal(result.cascade[0].symbolId, "gml/script/scr_leaf");
    assert.equal(result.cascade[0].distance, 0);
    assert.equal(result.cascade[0].reason, "direct change");
    assert.equal(result.metadata.totalSymbols, 1);
    assert.equal(result.metadata.maxDistance, 0);
});

test("computeHotReloadCascade computes single-level dependencies", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            if (symbolIds[0] === "gml/script/scr_base") {
                return [
                    { symbolId: "gml/script/scr_dep1" },
                    { symbolId: "gml/script/scr_dep2" }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade([
        "gml/script/scr_base"
    ]);

    assert.equal(result.cascade.length, 3);
    assert.equal(result.metadata.totalSymbols, 3);
    assert.equal(result.metadata.maxDistance, 1);

    // Check that dependents are at distance 1
    const deps = result.cascade.filter((c) => c.distance === 1);
    assert.equal(deps.length, 2);
    assert.ok(deps.some((d) => d.symbolId === "gml/script/scr_dep1"));
    assert.ok(deps.some((d) => d.symbolId === "gml/script/scr_dep2"));
});

test("computeHotReloadCascade computes multi-level transitive closure", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            const id = symbolIds[0];
            if (id === "gml/script/scr_root") {
                return [{ symbolId: "gml/script/scr_middle" }];
            }
            if (id === "gml/script/scr_middle") {
                return [
                    { symbolId: "gml/script/scr_leaf1" },
                    { symbolId: "gml/script/scr_leaf2" }
                ];
            }
            return [];
        }
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade([
        "gml/script/scr_root"
    ]);

    assert.equal(result.cascade.length, 4); // root + middle + 2 leaves
    assert.equal(result.metadata.maxDistance, 2);

    // Verify distances
    const root = result.cascade.find(
        (c) => c.symbolId === "gml/script/scr_root"
    );
    const middle = result.cascade.find(
        (c) => c.symbolId === "gml/script/scr_middle"
    );
    const leaf1 = result.cascade.find(
        (c) => c.symbolId === "gml/script/scr_leaf1"
    );
    const leaf2 = result.cascade.find(
        (c) => c.symbolId === "gml/script/scr_leaf2"
    );

    assert.equal(root.distance, 0);
    assert.equal(middle.distance, 1);
    assert.equal(leaf1.distance, 2);
    assert.equal(leaf2.distance, 2);
});

test("computeHotReloadCascade orders symbols in dependency order", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            const id = symbolIds[0];
            if (id === "gml/script/scr_a") {
                return [{ symbolId: "gml/script/scr_b" }];
            }
            if (id === "gml/script/scr_b") {
                return [{ symbolId: "gml/script/scr_c" }];
            }
            return [];
        }
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

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

test("computeHotReloadCascade handles multiple changed symbols", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            const id = symbolIds[0];
            if (id === "gml/script/scr_a") {
                return [{ symbolId: "gml/script/scr_shared" }];
            }
            if (id === "gml/script/scr_b") {
                return [{ symbolId: "gml/script/scr_shared" }];
            }
            return [];
        }
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade([
        "gml/script/scr_a",
        "gml/script/scr_b"
    ]);

    // Should include both roots and the shared dependent (only once)
    assert.equal(result.cascade.length, 3);
    assert.ok(result.cascade.some((c) => c.symbolId === "gml/script/scr_a"));
    assert.ok(result.cascade.some((c) => c.symbolId === "gml/script/scr_b"));
    assert.ok(
        result.cascade.some((c) => c.symbolId === "gml/script/scr_shared")
    );

    // Shared dependent should be at distance 1
    const shared = result.cascade.find(
        (c) => c.symbolId === "gml/script/scr_shared"
    );
    assert.equal(shared.distance, 1);
});

test("computeHotReloadCascade detects circular dependencies", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            const id = symbolIds[0];
            // Create a cycle: a -> b -> c -> a
            if (id === "gml/script/scr_a") {
                return [{ symbolId: "gml/script/scr_b" }];
            }
            if (id === "gml/script/scr_b") {
                return [{ symbolId: "gml/script/scr_c" }];
            }
            if (id === "gml/script/scr_c") {
                return [{ symbolId: "gml/script/scr_a" }];
            }
            return [];
        }
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade(["gml/script/scr_a"]);

    // Should include all three symbols
    assert.equal(result.cascade.length, 3);

    // Should detect the circular dependency
    assert.equal(result.metadata.hasCircular, true);

    // All symbols should still be in the order (possibly with cycles broken)
    assert.equal(result.order.length, 3);
});

test("computeHotReloadCascade handles diamond dependencies", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            const id = symbolIds[0];
            // Diamond: root -> left + right, left -> bottom, right -> bottom
            if (id === "gml/script/scr_root") {
                return [
                    { symbolId: "gml/script/scr_left" },
                    { symbolId: "gml/script/scr_right" }
                ];
            }
            if (id === "gml/script/scr_left" || id === "gml/script/scr_right") {
                return [{ symbolId: "gml/script/scr_bottom" }];
            }
            return [];
        }
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade([
        "gml/script/scr_root"
    ]);

    // Should include all 4 symbols
    assert.equal(result.cascade.length, 4);

    // Bottom should appear only once despite multiple paths
    const bottomOccurrences = result.cascade.filter(
        (c) => c.symbolId === "gml/script/scr_bottom"
    );
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

test("computeHotReloadCascade provides reason metadata", async () => {
    const mockSemantic = {
        getDependents: async (symbolIds) => {
            if (symbolIds[0] === "gml/script/scr_base") {
                return [{ symbolId: "gml/script/scr_dep" }];
            }
            return [];
        }
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    const result = await engine.computeHotReloadCascade([
        "gml/script/scr_base"
    ]);

    const base = result.cascade.find(
        (c) => c.symbolId === "gml/script/scr_base"
    );
    const dep = result.cascade.find((c) => c.symbolId === "gml/script/scr_dep");

    assert.equal(base.reason, "direct change");
    assert.ok(dep.reason.includes("depends on"));
    assert.ok(dep.reason.includes("scr_base"));
});

test("computeHotReloadCascade works without semantic analyzer", async () => {
    const engine = new RefactorEngine(); // No semantic analyzer

    const result = await engine.computeHotReloadCascade([
        "gml/script/scr_test"
    ]);

    // Should only include the changed symbol, no dependents
    assert.equal(result.cascade.length, 1);
    assert.equal(result.cascade[0].symbolId, "gml/script/scr_test");
    assert.equal(result.cascade[0].distance, 0);
});
