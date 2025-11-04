import assert from "node:assert/strict";
import test from "node:test";
import { GmlTranspiler, createTranspiler } from "../src/index.js";

test("createTranspiler returns a GmlTranspiler", () => {
    const transpiler = createTranspiler();
    assert.ok(transpiler instanceof GmlTranspiler);
});

test("transpileScript validates inputs", async () => {
    const transpiler = new GmlTranspiler();
    await assert.rejects(
        () => transpiler.transpileScript({ symbolId: "gml/script/foo" }),
        { name: "TypeError" }
    );
});

test("transpileScript returns a patch object for simple code", async () => {
    const transpiler = new GmlTranspiler();
    const result = await transpiler.transpileScript({
        sourceText: "42",
        symbolId: "gml/script/test"
    });

    assert.equal(result.kind, "script");
    assert.equal(result.id, "gml/script/test");
    assert.ok(result.js_body);
    assert.ok(result.version);
});

test("transpileScript includes source text in result", async () => {
    const transpiler = new GmlTranspiler();
    const sourceText = "x = 1 + 2";
    const result = await transpiler.transpileScript({
        sourceText,
        symbolId: "gml/script/test"
    });

    assert.equal(result.sourceText, sourceText);
});

test("transpileExpression generates JavaScript for simple expressions", () => {
    const transpiler = new GmlTranspiler();
    const result = transpiler.transpileExpression("x = 1 + 2");
    assert.ok(result, "Should generate some output");
});

test("transpileScript handles parsing errors gracefully", async () => {
    const transpiler = new GmlTranspiler();

    await assert.rejects(
        () =>
            transpiler.transpileScript({
                sourceText: "invalid syntax %%%%",
                symbolId: "gml/script/test"
            }),
        { message: /Failed to transpile script/ }
    );
});

test("transpileScript preserves error cause chain", async () => {
    const transpiler = new GmlTranspiler();

    try {
        await transpiler.transpileScript({
            sourceText: "invalid syntax %%%%",
            symbolId: "gml/script/test"
        });
        assert.fail("Should have thrown an error");
    } catch (error) {
        assert.ok(error.cause, "Error should have a cause");
        assert.match(
            error.message,
            /Failed to transpile script gml\/script\/test/
        );
    }
});

test("transpileExpression handles parsing errors gracefully", () => {
    const transpiler = new GmlTranspiler();

    assert.throws(() => transpiler.transpileExpression("invalid syntax %%%%"), {
        message: /Failed to transpile expression/
    });
});

test("transpileExpression preserves error cause chain", () => {
    const transpiler = new GmlTranspiler();

    try {
        transpiler.transpileExpression("invalid syntax %%%%");
        assert.fail("Should have thrown an error");
    } catch (error) {
        assert.ok(error.cause, "Error should have a cause");
        assert.match(error.message, /Failed to transpile expression/);
    }
});
