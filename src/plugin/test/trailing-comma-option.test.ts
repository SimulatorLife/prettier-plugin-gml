/**
 * This test suite verifies the behavior of the trailing comma option helpers,
 * including validation and membership checks. GML itself does not allow
 * trailing commas, so we should not generate/support them. The only valid
 * option value is "none", and we want to provide clear warning messages for
 * all other, invalid cases and then ignore them.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    assertTrailingCommaValue,
    isTrailingCommaValue,
    TRAILING_COMMA
} from "../src/options/trailing-comma-option.js";

void describe("trailing comma option helpers", () => {
    void it("accepts case-insensitive trailing comma values", () => {
        assert.equal(assertTrailingCommaValue("ALL"), TRAILING_COMMA.ALL);
        assert.equal(assertTrailingCommaValue("es5"), TRAILING_COMMA.ES5);
    });

    void it("rejects non-string values with a descriptive type error", () => {
        assert.throws(() => assertTrailingCommaValue(5), {
            name: "TypeError",
            message: /Trailing comma override must be provided as a string/i
        });
    });

    void it("reports membership checks without throwing", () => {
        assert.equal(isTrailingCommaValue("none"), true);
        assert.equal(isTrailingCommaValue("bad-value"), false);
        assert.equal(isTrailingCommaValue(42), false);
    });
});
