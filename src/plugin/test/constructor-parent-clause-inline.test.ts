import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

async function formatWithPlugin(source, options: any = {}) {
    const formatted = await Plugin.format(source, options);

    if (typeof formatted !== "string") {
        throw new TypeError(
            "Expected Plugin.format to return a string result."
        );
    }

    return formatted.trim();
}

void test("keeps constructor parent clauses inline", async () => {
    const source = [
        "function Derived(value) : Base(value, undefined) constructor {",
        "    return new Base(value);",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const signatureLine = formatted
        .split("\n")
        .find((line) => line.startsWith("function Derived"));

    assert.strictEqual(
        signatureLine,
        "function Derived(value) : Base(value, undefined) constructor {"
    );
});

void test("preserves inline constructor parameters when parent clause is present", async () => {
    const source = [
        "function AbstractSkyboxParent(sprite = noone, subimg = 0, octahedron_scale = 1, octmap_size = 1024) : ZModelBuffer(sprite, subimg, undefined, c_white, 1, pr_trianglelist) constructor {",
        "    return new ZModelBuffer(sprite, subimg, undefined, c_white, 1, pr_trianglelist);",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const signatureLine = formatted
        .split("\n")
        .find((line) => line.startsWith("function AbstractSkyboxParent"));

    assert.strictEqual(
        signatureLine,
        "function AbstractSkyboxParent(sprite = noone, subimg = 0, octahedron_scale = 1, octmap_size = 1024) : ZModelBuffer(sprite, subimg, undefined, c_white, 1, pr_trianglelist) constructor {"
    );
});
