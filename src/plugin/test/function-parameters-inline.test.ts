import assert from "node:assert/strict";
import { test } from "node:test";
import prettier from "prettier";

const pluginPath = new URL("../src/plugin-entry.js", import.meta.url);

async function format(source, options = {}) {
    return Plugin.format(source, {
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
