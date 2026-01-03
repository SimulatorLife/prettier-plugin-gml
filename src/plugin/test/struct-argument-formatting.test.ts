import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("formats struct call arguments across multiple lines with aligned colons", async () => {
    const source = [
        "function demo() {",
        "    return instance_create_layer(",
        "        1,",
        "        2,",
        '        "layer",',
        "        obj_fx,",
        "        {z : fx_z, sprite_index : sprite, func_callback : func_fx_callback, image_blend : colour}",
        "    );",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.split("\n");
    const structStart = lines.indexOf("        {");

    assert.notEqual(structStart, -1, "Expected the formatted output to include a struct literal argument.");

    const structLines = lines.slice(structStart, structStart + 6);

    assert.deepStrictEqual(structLines, [
        "        {",
        "            z             : fx_z,",
        "            sprite_index  : sprite,",
        "            func_callback : func_fx_callback,",
        "            image_blend   : colour",
        "        }"
    ]);
});
