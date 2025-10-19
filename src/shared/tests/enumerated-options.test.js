import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeEnumeratedOption } from "../enumerated-option-utils.js";

describe("normalizeEnumeratedOption", () => {
    const formats = new Set(["json", "human"]);

    it("returns the fallback for undefined values", () => {
        assert.equal(
            normalizeEnumeratedOption(undefined, "json", formats),
            "json"
        );
    });

    it("normalizes string input using the default coercion", () => {
        assert.equal(
            normalizeEnumeratedOption(" HUMAN ", null, formats),
            "human"
        );
    });

    it("returns null when the normalized value is invalid", () => {
        assert.equal(normalizeEnumeratedOption("xml", "json", formats), null);
    });

    it("supports custom coercion callbacks", () => {
        const numbers = new Set(["one", "two"]);
        const result = normalizeEnumeratedOption(2, "one", numbers, {
            coerce: (value) => (value === 2 ? "two" : String(value))
        });
        assert.equal(result, "two");
    });

    it("throws when the valid value collection lacks a has method", () => {
        assert.throws(
            () => normalizeEnumeratedOption("two", "one", {}),
            (error) =>
                error instanceof TypeError &&
                error.message.includes("has function")
        );
    });
});
