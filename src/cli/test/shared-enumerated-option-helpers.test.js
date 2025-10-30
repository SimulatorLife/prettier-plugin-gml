import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    createEnumeratedOptionHelpers,
    createStringEnumeratedOptionHelpers
} from "../src/shared/dependencies.js";

describe("createEnumeratedOptionHelpers", () => {
    it("formats the sorted list of enumerated values", () => {
        const helpers = createEnumeratedOptionHelpers([
            "json",
            "human",
            "yaml"
        ]);
        assert.equal(helpers.formatList(), "human, json, yaml");
    });

    it("normalizes values with fallback support", () => {
        const helpers = createEnumeratedOptionHelpers(["json", "human"]);
        assert.equal(helpers.normalize("json"), "json");
        assert.equal(helpers.normalize(null, { fallback: "human" }), "human");
        assert.equal(helpers.normalize("xml", { fallback: "human" }), null);
        assert.equal(helpers.normalize("xml"), null);
    });

    it("throws with a descriptive message when value is not allowed", () => {
        const helpers = createEnumeratedOptionHelpers(["json"], {
            formatErrorMessage: ({ list, received }) =>
                `Expected values: ${list}. Received: ${received}.`
        });

        assert.throws(
            () => helpers.requireValue("yaml"),
            (error) =>
                error instanceof Error &&
                error.message === 'Expected values: json. Received: "yaml".'
        );
    });

    it("supports custom coercion when validating values", () => {
        const helpers = createEnumeratedOptionHelpers(["json"], {
            coerce(value) {
                if (typeof value !== "string") {
                    throw new TypeError("value must be provided as a string");
                }

                return value.trim().toLowerCase();
            }
        });

        assert.equal(helpers.requireValue(" JSON \n"), "json");
        assert.throws(
            () => helpers.requireValue(42),
            /value must be provided as a string/
        );
    });

    it("allows overriding error messages per invocation", () => {
        const helpers = createEnumeratedOptionHelpers(["json"]);
        assert.throws(
            () =>
                helpers.requireValue("yaml", {
                    createErrorMessage: (value) => `unsupported: ${value}`
                }),
            (error) =>
                error instanceof Error && error.message === "unsupported: yaml"
        );
    });

    it("normalizes string inputs while enforcing type guards", () => {
        const helpers = createStringEnumeratedOptionHelpers(["json"], {
            valueLabel: "Output format",
            formatErrorMessage: ({ list }) => `Format must be one of: ${list}.`
        });

        assert.equal(helpers.requireValue(" JSON \n"), "json");
        assert.throws(
            () => helpers.requireValue(42),
            (error) =>
                error instanceof TypeError &&
                error.message ===
                    "Output format must be provided as a string (received type 'number')."
        );
    });
});
