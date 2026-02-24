import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("keeps short structs inline in call arguments", async () => {
    const source = "my_func({ a: 1, b: 2, c: 3 });";

    const formatted = await Format.format(source);

    assert.strictEqual(formatted, "my_func({a: 1, b: 2, c: 3});\n");
});

void test("keeps larger structs inline when they fit print width", async () => {
    const source = "my_func({ a: 1, b: 2, c: 3, d: 4, e: 5 });";
    const formatted = await Format.format(source);

    assert.strictEqual(formatted, "my_func({a: 1, b: 2, c: 3, d: 4, e: 5});\n");
});

void test("breaks struct arguments when properties contain comments", async () => {
    const source = ["my_func({", "    // comment", "    a: 1,", "    b: 2", "});", ""].join("\n");
    const formatted = await Format.format(source);

    assert.strictEqual(
        formatted,
        ["my_func(", "    {", "        // comment", "        a : 1,", "        b : 2", "    }", ");", ""].join("\n")
    );
});
