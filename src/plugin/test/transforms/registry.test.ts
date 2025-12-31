import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    availableTransforms,
    getParserTransform
} from "../../src/transforms/index.js";

void describe("Transform registry", () => {
    void it("exposes every registered transform that implements the shared interface", () => {
        for (const name of availableTransforms) {
            const transform = getParserTransform(name);
            assert.strictEqual(transform.name, name);
            assert.ok(
                typeof transform.transform === "function",
                `Transform "${name}" must have a transform method`
            );
            assert.ok(
                transform.defaultOptions !== undefined,
                `Transform "${name}" must have defaultOptions`
            );
        }
    });
});
