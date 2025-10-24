import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath]
    });
}

test("keeps member call property on the same line as the object", async () => {
    const source = [
        "global.lighting.draw(",
        "    vmat, pmat,",
        "    function() {",
        "        return true;",
        "    },",
        "    function() {",
        "        return false;",
        "    }",
        ");",
        ""
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const lines = formatted.trim().split("\n");

    assert.strictEqual(
        lines[0],
        "global.lighting.draw(",
        "Expected chained member calls to stay intact instead of splitting before the property name."
    );
});
