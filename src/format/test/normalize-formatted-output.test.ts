import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeFormattedOutput } from "../src/printer/normalize-formatted-output.js";

void test("normalizes output through a stable post-format pipeline", () => {
    const formatted = ["function demo() {", "", "", "    return 1;", "}"].join("\n");

    const normalized = normalizeFormattedOutput(formatted);

    assert.equal(normalized, ["function demo() {", "    return 1;", "}", ""].join("\n"));
});

void test("inserts blank line before top-level line comment that follows a closed single-line block comment", () => {
    // Bug: updateBlockCommentState("/* comment */", false) previously returned
    // true, causing the state tracker to think the next line was still inside
    // a block comment and skip blank-line insertion before the // comment.
    const formatted = ["/* comment */", "// line comment", ""].join("\n");

    const normalized = normalizeFormattedOutput(formatted);

    assert.equal(normalized, ["/* comment */", "", "// line comment", ""].join("\n"));
});

void test("does not insert blank line before line comment inside an open multi-line block comment", () => {
    // Lines inside an unclosed /* ... */ should not trigger blank-line insertion.
    const formatted = ["/* open comment", "// not a standalone comment", "*/", ""].join("\n");

    const normalized = normalizeFormattedOutput(formatted);

    assert.equal(normalized, ["/* open comment", "// not a standalone comment", "*/", ""].join("\n"));
});

void test("inserts blank line before top-level line comment after two consecutive single-line block comments", () => {
    const formatted = ["/* first */", "/* second */", "// line comment", ""].join("\n");

    const normalized = normalizeFormattedOutput(formatted);

    assert.equal(normalized, ["/* first */", "/* second */", "", "// line comment", ""].join("\n"));
});
