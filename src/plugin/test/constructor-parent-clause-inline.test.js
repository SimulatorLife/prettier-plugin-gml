import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source, options = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });
}

test("keeps constructor parent clauses inline", async () => {
    const source = [
        "function Derived(value) : Base(value, undefined) constructor {",
        "    return new Base(value);",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source);
    const signatureLine = formatted
        .split("\n")
        .find((line) => line.startsWith("function Derived"));

    assert.strictEqual(
        signatureLine,
        "function Derived(value) : Base(value, undefined) constructor {"
    );
});

test("preserves inline constructor parameters when parent clause is present", async () => {
    const source = [
        "function AbstractSkyboxParent(sprite = noone, subimg = 0, octahedron_scale = 1, octmap_size = 1024) : ZModelBuffer(sprite, subimg, undefined, c_white, 1, pr_trianglelist) constructor {",
        "    return new ZModelBuffer(sprite, subimg, undefined, c_white, 1, pr_trianglelist);",
        "}",
        ""
    ].join("\n");

    const formatted = await format(source);
    const signatureLine = formatted
        .split("\n")
        .find((line) => line.startsWith("function AbstractSkyboxParent"));

    assert.strictEqual(
        signatureLine,
        "function AbstractSkyboxParent(sprite = noone, subimg = 0, octahedron_scale = 1, octmap_size = 1024) : ZModelBuffer(sprite, subimg, undefined, c_white, 1, pr_trianglelist) constructor {"
    );
});
