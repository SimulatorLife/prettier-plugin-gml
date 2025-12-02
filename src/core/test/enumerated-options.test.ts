import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeEnumeratedOption } from "../src/utils/enumerated-options.js";

void describe("normalizeEnumeratedOption", () => {
    const formats = new Set(["json", "human"]);

    void it("returns the fallback for undefined values", () => {
        assert.equal(
            normalizeEnumeratedOption(undefined, "json", formats),
            "json"
        );
    });

    void it("normalizes string input using the default coercion", () => {
        assert.equal(
            normalizeEnumeratedOption(" HUMAN ", null, formats),
            "human"
        );
    });

    void it("returns null when the normalized value is invalid", () => {
        assert.equal(normalizeEnumeratedOption("xml", "json", formats), null);
    });

    void it("supports custom coercion callbacks", () => {
        const numbers = new Set(["one", "two"]);
        const result = normalizeEnumeratedOption(2, "one", numbers, {
            coerce: (value) => {
                if (value === 2) {
                    return "two";
                }

                if (typeof value === "string") {
                    return value;
                }

                if (typeof value === "number") {
                    return value.toString();
                }

                throw new TypeError("Unexpected enumerated option value");
            }
        });
        assert.equal(result, "two");
    });

    void it("throws when the valid value collection lacks a has method", () => {
        assert.throws(
            () => normalizeEnumeratedOption("two", "one", {}),
            (error) =>
                error instanceof TypeError &&
                error.message.includes("has function")
        );
    });
});
