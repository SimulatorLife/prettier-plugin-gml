import assert from "node:assert/strict";
import test from "node:test";
import { RefactorEngine, createRefactorEngine } from "../src/index.js";

test("createRefactorEngine returns a RefactorEngine", () => {
    const engine = createRefactorEngine();
    assert.ok(engine instanceof RefactorEngine);
});

test("planRename validates its inputs", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(
        () => engine.planRename({ symbolId: "gml/script/foo" }),
        { name: "TypeError" }
    );
});

test("planRename currently reports missing implementation", async () => {
    const engine = new RefactorEngine();
    await assert.rejects(
        () => engine.planRename({ symbolId: "gml/script/foo", newName: "bar" }),
        { message: "planRename is not implemented yet" }
    );
});
