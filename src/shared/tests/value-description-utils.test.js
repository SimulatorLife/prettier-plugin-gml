import assert from "node:assert/strict";
import test from "node:test";

import {
    describeValueWithQuotes,
    describeValueForMessage
} from "../utils/value-description.js";

test("describeValueWithQuotes quotes primitive values", () => {
    assert.strictEqual(describeValueWithQuotes("demo"), "'demo'");
    assert.strictEqual(describeValueWithQuotes(42), "'42'");
    assert.strictEqual(describeValueWithQuotes(false), "'false'");
});

test("describeValueWithQuotes handles nullish values", () => {
    assert.strictEqual(describeValueWithQuotes(), "undefined");
    assert.strictEqual(describeValueWithQuotes(null), "'null'");
});

test("describeValueWithQuotes falls back when quoting fails", () => {
    const problematic = {
        toString() {
            throw new Error("nope");
        }
    };

    assert.strictEqual(describeValueWithQuotes(problematic), "'object'");
});

test("describeValueWithQuotes supports handler overrides", () => {
    const received = describeValueWithQuotes(["value"], {
        overrides: {
            arrayDescription: () => "an array of values"
        }
    });

    assert.strictEqual(received, "an array of values");
});

test("describeValueWithQuotes accepts custom quote functions", () => {
    const received = describeValueWithQuotes("demo", {
        quote: (input, context) =>
            describeValueForMessage(input, {
                stringDescription: () => `${context.type}:${String(input)}`
            })
    });

    assert.strictEqual(received, "string:demo");
});
