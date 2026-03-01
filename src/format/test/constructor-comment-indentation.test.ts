import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "@gml-modules/format";
import prettier from "prettier";

void test("keeps own-line constructor comments aligned to block indentation", async () => {
    const source = [
        "function InputButtonKeyboard(button) : AbstractInputButton(button, eInputType.keyboard) constructor {",
        "    // Keyboard input handling goes here",
        "}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [Format]
    });

    const expected = [
        "function InputButtonKeyboard(button) : AbstractInputButton(button, eInputType.keyboard) constructor {",
        "    // Keyboard input handling goes here",
        "}",
        ""
    ].join("\n");

    assert.strictEqual(formatted, expected);
});
