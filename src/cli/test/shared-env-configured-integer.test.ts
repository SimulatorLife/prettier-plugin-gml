import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createIntegerEnvConfiguredValue } from "../src/shared/env-configured-integer.js";

const TEST_INTEGER_ENV_VAR = "PRETTIER_PLUGIN_GML_TEST_INTEGER_ENV";

function coerceIntegerValue(value: unknown): number {
    if (typeof value === "number") {
        return value;
    }

    if (typeof value === "string") {
        return Number(value);
    }

    return Number.NaN;
}

void describe("createIntegerEnvConfiguredValue", () => {
    void it("applies environment overrides during initialization", () => {
        const state = createIntegerEnvConfiguredValue({
            defaultValue: 3,
            envVar: TEST_INTEGER_ENV_VAR,
            coerce: coerceIntegerValue,
            typeErrorMessage: (type) => `Expected number, received ${type}.`
        });

        const value = state.applyEnvOverride({ [TEST_INTEGER_ENV_VAR]: "7" });

        assert.strictEqual(value, 7);
        assert.strictEqual(state.get(), 7);
    });

    void it("falls back to the configured default when coercion resolves blank input", () => {
        const state = createIntegerEnvConfiguredValue({
            defaultValue: 5,
            envVar: TEST_INTEGER_ENV_VAR,
            coerce: coerceIntegerValue,
            typeErrorMessage: (type) => `Expected number, received ${type}.`
        });

        state.set(11);
        const value = state.set("   ");

        assert.strictEqual(value, 5);
        assert.strictEqual(state.get(), 5);
    });
});
