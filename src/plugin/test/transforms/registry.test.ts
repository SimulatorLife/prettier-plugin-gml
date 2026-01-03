import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ParserTransform } from "../../src/transforms/functional-transform.js";
import { availableTransforms, getParserTransform } from "../../src/transforms/index.js";

function isParserTransform(value: unknown): value is ParserTransform {
    return (
        typeof value === "object" &&
        value !== null &&
        "name" in value &&
        "defaultOptions" in value &&
        "transform" in value &&
        typeof (value as ParserTransform).name === "string" &&
        typeof (value as ParserTransform).defaultOptions === "object" &&
        typeof (value as ParserTransform).transform === "function"
    );
}

void describe("Transform registry", () => {
    void it("exposes every registered transform that implements the ParserTransform interface", () => {
        for (const name of availableTransforms) {
            const transform = getParserTransform(name);
            assert.strictEqual(transform.name, name);
            assert.ok(isParserTransform(transform), `Transform "${name}" must implement ParserTransform interface`);
        }
    });
});
