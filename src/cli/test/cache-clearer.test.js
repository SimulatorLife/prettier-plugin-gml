import assert from "node:assert/strict";
import test from "node:test";

import { clearIdentifierCaseCaches } from "../src/plugin-runtime/cache-clearer.js";

test("cache clearer", async (t) => {
    await t.test("exports clearIdentifierCaseCaches function", () => {
        assert.strictEqual(
            typeof clearIdentifierCaseCaches,
            "function",
            "clearIdentifierCaseCaches should be a function"
        );
    });

    await t.test("clearIdentifierCaseCaches executes without error", () => {
        assert.doesNotThrow(
            () => clearIdentifierCaseCaches(),
            "clearIdentifierCaseCaches should not throw"
        );
    });
});
