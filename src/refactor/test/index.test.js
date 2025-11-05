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
