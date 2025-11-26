import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

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

    const formatted = await Plugin.format(source);
    const lines = formatted.split("\n");

    assert.strictEqual(
        lines[0],
        "global.lighting.draw(",
        "Expected chained member calls to stay intact instead of splitting before the property name."
    );
});

test("keeps simple leading arguments on the same line when callbacks follow", async () => {
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

    const formatted = await Plugin.format(source);
    const lines = formatted.trim().split("\n");

    assert.strictEqual(
        lines[1],
        "    vmat, pmat,",
        "Expected leading simple arguments to remain grouped even when later callbacks force the call to wrap."
    );
});
