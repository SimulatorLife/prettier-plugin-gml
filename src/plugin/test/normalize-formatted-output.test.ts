import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("normalizes output through a stable post-format pipeline", () => {
    const formatted = ["function demo() {", "", "", "    return 1;", "}"].join("\n");

    const normalized = Plugin.normalizeFormattedOutput(formatted, formatted);

    assert.equal(normalized, ["function demo() {", "    return 1;", "}", ""].join("\n"));
});

void test("reapplies source trailing whitespace for top-level line comments", () => {
    const formatted = ["// keep", "if (ready)", "{", "    run();", "}", ""].join("\n");
    const source = ["// keep   ", "if (ready)", "{", "    run();", "}", ""].join("\n");

    const normalized = Plugin.normalizeFormattedOutput(formatted, source);

    assert.equal(normalized.split("\n")[0], "// keep   ");
});
