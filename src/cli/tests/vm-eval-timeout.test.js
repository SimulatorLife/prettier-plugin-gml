import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_VM_EVAL_TIMEOUT_MS,
    resolveVmEvalTimeout
} from "../lib/vm-eval-timeout.js";

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
