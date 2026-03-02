import assert from "node:assert/strict";
import test from "node:test";

import { defaultOptions, formatOptions } from "../src/format-entry.js";

void test("defaultOptions includes defaults defined by format options", () => {
    for (const [optionName, optionConfig] of Object.entries(formatOptions)) {
        if (!optionConfig || !Object.hasOwn(optionConfig, "default")) {
            continue;
        }

        const optionDefault = (optionConfig as { default: unknown }).default;
        assert.strictEqual(
            Reflect.get(defaultOptions, optionName),
            optionDefault,
            `expected default option ${optionName} to be present in defaultOptions`
        );
    }
});
