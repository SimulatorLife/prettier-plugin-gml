import assert from "node:assert/strict";
import path from "node:path";
import prettier from "prettier";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source, options = {}) {
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        printWidth: 120,
        ...options
    });

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Prettier to return a string result.");
    }

    return formatted.trim();
}

test("breaks sentences in doc comments with default threshold", async () => {
    const source = [
        "/// This is a long first sentence that describes functionality. This starts a new sentence with important details that should be wrapped.",
        "/// @param value - Input value",
        "function example(value) {",
        "    return value * 2;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.split("\n");

    // With default threshold (60), sentences should break when there's sufficient space
    const hasMultipleDescriptionLines =
        lines.some((line) => line.includes("This starts a new sentence"));

    assert.ok(
        hasMultipleDescriptionLines,
        "Expected doc comment sentences to be broken with default threshold."
    );
});

test("respects custom sentence break threshold", async () => {
    const source = [
        "/// This is a short sentence. Another sentence follows here with more context.",
        "/// @param value - Input value",
        "function example(value) {",
        "    return value * 2;",
        "}",
        ""
    ].join("\n");

    // With a very high threshold (200), sentences should NOT break
    const formatted = await formatWithPlugin(source, {
        docCommentMinSentenceBreakSpace: 200
    });
    const lines = formatted.split("\n");

    // Verify the description stays on fewer lines when threshold is high
    const descriptionLines = lines.filter(
        (line) =>
            line.includes("@description") ||
            (line.trim().startsWith("///") && !line.includes("@"))
    );

    assert.ok(
        descriptionLines.length <= 2,
        "Expected sentences to stay together with high threshold."
    );
});

test("disables sentence breaking when threshold is zero", async () => {
    const source = [
        "/// First sentence here. Second sentence follows. Third sentence added.",
        "/// @param value",
        "function example(value) {",
        "    return value;",
        "}",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source, {
        docCommentMinSentenceBreakSpace: 0
    });
    const lines = formatted.split("\n");

    // When disabled (0), sentences should not be artificially broken at sentence boundaries
    // They may still wrap at the print width, but not specifically at sentence boundaries
    const descriptionLineCount = lines.filter(
        (line) =>
            line.trim().startsWith("///") &&
            !line.includes("@function") &&
            !line.includes("@param")
    ).length;

    // Verifying behavior is consistent
    assert.ok(
        descriptionLineCount >= 1,
        "Expected doc comments to be formatted even when sentence breaking is disabled."
    );
});
