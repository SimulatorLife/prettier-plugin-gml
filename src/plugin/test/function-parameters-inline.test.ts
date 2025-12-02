import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("inlines default parameter functions with single call bodies", async () => {
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

    const formatted = await Plugin.format(source, {
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
