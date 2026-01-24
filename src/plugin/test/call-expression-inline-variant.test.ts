import assert from "node:assert/strict";
import { test } from "node:test";

import { Plugin } from "../src/index.js";

void test("keeps simple leading arguments inline when callbacks follow", async () => {
    const longCallbackName = ["someFunctionCallWithBigArgumentsAndA", "Callback"].join("");
    const callbackParam = "a".repeat(18);
    const source = [
        `call(1,2,3, ${longCallbackName}, function(${callbackParam}){foo()})`,
        ""
    ].join("\n");

    const formatted = await Plugin.format(source);
    const lines = formatted.split("\n");

    assert.strictEqual(
        lines[0],
        `call(1, 2, 3, ${longCallbackName}, function(${callbackParam}) {`,
        "Expected leading simple arguments to remain inline when trailing callbacks do not force a wrap."
    );
});
