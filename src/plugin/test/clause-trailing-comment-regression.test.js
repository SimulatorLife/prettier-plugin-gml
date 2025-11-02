import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function formatWithPlugin(source, overrides = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...overrides
    });
}

test("prints clause trailing comments with non-block bodies", async () => {
    const source = [
        "if (condition)\t//\tClause comment with tabs",
        "    perform_action();"
    ].join("\n");

    const formatted = await formatWithPlugin(source);
    const [clauseLine] = formatted.split("\n");

    assert.ok(
        clauseLine.includes("// Clause comment with tabs"),
        "Clause trailing comments should remain attached to their clause line."
    );

    assert.ok(
        !clauseLine.includes("//\t"),
        "Tabs inside clause trailing comments should be expanded to spaces."
    );
});
