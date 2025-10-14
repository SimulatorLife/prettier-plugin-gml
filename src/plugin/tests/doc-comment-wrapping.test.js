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
