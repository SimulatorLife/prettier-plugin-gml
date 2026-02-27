import assert from "node:assert/strict";
import test from "node:test";

import { Transpiler } from "../index.js";

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

await test("transpileScript unwraps function bodies without leading blank lines", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const result = transpiler.transpileScript({
        sourceText: "function test() { return 1; }",
        symbolId: "gml/script/test"
    });

    assert.equal(result.js_body, "return 1;");
});

await test("transpileScript unwraps function parameters into args assignments", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const result = transpiler.transpileScript({
        sourceText: "function test(x, y = 5) { return x + y; }",
        symbolId: "gml/script/test"
    });

    assert.match(result.js_body, /^var x = args\[0\];/m);
    assert.match(result.js_body, /^var y = args\[1\] === undefined \? 5 : args\[1\];/m);
    assert.match(result.js_body, /return \(?x \+ y\)?;/);
});

await test("transpileScript includes source path metadata when provided", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const result = transpiler.transpileScript({
        sourceText: "x = 1 + 2",
        symbolId: "gml/script/test",
        sourcePath: "scripts/player_move.gml"
    });

    assert.equal(result.metadata?.sourcePath, "scripts/player_move.gml");
});

await test("transpileScript rejects empty source paths", () => {
    const transpiler = new Transpiler.GmlTranspiler();

    assert.throws(
        () =>
            transpiler.transpileScript({
                sourceText: "x = 1 + 2",
                symbolId: "gml/script/test",
                sourcePath: ""
            }),
        { name: "TypeError" }
    );
});

await test("transpileExpression generates JavaScript for simple expressions", () => {
    const transpiler = new Transpiler.GmlTranspiler();
    const result = transpiler.transpileExpression("x = 1 + 2");
    assert.ok(result, "Should generate some output");
});

await test("transpileScript rejects malformed ast objects before property access", () => {
    const transpiler = new Transpiler.GmlTranspiler();

    assert.throws(
        () =>
            transpiler.transpileScript({
                sourceText: "x = 1 + 2",
                symbolId: "gml/script/test",
                ast: { type: "Program" }
            }),
        {
            message: /ast\.body to be an array/
        }
    );
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

await test("transpileExpression handles parsing errors gracefully", () => {
    const transpiler = new Transpiler.GmlTranspiler();

    assert.throws(() => transpiler.transpileExpression("invalid syntax %%%%"), {
        message: /Failed to transpile expression/
    });
});
