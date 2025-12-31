import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    createEnumeratedOptionHelpers,
    createStringEnumeratedOptionHelpers
} from "../src/shared/enumerated-option-helpers.js";

void describe("createEnumeratedOptionHelpers", () => {
    void it("formats the sorted list of enumerated values", () => {
        const helpers = createEnumeratedOptionHelpers([
            "json",
            "human",
            "yaml"
        ]);
        assert.equal(helpers.formatList(), "human, json, yaml");
    });

    void it("normalizes values with fallback support", () => {
        const helpers = createEnumeratedOptionHelpers(["json", "human"]);
        assert.equal(helpers.normalize("json"), "json");
        assert.equal(helpers.normalize(null, "human"), "human");
        assert.equal(helpers.normalize("xml", "human"), "human");
        assert.equal(helpers.normalize("xml"), null);
    });

    void it("throws with a descriptive message when value is not allowed", () => {
        const helpers = createEnumeratedOptionHelpers({
            values: ["json"],
            formatError: (list, received) =>
                `Expected values: ${list}. Received: ${received}.`
        });

        assert.throws(
            () => helpers.requireValue("yaml"),
            (error) =>
                error instanceof Error &&
                error.message === 'Expected values: json. Received: "yaml".'
        );
    });

    void it("uses default error message when no custom formatter is provided", () => {
        const helpers = createEnumeratedOptionHelpers(["json"]);
        assert.throws(
            () => helpers.requireValue("yaml"),
            (error) =>
                error instanceof Error &&
                error.message ===
                    'Value must be one of: json. Received: "yaml".'
        );
    });

    void it("normalizes string inputs while enforcing type guards", () => {
        const helpers = createStringEnumeratedOptionHelpers(
            ["json"],
            "Output format",
            (list) => `Format must be one of: ${list}.`
        );

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
