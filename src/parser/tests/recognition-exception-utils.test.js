import assert from "node:assert/strict";
import test from "node:test";

import { isRecognitionExceptionLike } from "../src/utils/recognition-exception.js";

test("isRecognitionExceptionLike rejects non-error values", () => {
    assert.strictEqual(isRecognitionExceptionLike(null), false);
    assert.strictEqual(isRecognitionExceptionLike(), false);
    assert.strictEqual(isRecognitionExceptionLike(42), false);
    assert.strictEqual(isRecognitionExceptionLike("error"), false);
});

test("isRecognitionExceptionLike rejects plain Error instances", () => {
    const error = new Error("failure");
    assert.strictEqual(isRecognitionExceptionLike(error), false);
});

test("isRecognitionExceptionLike accepts objects with expected token probes", () => {
    class RecognitionAdapter extends Error {
        constructor() {
            super("adapter failure");
            this.ctx = {};
            this.expectedTokens = {};
            this.offendingToken = {};
        }
    }

    const candidate = new RecognitionAdapter();
    assert.strictEqual(isRecognitionExceptionLike(candidate), true);
});

test("isRecognitionExceptionLike accepts method-based adapters", () => {
    class RecognitionDelegate extends Error {
        constructor() {
            super("delegate failure");
            this.ctx = {};
        }

        getExpectedTokens() {
            return {};
        }

        getOffendingToken() {
            return {};
        }
    }

    const candidate = new RecognitionDelegate();
    assert.strictEqual(isRecognitionExceptionLike(candidate), true);
});

test("isRecognitionExceptionLike requires contextual hints", () => {
    class MissingContextError extends Error {
        getExpectedTokens() {
            return {};
        }

        getOffendingToken() {
            return {};
        }
    }

    const candidate = new MissingContextError("missing");
    assert.strictEqual(isRecognitionExceptionLike(candidate), false);
});
