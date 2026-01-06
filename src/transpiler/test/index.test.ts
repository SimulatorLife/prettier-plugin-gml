import assert from "node:assert/strict";
import test from "node:test";
import { Transpiler } from "../src/index.js";

type TranspilerInstance = InstanceType<typeof Transpiler.GmlTranspiler>;
type TranspileScriptArgs = Parameters<TranspilerInstance["transpileScript"]>[0];

await test("transpileScript validates inputs", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    assert.throws(
        () =>
            transpiler.transpileScript({
                symbolId: "gml/script/foo"
            } as unknown as TranspileScriptArgs),
        { name: "TypeError" }
    );
});

await test("transpileScript returns a patch object for simple code", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const result = transpiler.transpileScript({
        sourceText: "42",
        symbolId: "gml/script/test"
    });

    assert.equal(result.kind, "script");
    assert.equal(result.id, "gml/script/test");
    assert.ok(result.js_body);
    assert.ok(result.version);
});

await test("transpileScript includes source text in result", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const sourceText = "x = 1 + 2";
    const result = transpiler.transpileScript({
        sourceText,
        symbolId: "gml/script/test"
    });

    assert.equal(result.sourceText, sourceText);
});

await test("transpileExpression generates JavaScript for simple expressions", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const result = transpiler.transpileExpression("x = 1 + 2");
    assert.ok(result, "Should generate some output");
});

await test("transpileScript handles parsing errors gracefully", () => {
    const transpiler = new Transpiler.GmlTranspiler();

    assert.throws(
        () =>
            transpiler.transpileScript({
                sourceText: "invalid syntax %%%%",
                symbolId: "gml/script/test"
            }),
        { message: /Failed to transpile script/ }
    );
});
