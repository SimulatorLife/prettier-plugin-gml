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

test(
    "preserves blank line between final constructor member and closing brace",
    async () => {
        const source = [
            "function Demo() constructor {",
            "    static greet = function() {",
            "        return 1;",
            "    };",
            "",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);
        const lines = formatted.trimEnd().split("\n");
        const closingBraceIndex = lines.lastIndexOf("}");

        assert.ok(
            closingBraceIndex > 0,
            "Expected the formatted output to include a closing brace."
        );
        assert.equal(
            lines[closingBraceIndex - 1],
            "",
            "Expected constructors to keep blank lines that separate the last member from the closing brace."
        );
    }
);
