import assert from "node:assert/strict";
import { describe, it } from "node:test";

import FunctionalParserTransform from "../../src/transforms/functional-transform.js";
import {
    availableTransforms,
    getParserTransform
} from "../../src/transforms/index.js";

void describe("Transform registry", () => {
    void it("exposes every registered transform that implements the shared base", () => {
        for (const name of availableTransforms) {
            const transform = getParserTransform(name);
            assert.strictEqual(transform.name, name);
            assert.ok(
                transform instanceof FunctionalParserTransform,
                `Transform "${name}" must extend FunctionalParserTransform`
            );
        }
    });
});
