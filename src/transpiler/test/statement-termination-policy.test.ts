import assert from "node:assert/strict";
import test from "node:test";

import {
    ensureStatementTerminated,
    evaluateStatementTerminationPolicy
} from "../src/emitter/statement-termination-policy.js";

void test("append terminator for unterminated expression statements", () => {
    const evaluation = evaluateStatementTerminationPolicy("foo(bar)");
    assert.equal(evaluation.shouldAppendTerminator, true);
});

void test("respect existing statement terminators", () => {
    const evaluation = evaluateStatementTerminationPolicy("foo();");
    assert.equal(evaluation.shouldAppendTerminator, false);
});

void test("skip terminator for control flow prefixes", () => {
    const evaluation = evaluateStatementTerminationPolicy("    if (ready) { doThing(); }");
    assert.equal(evaluation.shouldAppendTerminator, false);
});

void test("leave empty output untouched", () => {
    const evaluation = evaluateStatementTerminationPolicy("");
    assert.equal(evaluation.shouldAppendTerminator, false);
});

void test("append semicolon when policy requires terminator", () => {
    assert.equal(ensureStatementTerminated("foo(bar)"), "foo(bar);");
});

void test("keep existing terminators unchanged", () => {
    assert.equal(ensureStatementTerminated("foo();"), "foo();");
    assert.equal(ensureStatementTerminated("if (ready) { doThing(); }"), "if (ready) { doThing(); }");
    assert.equal(ensureStatementTerminated("{\n  doThing();\n}"), "{\n  doThing();\n}");
});
