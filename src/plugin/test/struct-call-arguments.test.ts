import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("keeps small struct arguments inline", async () => {
    const source = [
        "function create() {",
        "    return instance_create_depth(0, 0, 0, Object2, {",
        "        value: 99,",
        "        func: function () {",
        "            return self.value;",
        "        }",
        "    });",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");
    const returnIndex = lines.findIndex((line) => line.includes("return instance_create_depth"));

    assert.strictEqual(
        lines[returnIndex],
        "    return instance_create_depth(0, 0, 0, Object2, {",
        "Struct arguments with two properties should stay inline with the call signature."
    );
});

void test("keeps struct arguments inline when they fit print width", async () => {
    const source = [
        "function build() {",
        "    return create_instance(1, 2, {",
        "        first: 1,",
        "        second: 2,",
        "        third: 3",
        "    });",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");
    const returnIndex = lines.findIndex((line) => line.includes("return create_instance"));

    assert.strictEqual(
        lines[returnIndex],
        "    return create_instance(1, 2, {",
        "Calls with larger struct arguments should stay inline when the line still fits."
    );
});

void test("breaks struct arguments when print width requires wrapping", async () => {
    const source = [
        "function build() {",
        "    return create_instance(1, 2, {",
        "        first: 123456789,",
        "        second: 123456789,",
        "        third: 123456789",
        "    });",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, {
        printWidth: 55
    });
    const lines = formatted.trim().split("\n");
    const returnIndex = lines.findIndex((line) => line.includes("return create_instance"));

    assert.strictEqual(
        lines[returnIndex],
        "    return create_instance(",
        "Calls with larger struct arguments should break when print width is exceeded."
    );
    assert.strictEqual(
        lines[returnIndex + 1],
        "        1,",
        "The first argument should be printed on its own line when the call wraps."
    );
});
