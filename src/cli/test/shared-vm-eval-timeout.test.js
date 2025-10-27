import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_VM_EVAL_TIMEOUT_MS,
    resolveVmEvalTimeout,
    getDefaultVmEvalTimeoutMs,
    setDefaultVmEvalTimeoutMs,
    VM_EVAL_TIMEOUT_ENV_VAR,
    applyVmEvalTimeoutEnvOverride
} from "../src/runtime-options/vm-eval-timeout.js";

const originalDefaultTimeout = getDefaultVmEvalTimeoutMs();
const originalEnvTimeout = process.env[VM_EVAL_TIMEOUT_ENV_VAR];

afterEach(() => {
    if (originalEnvTimeout === undefined) {
        delete process.env[VM_EVAL_TIMEOUT_ENV_VAR];
    } else {
        process.env[VM_EVAL_TIMEOUT_ENV_VAR] = originalEnvTimeout;
    }

    applyVmEvalTimeoutEnvOverride();
    setDefaultVmEvalTimeoutMs(originalDefaultTimeout);
});

describe("resolveVmEvalTimeout", () => {
    it("returns the default when value is undefined", () => {
        assert.strictEqual(resolveVmEvalTimeout(), DEFAULT_VM_EVAL_TIMEOUT_MS);
    });

    it("returns the default when value is null", () => {
        assert.strictEqual(
            resolveVmEvalTimeout(null),
            DEFAULT_VM_EVAL_TIMEOUT_MS
        );
    });

    it("coerces numeric input to an integer", () => {
        assert.strictEqual(resolveVmEvalTimeout(123.75), 123);
    });

    it("accepts numeric strings", () => {
        assert.strictEqual(resolveVmEvalTimeout("2500"), 2500);
    });

    it("returns null when the timeout is disabled", () => {
        assert.strictEqual(resolveVmEvalTimeout(0), null);
        assert.strictEqual(resolveVmEvalTimeout("0"), null);
    });

    it("ignores empty string overrides", () => {
        assert.strictEqual(
            resolveVmEvalTimeout("   "),
            DEFAULT_VM_EVAL_TIMEOUT_MS
        );
    });

    it("rejects negative values", () => {
        assert.throws(() => resolveVmEvalTimeout(-1), {
            name: "TypeError"
        });
    });

    it("rejects unsupported types", () => {
        assert.throws(() => resolveVmEvalTimeout(Symbol.for("timeout")), {
            name: "TypeError"
        });
    });
});

describe("VM evaluation timeout defaults", () => {
    it("exposes the configured default timeout", () => {
        assert.strictEqual(
            getDefaultVmEvalTimeoutMs(),
            DEFAULT_VM_EVAL_TIMEOUT_MS
        );
    });

    it("allows overriding the default timeout", () => {
        setDefaultVmEvalTimeoutMs(7500);
        assert.strictEqual(getDefaultVmEvalTimeoutMs(), 7500);
        assert.strictEqual(resolveVmEvalTimeout(), 7500);
    });

    it("supports disabling the timeout by default", () => {
        setDefaultVmEvalTimeoutMs(0);
        assert.strictEqual(getDefaultVmEvalTimeoutMs(), 0);
        assert.strictEqual(resolveVmEvalTimeout(), null);
    });

    it("rejects negative overrides", () => {
        assert.throws(() => setDefaultVmEvalTimeoutMs(-1), {
            name: "TypeError"
        });
    });
});

describe("VM evaluation timeout environment overrides", () => {
    it("applies the timeout from the environment when provided", () => {
        process.env[VM_EVAL_TIMEOUT_ENV_VAR] = "7500";
        applyVmEvalTimeoutEnvOverride();

        assert.strictEqual(getDefaultVmEvalTimeoutMs(), 7500);
        assert.strictEqual(resolveVmEvalTimeout(), 7500);
    });

    it("treats zero as disabling the timeout", () => {
        process.env[VM_EVAL_TIMEOUT_ENV_VAR] = "0";
        applyVmEvalTimeoutEnvOverride();

        assert.strictEqual(getDefaultVmEvalTimeoutMs(), 0);
        assert.strictEqual(resolveVmEvalTimeout(), null);
    });

    it("ignores invalid environment overrides", () => {
        process.env[VM_EVAL_TIMEOUT_ENV_VAR] = "not-a-number";
        applyVmEvalTimeoutEnvOverride();

        assert.strictEqual(getDefaultVmEvalTimeoutMs(), originalDefaultTimeout);
        assert.strictEqual(resolveVmEvalTimeout(), originalDefaultTimeout);
    });
});
