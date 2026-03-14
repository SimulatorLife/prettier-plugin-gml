import assert from "node:assert/strict";
import { test } from "node:test";

import { Format } from "../src/index.js";

void test("preserves source blank lines between ordinary top-level statements without trailing comments", async () => {
    const source = ["alpha();", "", "beta();", ""].join("\n");

    const formatted = await Format.format(source);

    assert.strictEqual(formatted, ["alpha();", "", "beta();", ""].join("\n"));
});

void test("collapses a source blank line after a non-delete top-level trailing comment before a region", async () => {
    const source = [
        "value = 1; // keep comment",
        "",
        "#region Utilities",
        "helper();",
        "#endregion Utilities",
        ""
    ].join("\n");

    const formatted = await Format.format(source);

    assert.strictEqual(
        formatted,
        ["value = 1; // keep comment", "#region Utilities", "", "helper();", "", "#endregion Utilities", ""].join("\n")
    );
});

void test("collapses a source blank line after a non-delete top-level trailing comment before the next statement", async () => {
    const source = ["value = 1; // keep comment", "", "beta();", ""].join("\n");

    const formatted = await Format.format(source);

    assert.strictEqual(formatted, ["value = 1; // keep comment", "beta();", ""].join("\n"));
});

void test("preserves a single separating blank line when a top-level trailing comment is followed by a larger source gap", async () => {
    const source = ["delete foo // keep separation", "", "", "camera_punch();", ""].join("\n");

    const formatted = await Format.format(source);

    assert.strictEqual(formatted, ["delete foo; // keep separation", "", "camera_punch();", ""].join("\n"));
});
