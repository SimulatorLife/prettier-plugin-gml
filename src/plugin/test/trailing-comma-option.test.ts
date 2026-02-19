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
            message: /Trailing comma override must be a string/i
        });
    });

    void it("reports membership checks without throwing", () => {
        assert.equal(isTrailingCommaValue("none"), true);
        assert.equal(isTrailingCommaValue("bad-value"), false);
        assert.equal(isTrailingCommaValue(42), false);
    });
});
