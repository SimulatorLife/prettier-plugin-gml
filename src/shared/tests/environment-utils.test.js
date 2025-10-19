import assert from "node:assert/strict";
import process from "node:process";
import test from "node:test";

import { applyEnvironmentOverride } from "../environment-utils.js";

test("applyEnvironmentOverride forwards values from provided env", () => {
    let received = null;

    applyEnvironmentOverride({
        env: { SAMPLE_ENV: "value" },
        envVar: "SAMPLE_ENV",
        applyValue: (value) => {
            received = value;
        }
    });

    assert.equal(received, "value");
});

test("applyEnvironmentOverride skips missing variables", () => {
    let called = false;

    applyEnvironmentOverride({
        env: {},
        envVar: "UNKNOWN_ENV",
        applyValue: () => {
            called = true;
        }
    });

    assert.equal(called, false);
});

test("applyEnvironmentOverride falls back to process.env when env is omitted", () => {
    const variable = `TEST_ENV_${Date.now()}`;
    const original = process.env[variable];
    process.env[variable] = "inherited";

    try {
        let captured = null;

        applyEnvironmentOverride({
            envVar: variable,
            applyValue: (value) => {
                captured = value;
            }
        });

        assert.equal(captured, "inherited");
    } finally {
        if (original === undefined) {
            delete process.env[variable];
        } else {
            process.env[variable] = original;
        }
    }
});
