import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Node deprecates the legacy assert.equal helper; keep these tests on the
// strict variants to mirror runtime behaviour in production code.

import {
    createAbortError,
    createAbortGuard,
    isAbortError,
    throwIfAborted
} from "../src/utils/abort.js";

describe("createAbortError", () => {
    it("returns null for non-aborted signals", () => {
        assert.strictEqual(createAbortError(null, "fallback"), null);
        assert.strictEqual(
            createAbortError({ aborted: false }, "fallback"),
            null
        );
    });

    it("returns the original error reason when provided", () => {
        const reason = new Error("custom");
        const signal = { aborted: true, reason };
        assert.strictEqual(createAbortError(signal, "ignored"), reason);
    });

    it("reuses error-like reasons that are not native Error instances", () => {
        const reason = {
            name: "AbortError",
            message: "custom",
            stack: "trace"
        };
        const signal = { aborted: true, reason };
        assert.strictEqual(createAbortError(signal, "ignored"), reason);
    });

    it("fills missing metadata on error-like reasons", () => {
        const reason = { message: "" };
        const signal = { aborted: true, reason };
        const error = createAbortError(signal, "fallback message");
        assert.strictEqual(error, reason);
        assert.strictEqual(error.name, "AbortError");
        assert.strictEqual(error.message, "fallback message");
    });

    it("wraps non-error reasons using the fallback message", () => {
        const signal = { aborted: true, reason: "boom" };
        const error = createAbortError(signal, "fallback");
        assert.ok(error instanceof Error);
        assert.strictEqual(error.message, "boom");
    });

    it("uses the fallback message when no reason is provided", () => {
        const signal = { aborted: true, reason: undefined };
        const error = createAbortError(signal, "custom abort message");
        assert.strictEqual(error.message, "custom abort message");
    });
});

describe("isAbortError", () => {
    it("identifies errors produced by createAbortError", () => {
        const signal = { aborted: true, reason: "stop" };
        const error = createAbortError(signal, "fallback");
        assert.strictEqual(isAbortError(error), true);
    });

    it("brands reused abort reasons", () => {
        const reason = new Error("cancelled");
        const signal = { aborted: true, reason };
        const error = createAbortError(signal, "fallback");
        assert.strictEqual(error, reason);
        assert.strictEqual(isAbortError(error), true);
    });

    if (typeof DOMException === "function") {
        it("recognizes native AbortError instances", () => {
            const error = new DOMException("Aborted", "AbortError");
            assert.strictEqual(isAbortError(error), true);
        });
    }

    it("recognizes abort errors identified by string codes", () => {
        const error = { code: "ABORT_ERR" };
        assert.strictEqual(isAbortError(error), true);
    });

    it("returns false for non-abort errors", () => {
        assert.strictEqual(isAbortError(new Error("boom")), false);
        assert.strictEqual(isAbortError(null), false);
    });
});

describe("throwIfAborted", () => {
    it("throws when the signal has been aborted", () => {
        const signal = { aborted: true, reason: "stop" };
        assert.throws(() => {
            throwIfAborted(signal, "fallback");
        }, /stop/);
    });

    it("returns silently when the signal is not aborted", () => {
        assert.doesNotThrow(() => {
            throwIfAborted({ aborted: false }, "fallback");
        });
    });
});

describe("createAbortGuard", () => {
    it("normalizes the signal from an options bag", () => {
        const signal = { aborted: false };
        const guard = createAbortGuard({ signal });
        assert.strictEqual(guard.signal, signal);
        assert.doesNotThrow(() => guard.ensureNotAborted());
    });

    it("returns null when no signal is provided", () => {
        const guard = createAbortGuard({}, {});
        assert.strictEqual(guard.signal, null);
        assert.doesNotThrow(() => guard.ensureNotAborted());
    });

    it("throws immediately when the signal is already aborted", () => {
        const controller = new AbortController();
        controller.abort("stop");
        assert.throws(() => {
            createAbortGuard({ signal: controller.signal });
        }, /stop/);
    });

    it("reuses the fallback message when the abort reason is missing", () => {
        const signal = { aborted: false, reason: undefined };
        const guard = createAbortGuard(
            { signal },
            { fallbackMessage: "Cancelled." }
        );

        signal.aborted = true;

        assert.throws(() => {
            guard.ensureNotAborted();
        }, /Cancelled\./);
    });
});
