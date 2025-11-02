import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWrapper } from "../src/index.js";

test("createRuntimeWrapper returns hot wrapper state", () => {
    const wrapper = createRuntimeWrapper();
    assert.ok(wrapper.state);
    assert.strictEqual(typeof wrapper.applyPatch, "function");
});

test("applyPatch validates its input", () => {
    const wrapper = createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch(null), { name: "TypeError" });
});

test("applyPatch currently reports missing implementation", () => {
    const wrapper = createRuntimeWrapper();
    assert.throws(
        () => wrapper.applyPatch({ kind: "script", id: "gml/script/foo" }),
        { message: "applyPatch is not implemented yet" }
    );
});
