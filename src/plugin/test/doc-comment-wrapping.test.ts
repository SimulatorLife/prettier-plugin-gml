import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

// We use Plugin.format to simplify test usage and stay consistent with the
// plugin's public API exported from `src/index.ts`.

const LONG_DESCRIPTION =
    "Base class for all shapes. Shapes can be solid or not solid. Solid shapes will " +
    "collide with other solid shapes, and non-solid shapes will not collide with anything.";

async function formatDescriptionLines(options?: Parameters<typeof Plugin.format>[1]) {
    const source = [`/// @description ${LONG_DESCRIPTION}`, "function wrap_example() {}", ""].join("\n");

    const formatted = await Plugin.format(source, options);
    const lines = formatted.trim().split("\n");
    const descriptionIndex = lines.findIndex((line) => line.startsWith("/// @description"));

    assert.ok(descriptionIndex !== -1, "Expected formatter to emit a @description doc comment line.");

    return { lines, descriptionIndex };
}

void test("does NOT wrap long @description doc comments at the formatter width", async () => {
    const { lines, descriptionIndex } = await formatDescriptionLines();

    const [firstLine] = lines.slice(descriptionIndex, descriptionIndex + 1);

    assert.strictEqual(firstLine, `/// @description ${LONG_DESCRIPTION}`);
});
void test("does NOT wrap @description doc comments when printWidth exceeds the description length", async () => {
    const { lines, descriptionIndex } = await formatDescriptionLines({
        printWidth: 200
    });

    const [firstLine] = lines.slice(descriptionIndex, descriptionIndex + 1);

    assert.strictEqual(firstLine, `/// @description ${LONG_DESCRIPTION}`);
    assert.ok(
        !lines[descriptionIndex + 1]?.startsWith("///              "),
        "Expected no continuation lines when the printWidth exceeds the description length"
    );
});

void test("does NOT wrap @description doc comments when printWidth is narrow", async () => {
    const source = [`/// @description ${LONG_DESCRIPTION}`, "function wrap_example() {}", ""].join("\n");

    const formatted = await Plugin.format(source, { printWidth: 60 });

    const lines = formatted.trim().split("\n");
    const descriptionIndex = lines.findIndex((line) => line.startsWith("/// @description"));

    assert.ok(descriptionIndex !== -1, "Expected formatter to emit a @description doc comment line.");

    const [firstLine] = lines.slice(descriptionIndex, descriptionIndex + 1);

    assert.strictEqual(firstLine, `/// @description ${LONG_DESCRIPTION}`);
    assert.ok(
        !lines[descriptionIndex + 1]?.startsWith("///              "),
        "Expected no continuation lines even when the printWidth is narrow"
    );
});

void test("preserves doc comment continuation labels without indentation", async () => {
    const source = [
        "/// @description Write a unit triangular prism into an existing vbuff.",
        "/// Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1).",
        "function describe_triangular_prism() {}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);

    const lines = formatted.trim().split("\n");
    const descriptionIndex = lines.findIndex((line) => line.startsWith("/// @description"));

    assert.ok(descriptionIndex !== -1, "Expected formatter to emit a @description doc comment line.");

    const continuationLines = collectDescriptionContinuationLines(lines, descriptionIndex);

    assert.ok(
        continuationLines.some((line) => line.includes("Local space: ")),
        "Expected doc comment continuation to retain the 'Local space:' label."
    );
});

void test("pads retained @description continuation lines when they lack indentation", async () => {
    const source = [
        "/// @description Write a unit triangular prism into an existing vbuff.",
        "/// Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1).",
        "function describe_triangular_prism() {}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, { printWidth: 200 });
    const lines = formatted.trim().split("\n");
    const continuationLine = lines.find((line) => line.includes("Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5]"));

    assert.strictEqual(
        continuationLine,
        "///              Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1).",
        "Expected formatter to pad retained @description continuation lines."
    );
});

void test("does not expand preformatted doc comment continuations", async () => {
    const source = [
        "/// @description Write a unit triangular prism into an existing vbuff.",
        "///              Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1).",
        "function describe_triangular_prism() {}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, { printWidth: 60 });
    const lines = formatted.trim().split("\n");
    const descriptionIndex = lines.findIndex((line) => line.startsWith("/// @description"));

    assert.ok(descriptionIndex !== -1, "Expected formatter to emit a @description doc comment line.");

    const continuationLines = collectDescriptionContinuationLines(lines, descriptionIndex);

    assert.strictEqual(
        continuationLines.length,
        1,
        "Expected formatter to preserve the manually wrapped continuation block."
    );

    assert.strictEqual(
        continuationLines[0],
        "///              Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1)."
    );
});

function collectDescriptionContinuationLines(lines, descriptionIndex) {
    const continuationLines = [];
    for (let index = descriptionIndex + 1; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.startsWith("///")) {
            break;
        }

        if (line.startsWith("/// @")) {
            continue;
        }

        continuationLines.push(line);
    }

    return continuationLines;
}

void test("does NOT wrap function doc descriptions while honoring printWidth", async () => {
    const source = [
        "/// @param arg Example parameter",
        `/// @description ${LONG_DESCRIPTION}`,
        "function long_description_function(arg) {}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, { printWidth: 120 });
    const lines = formatted.split("\n");
    const descriptionIndex = lines.findIndex((line) => line.startsWith("/// @description"));

    assert.strictEqual(
        lines[descriptionIndex],
        `/// @description ${LONG_DESCRIPTION}`,
        "Expected the description line to remain unwrapped."
    );
});

void test("does NOT wrap long @param descriptions with continuation lines", async () => {
    const source = [
        "/// @param value This parameter's description is intentionally long so it wraps across multiple lines and respects the formatter width.",
        "function wrap_param_description(value) {}",
        ""
    ].join("\n");

    const formatted = await Plugin.format(source, { printWidth: 60 });
    const lines = formatted.split("\n");
    const paramIndex = lines.findIndex((line) => line.startsWith("/// @param value"));

    assert.strictEqual(
        lines[paramIndex],
        "/// @param value This parameter's description is intentionally long so it wraps across multiple lines and respects the formatter width.",
        "Expected the @param line to remain unwrapped."
    );
});
