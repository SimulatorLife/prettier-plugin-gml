import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultOptions } from "../src/gml.js";

test("plugin default options rely on Prettier print width", () => {
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(defaultOptions, "printWidth"),
        false,
        "Expected the plugin to defer to Prettier's default printWidth instead of overriding it."
    );
});
