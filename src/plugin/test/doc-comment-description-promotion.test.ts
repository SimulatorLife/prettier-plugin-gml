import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("promotes leading doc comment text to description metadata", async () => {
    const source = [
        "/// Summarizes the function behaviour",
        "///",
        "/// Additional context lines",
        "///",
        "/// @param value",
        "function example(value) {",
        "    return value;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.split("\n");

    const functionIndex = lines.findIndex((line) =>
        line.includes("@function example")
    );
    const descriptionIndex = lines.findIndex((line) =>
        line.includes("@description")
    );

    assert.ok(
        functionIndex !== -1,
        "Expected synthetic @function metadata to be present."
    );
    assert.ok(
        descriptionIndex !== -1,
        "Expected leading text to be promoted to @description metadata."
    );
    assert.ok(
        functionIndex < descriptionIndex,
        "Expected @description block to appear after the @function tag."
    );

    assert.equal(
        lines[descriptionIndex],
        "/// @description Summarizes the function behaviour",
        "Expected the first description line to match the leading doc text."
    );

    const continuationIndex = lines.findIndex(
        (line, index) =>
            index > descriptionIndex &&
            line.includes("Additional context lines")
    );
    assert.ok(
        continuationIndex > descriptionIndex,
        "Expected continuation lines to remain after the description block."
    );
    assert.equal(
        lines[continuationIndex],
        "///              Additional context lines",
        "Expected subsequent doc comment text to remain as continuation lines."
    );
});

void test("keeps a blank separator before synthetic doc tags when leading text lacks metadata", async () => {
    const source = [
        "/// Describes function usage",
        "/// Additional summary",
        "function demo() {",
        "    return 42;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    const expected = [
        "/// @function demo",
        "/// @description Describes function usage",
        "///              Additional summary",
        "function demo() {",
        "    return 42;",
        "}",
        ""
    ].join("\n");
    
    assert.strictEqual(
        formatted,
        expected,
        "Expected no extra blank lines when no doc tags are present."
    );
});

void test("normalizes doc-like comment prefixes before promoting description metadata", async () => {
    const source = [
        "// / Leading summary",
        "// / Additional note",
        "/// @param value - the input",
        "function demo(value) {",
        "    return value;",
        "}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.split("\n");

    const descriptionIndex = lines.findIndex((line) =>
        line.includes("@description")
    );
    assert.ok(
        descriptionIndex !== -1,
        "Expected doc-like prefixes to promote into @description metadata."
    );
    assert.equal(
        lines[descriptionIndex],
        "/// @description Leading summary",
        "Expected leading doc-like comment text to normalize into @description metadata."
    );

    const continuationIndex = lines.findIndex(
        (line, index) =>
            index > descriptionIndex && line.includes("Additional note")
    );
    assert.ok(
        continuationIndex > descriptionIndex,
        "Expected additional doc-like comment text to be treated as a continuation line."
    );
    assert.equal(
        lines[continuationIndex],
        "///              Additional note",
        "Expected continuation lines to align with @description metadata indentation."
    );

    assert.ok(
        !lines.some((line) => line.includes("// /")),
        "Expected doc-like comment prefixes to normalize to triple slashes."
    );
});
