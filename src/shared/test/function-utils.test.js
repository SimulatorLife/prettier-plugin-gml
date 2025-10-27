import test from "node:test";
import assert from "node:assert/strict";

import { noop, resolveFunction } from "../src/utils/function.js";

test("resolveFunction returns the candidate when callable", () => {
    const handler = () => "handled";
    assert.equal(resolveFunction(handler), handler);
});

test("resolveFunction falls back to shared noop when candidate missing", () => {
    const resolved = resolveFunction();
    assert.equal(resolved, noop);
    assert.equal(resolved(), undefined);
});

test("resolveFunction returns provided fallback function", () => {
    const fallback = () => 42;
    const resolved = resolveFunction(null, fallback);
    assert.equal(resolved, fallback);
    assert.equal(resolved(), 42);
});

test("resolveFunction allows non-function fallback when enabled", () => {
    const fallback = null;
    const resolved = resolveFunction(undefined, fallback, {
        allowFallbackNonFunction: true
    });
    assert.equal(resolved, fallback);
});

test("resolveFunction throws for non-function fallback when not allowed", () => {
    assert.throws(
        () => resolveFunction(Symbol.for("candidate"), 123),
        TypeError
    );
});
