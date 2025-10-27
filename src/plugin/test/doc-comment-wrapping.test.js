import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginPath = path.resolve(__dirname, "../src/gml.js");

const LONG_DESCRIPTION =
    "Base class for all shapes. Shapes can be solid or not solid. Solid shapes will " +
    "collide with other solid shapes, and non-solid shapes will not collide with anything.";

test("wraps long @description doc comments at the formatter width", async () => {
    const source = [
        `/// @description ${LONG_DESCRIPTION}`,
        "function wrap_example() {}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const lines = formatted.trim().split("\n");
    const descriptionIndex = lines.findIndex((line) =>
        line.startsWith("/// @description")
    );

    assert.ok(
        descriptionIndex !== -1,
        "Expected formatter to emit a @description doc comment line."
    );

    const [firstLine, secondLine, thirdLine] = lines.slice(
        descriptionIndex,
        descriptionIndex + 3
    );

    assert.strictEqual(
        firstLine,
        "/// @description Base class for all shapes. Shapes can be solid or not solid."
    );
    assert.strictEqual(
        secondLine,
        "///              Solid shapes will collide with other solid shapes, and"
    );
    assert.strictEqual(
        thirdLine,
        "///              non-solid shapes will not collide with anything."
    );
});

test("wraps @description doc comments when printWidth exceeds the wrapping cap", async () => {
    const source = [
        `/// @description ${LONG_DESCRIPTION}`,
        "function wrap_example() {}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        printWidth: 200
    });

    const lines = formatted.trim().split("\n");
    const descriptionIndex = lines.findIndex((line) =>
        line.startsWith("/// @description")
    );

    assert.ok(
        descriptionIndex !== -1,
        "Expected formatter to emit a @description doc comment line."
    );

    const [firstLine, secondLine, thirdLine] = lines.slice(
        descriptionIndex,
        descriptionIndex + 3
    );

    assert.strictEqual(
        firstLine,
        "/// @description Base class for all shapes. Shapes can be solid or not solid."
    );
    assert.strictEqual(
        secondLine,
        "///              Solid shapes will collide with other solid shapes, and"
    );
    assert.strictEqual(
        thirdLine,
        "///              non-solid shapes will not collide with anything."
    );
});

test("wraps @description doc comments when printWidth is narrow but prevents a single word from being wrapped", async () => {
    const source = [
        `/// @description ${LONG_DESCRIPTION}`,
        "function wrap_example() {}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        printWidth: 60
    });

    const lines = formatted.trim().split("\n");
    const descriptionIndex = lines.findIndex((line) =>
        line.startsWith("/// @description")
    );

    assert.ok(
        descriptionIndex !== -1,
        "Expected formatter to emit a @description doc comment line."
    );

    const [firstLine, secondLine, thirdLine, fourthLine] = lines.slice(
        descriptionIndex,
        descriptionIndex + 4
    );

    assert.strictEqual(
        firstLine,
        "/// @description Base class for all shapes. Shapes can be"
    );
    assert.strictEqual(
        secondLine,
        "///              solid or not solid. Solid shapes will"
    );
    assert.strictEqual(
        thirdLine,
        "///              collide with other solid shapes, and"
    );
    assert.strictEqual(
        fourthLine,
        "///              non-solid shapes will not collide with anything."
    );
});

test("preserves doc comment continuation labels without indentation", async () => {
    const source = [
        "/// @description Write a unit triangular prism into an existing vbuff.",
        "/// Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1).",
        "function describe_triangular_prism() {}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const lines = formatted.trim().split("\n");
    const descriptionIndex = lines.findIndex((line) =>
        line.startsWith("/// @description")
    );

    assert.ok(
        descriptionIndex !== -1,
        "Expected formatter to emit a @description doc comment line."
    );

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

    assert.ok(
        continuationLines.some((line) => line.includes("Local space: ")),
        "Expected doc comment continuation to retain the 'Local space:' label."
    );
});

test("pads retained @description continuation lines when they lack indentation", async () => {
    const source = [
        "/// @description Write a unit triangular prism into an existing vbuff.",
        "/// Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1).",
        "function describe_triangular_prism() {}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const lines = formatted.trim().split("\n");
    const continuationLine = lines.find((line) =>
        line.includes("Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5]")
    );

    assert.strictEqual(
        continuationLine,
        "///              Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1).",
        "Expected formatter to pad retained @description continuation lines."
    );
});

test("does not expand preformatted doc comment continuations", async () => {
    const source = [
        "/// @description Write a unit triangular prism into an existing vbuff.",
        "///              Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1).",
        "function describe_triangular_prism() {}",
        ""
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    const lines = formatted.trim().split("\n");
    const descriptionIndex = lines.findIndex((line) =>
        line.startsWith("/// @description")
    );

    assert.ok(
        descriptionIndex !== -1,
        "Expected formatter to emit a @description doc comment line."
    );

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

test("keeps short trailing description text on a single continuation line", async () => {
    const source = [
        "/// @function demo",
        "/// @param foo",
        "/// @param [bar=baz]",
        "/// @description Write a unit triangular prism into an existing vbuff.",
        "///              Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1).",
        "function demo(foo, bar) {}"
    ].join("\n");

    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.match(
        formatted,
        /base plane at Z=0, apex line at \(Y=0,Z=1\)\./,
        "Expected the apex description to remain on the same continuation line"
    );
    assert.ok(
        !formatted.includes("base plane at Z=0,\n///              apex"),
        "Expected the doc comment wrapper not to split the trailing description"
    );
});
