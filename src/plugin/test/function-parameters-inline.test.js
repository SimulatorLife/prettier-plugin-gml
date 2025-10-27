import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import prettier from "prettier";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function format(source, options = {}) {
    return prettier.format(source, {
        parser: "gml-parse",
        plugins: [pluginPath],
        ...options
    });
}

test("inlines default parameter functions with single call bodies", async () => {
    const source = [
        "some(",
        "    thisArgumentIsQuiteLong,",
        "    function foo(cool, f = function() {",
        "        ez();",
        "    }) : bar() constructor {",
        "        return cool;",
        "    }",
        ");",
        ""
    ].join("\n");

    const formatted = await format(source, {
        convertDivisionToMultiplication: true
    });

    assert.strictEqual(
        formatted,
        [
            "some(",
            "    thisArgumentIsQuiteLong,",
            "    function foo(cool, f = function() { ez(); }) : bar() constructor {",
            "        return cool;",
            "    }",
            ");",
            ""
        ].join("\n")
    );
});
