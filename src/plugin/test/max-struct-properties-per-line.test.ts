import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("breaks struct with 3 properties when maxStructPropertiesPerLine is 2 (default)", async () => {
    const source = "my_func({ a: 1, b: 2, c: 3 });";

    const formatted = await Plugin.format(source);

    assert.strictEqual(
        formatted,
        ["my_func(", "    {", "        a : 1,", "        b : 2,", "        c : 3", "    }", ");", ""].join("\n")
    );
});

void test("keeps struct with 2 properties inline when maxStructPropertiesPerLine is 2 (default)", async () => {
    const source = "my_func({ a: 1, b: 2 });";

    const formatted = await Plugin.format(source);

    assert.strictEqual(formatted, "my_func({a: 1, b: 2});\n");
});

void test("keeps struct with 3 properties inline when maxStructPropertiesPerLine is 3", async () => {
    const source = "my_func({ a: 1, b: 2, c: 3 });";

    const formatted = await Plugin.format(source, {
        maxStructPropertiesPerLine: 3
    });

    assert.strictEqual(formatted, "my_func({a: 1, b: 2, c: 3});\n");
});

void test("breaks struct with 4 properties when maxStructPropertiesPerLine is 3", async () => {
    const source = "my_func({ a: 1, b: 2, c: 3, d: 4 });";

    const formatted = await Plugin.format(source, {
        maxStructPropertiesPerLine: 3
    });

    assert.strictEqual(
        formatted,
        [
            "my_func(",
            "    {",
            "        a : 1,",
            "        b : 2,",
            "        c : 3,",
            "        d : 4",
            "    }",
            ");",
            ""
        ].join("\n")
    );
});

void test("disables struct property limit when maxStructPropertiesPerLine is 0", async () => {
    const source = "my_func({ a: 1, b: 2, c: 3, d: 4, e: 5 });";

    const formatted = await Plugin.format(source, {
        maxStructPropertiesPerLine: 0
    });

    assert.strictEqual(formatted, "my_func({a: 1, b: 2, c: 3, d: 4, e: 5});\n");
});

void test("still breaks struct with comments even when maxStructPropertiesPerLine is 0", async () => {
    const source = ["my_func({", "    // comment", "    a: 1,", "    b: 2", "});", ""].join("\n");

    const formatted = await Plugin.format(source, {
        maxStructPropertiesPerLine: 0
    });

    assert.strictEqual(
        formatted,
        ["my_func(", "    {", "        // comment", "        a : 1,", "        b : 2", "    }", ");", ""].join("\n")
    );
});
