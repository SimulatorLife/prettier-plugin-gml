import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    createAbortError,
    createAbortGuard,
    throwIfAborted
} from "../abort-utils.js";

describe("createAbortError", () => {
    it("returns null for non-aborted signals", () => {
        assert.equal(createAbortError(null, "fallback"), null);
        assert.equal(createAbortError({ aborted: false }, "fallback"), null);
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
        assert.equal(error.name, "AbortError");
        assert.equal(error.message, "fallback message");
    });

    it("wraps non-error reasons using the fallback message", () => {
        const signal = { aborted: true, reason: "boom" };
        const error = createAbortError(signal, "fallback");
        assert.ok(error instanceof Error);
        assert.equal(error.message, "boom");
    });

    it("uses the fallback message when no reason is provided", () => {
        const signal = { aborted: true, reason: undefined };
        const error = createAbortError(signal, "custom abort message");
        assert.equal(error.message, "custom abort message");
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
        assert.equal(guard.signal, signal);
        assert.doesNotThrow(() => guard.ensureNotAborted());
    });

    it("returns null when no signal is provided", () => {
        const guard = createAbortGuard({}, {});
        assert.equal(guard.signal, null);
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
