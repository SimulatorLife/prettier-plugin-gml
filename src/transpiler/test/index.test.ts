import assert from "node:assert/strict";
import test from "node:test";
import { Transpiler } from "../index.js";

type TranspilerInstance = InstanceType<typeof Transpiler.GmlTranspiler>;
type TranspileScriptArgs = Parameters<TranspilerInstance["transpileScript"]>[0];

test("createTranspiler returns a GmlTranspiler", () => {
    const transpiler = Transpiler.createTranspiler();
    assert.ok(transpiler instanceof Transpiler.GmlTranspiler);
});

test("transpileScript validates inputs", async () => {
    const transpiler = new Transpiler.GmlTranspiler();
    await assert.rejects(
        () =>
            transpiler.transpileScript({
                symbolId: "gml/script/foo"
            } as unknown as TranspileScriptArgs),
        { name: "TypeError" }
    );
});

test("transpileScript returns a patch object for simple code", async () => {
    const transpiler = new Transpiler.GmlTranspiler();
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
    const transpiler = new Transpiler.GmlTranspiler();
    const sourceText = "x = 1 + 2";
    const result = await transpiler.transpileScript({
        sourceText,
        symbolId: "gml/script/test"
    });

    assert.equal(result.sourceText, sourceText);
});

test("transpileExpression generates JavaScript for simple expressions", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const result = transpiler.transpileExpression("x = 1 + 2");
    assert.ok(result, "Should generate some output");
});

test("transpileScript handles parsing errors gracefully", async () => {
    const transpiler = new Transpiler.GmlTranspiler();

    await assert.rejects(
        () =>
            transpiler.transpileScript({
                sourceText: "invalid syntax %%%%",
                symbolId: "gml/script/test"
            }),
        { message: /Failed to transpile script/ }
    );
});
