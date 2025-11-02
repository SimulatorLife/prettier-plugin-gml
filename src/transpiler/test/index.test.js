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

test("transpileScript currently reports missing implementation", async () => {
    const transpiler = new GmlTranspiler();
    await assert.rejects(
        () =>
            transpiler.transpileScript({
                sourceText: "",
                symbolId: "gml/script/foo"
            }),
        { message: "transpileScript is not implemented yet" }
    );
});
