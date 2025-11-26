import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

async function formatWithPlugin(source, options: any = {}) {
    const formatted = await Plugin.format(source, options);

    if (typeof formatted !== "string") {
        throw new TypeError("Expected Plugin.format to return a string result.");
    }

    return formatted.trim();
}

test("adds undefined defaults for trailing optional parameters", async () => {
    const formatted = await formatWithPlugin(
        [
            "function demo(first, second = 1, third) {",
            "    return [first, second, third];",
            "}",
            ""
        ].join("\n")
    );

    const signatureLine = formatted
        .split("\n")
        .find((line) => line.startsWith("function demo("));

    assert.strictEqual(
        signatureLine,
        "function demo(first, second = 1, third = undefined) {"
    );
});
