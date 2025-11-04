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

test("planRename proceeds when symbol exists", async () => {
    const mockSemantic = {
        hasSymbol: () => true
    };
    const engine = new RefactorEngine({ semantic: mockSemantic });

    await assert.rejects(
        () => engine.planRename({ symbolId: "gml/script/foo", newName: "bar" }),
        {
            message: /planRename implementation in progress/
        }
    );
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

test("prepareHotReloadUpdates returns empty array for now", async () => {
    const engine = new RefactorEngine();
    const ws = new WorkspaceEdit();
    ws.addEdit("file.gml", 0, 10, "test");
    const updates = await engine.prepareHotReloadUpdates(ws);
    assert.ok(Array.isArray(updates));
    assert.equal(updates.length, 0);
});
