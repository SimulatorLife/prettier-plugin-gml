import assert from "node:assert/strict";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

test("aligns two simple assignments with default configuration", async () => {
    const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
    const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

    const source = "foo = 1;\nlongerName = 2;\n";
    const formatted = await prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });

    assert.strictEqual(
        formatted,
        "foo        = 1;\nlongerName = 2;\n",
        "expected consecutive assignments to align with the default threshold"
    );
});
