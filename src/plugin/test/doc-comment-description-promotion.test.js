import assert from "node:assert/strict";
import path from "node:path";
import prettier from "prettier";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source) {
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }

    return formatted.trim();
}

test("promotes leading doc comment text to description metadata", async () => {
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

    const formatted = await formatWithPlugin(source);
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

test("keeps a blank separator before synthetic doc tags when leading text lacks metadata", async () => {
    const source = [
        "/// Describes function usage",
        "/// Additional summary",
        "function demo() {",
        "    return 42;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.split("\n");

    const summaryIndex = lines.findIndex((line) =>
        line.includes("Additional summary")
    );
    assert.ok(summaryIndex !== -1, "Expected summary text to remain present.");
    assert.equal(
        lines[summaryIndex + 1],
        "",
        "Expected a blank line between the summary text and synthetic metadata."
    );

    const functionIndex = lines.findIndex((line) =>
        line.includes("@function demo")
    );
    assert.ok(
        functionIndex > summaryIndex,
        "Expected synthetic metadata to follow the summary block."
    );
});
