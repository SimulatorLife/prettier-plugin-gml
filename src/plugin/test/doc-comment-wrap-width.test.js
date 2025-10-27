import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { test } from "node:test";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

const SAMPLE_DESCRIPTION =
    "Local space: X∈[-0.5,+0.5], Y∈[-0.5,+0.5], base plane at Z=0, apex line at (Y=0,Z=1).";

function createSource() {
    return [
        "/// @description Write a unit triangular prism into an existing vbuff.",
        `///              ${SAMPLE_DESCRIPTION}`,
        "function vertex_buffer_write_triangular_prism() {",
        "    return 1;",
        "}",
        ""
    ].join("\n");
}

test("doc comment descriptions respect the configured print width", async () => {
    const formatted = await prettier.format(createSource(), {
        parser: "gml-parse",
        plugins: [pluginPath],
        printWidth: 120
    });

    assert.ok(
        formatted.includes(`///              ${SAMPLE_DESCRIPTION}`),
        "Expected the description to remain on a single line when it fits within printWidth."
    );

    assert.ok(
        !formatted.includes("///              apex line at"),
        "Expected the formatter not to synthesize a wrapped continuation line."
    );
});
