import assert from "node:assert/strict";
import { test } from "node:test";

import {
    collectPrototypeMethodNames,
    collectVisitMethodNames,
    createWrapperSymbols,
    definePrototypeMethods,
    deriveListenerMethodNames,
    ensureHasInstancePatched,
    toDelegate
} from "../src/runtime/parse-tree-helpers.js";

function WrapperBase() {}
WrapperBase.prototype = {};

const fallbackDelegate = () => "fallback";
const alternateDelegate = () => "other";

class SampleVisitor {
    visitProgram() {}
    visitChildren() {}
    visitTerminal() {}
    visitExpression() {}
}

SampleVisitor.prototype.helper = () => "value";

function createBaseCtor() {}

createBaseCtor.prototype = {
    constructor: createBaseCtor,
    custom() {
        return "base";
    }
};

test("collectVisitMethodNames filters generated visitor helpers", () => {
    assert.deepEqual(collectVisitMethodNames(SampleVisitor), [
        "visitProgram",
        "visitExpression"
    ]);
});

test("collectPrototypeMethodNames omits constructors", () => {
    const names = collectPrototypeMethodNames(createBaseCtor.prototype);
    assert.deepEqual(names, ["custom"]);
});

test("deriveListenerMethodNames transforms visit names", () => {
    assert.deepEqual(
        deriveListenerMethodNames(["visitProgram", "visitExpression"]),
        ["enterProgram", "exitProgram", "enterExpression", "exitExpression"]
    );
});

test("definePrototypeMethods attaches generated methods", () => {
    const target = {};
    definePrototypeMethods(target, ["alpha", "beta"], (name) => () => name);

    assert.equal(target.alpha(), "alpha");
    assert.equal(target.beta(), "beta");
});

test("createWrapperSymbols produces stable symbol keys", () => {
    const one = createWrapperSymbols("Example");
    const two = createWrapperSymbols("Example");

    assert.equal(one.instance, two.instance);
    assert.equal(one.patchFlag, two.patchFlag);
});

test("ensureHasInstancePatched recognises marker decorated instances", () => {
    const Base = WrapperBase;
    const { instance, patchFlag } = createWrapperSymbols("ExampleBase");
    ensureHasInstancePatched(Base, {
        markerSymbol: instance,
        patchFlagSymbol: patchFlag
    });

    const wrapper = { [instance]: true };

    assert.equal(wrapper instanceof Base, true);
    assert.equal(Base[patchFlag], true);
});

test("toDelegate returns fallback when the candidate is not callable", () => {
    assert.equal(toDelegate(null, fallbackDelegate), fallbackDelegate);
    assert.equal(
        toDelegate(fallbackDelegate, alternateDelegate),
        fallbackDelegate
    );
});
