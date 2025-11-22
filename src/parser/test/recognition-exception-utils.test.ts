import assert from "node:assert/strict";
import test from "node:test";

import antlr4 from "antlr4";
import {
    isRecognitionExceptionLike,
    installRecognitionExceptionLikeGuard
} from "../src/runtime/recognition-exception-patch.js";

type RecognitionExceptionConstructor = new (...args: unknown[]) => object;

const typedAntlr4 = antlr4 as typeof antlr4 & {
    error?: {
        RecognitionException?: RecognitionExceptionConstructor;
    };
};

const RecognitionException = typedAntlr4.error?.RecognitionException;
if (!RecognitionException) {
    throw new Error(
        "ANTLR RecognitionException class is required for the recognition guard tests"
    );
}

class RecognitionAdapter extends Error {
    readonly ctx: object;
    readonly expectedTokens: object;
    readonly offendingToken: object;
    
    constructor(message = "adapter failure") {
        super(message);
        this.ctx = {};
        this.expectedTokens = {};
        this.offendingToken = {};
    }
}

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
    const candidate = new RecognitionAdapter();
    assert.strictEqual(isRecognitionExceptionLike(candidate), true);
});

test("isRecognitionExceptionLike accepts method-based adapters", () => {
    class RecognitionDelegate extends Error {
        readonly ctx: object;

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

test("installRecognitionExceptionLikeGuard augments instanceof checks", () => {
    const candidate = new RecognitionAdapter();

    assert.strictEqual(candidate instanceof RecognitionException, false);

    installRecognitionExceptionLikeGuard();

    assert.strictEqual(candidate instanceof RecognitionException, true);
});
