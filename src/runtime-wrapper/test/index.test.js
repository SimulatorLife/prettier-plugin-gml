import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWrapper } from "../src/index.js";

test("createRuntimeWrapper returns hot wrapper state", () => {
    const wrapper = createRuntimeWrapper();
    assert.ok(wrapper.state);
    assert.strictEqual(typeof wrapper.applyPatch, "function");
    assert.strictEqual(typeof wrapper.undo, "function");
});

test("applyPatch validates its input", () => {
    const wrapper = createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch(null), { name: "TypeError" });
});

test("applyPatch requires kind field", () => {
    const wrapper = createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ id: "test" }), {
        message: /Patch must have a 'kind' field/
    });
});

test("applyPatch requires id field", () => {
    const wrapper = createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "script" }), {
        message: /Patch must have an 'id' field/
    });
});

test("applyPatch handles script patches", () => {
    const wrapper = createRuntimeWrapper();
    const patch = {
        kind: "script",
        id: "script:test_func",
        js_body: "return args[0] + args[1];"
    };

    const result = wrapper.applyPatch(patch);
    assert.ok(result.success);
    assert.strictEqual(result.version, 1);
    assert.strictEqual(wrapper.state.registry.version, 1);
    assert.ok(wrapper.state.registry.scripts["script:test_func"]);
});

test("script patch function executes correctly", () => {
    const wrapper = createRuntimeWrapper();
    const patch = {
        kind: "script",
        id: "script:add",
        js_body: "return args[0] + args[1];"
    };

    wrapper.applyPatch(patch);
    const fn = wrapper.state.registry.scripts["script:add"];
    const result = fn(null, null, [5, 3]);
    assert.strictEqual(result, 8);
});

test("applyPatch handles event patches", () => {
    const wrapper = createRuntimeWrapper();
    const patch = {
        kind: "event",
        id: "obj_player#Step",
        js_body: "return this.x + 1;"
    };

    const result = wrapper.applyPatch(patch);
    assert.ok(result.success);
    assert.strictEqual(result.version, 1);
    assert.ok(wrapper.state.registry.events["obj_player#Step"]);
});

test("event patch function executes correctly", () => {
    const wrapper = createRuntimeWrapper();
    const patch = {
        kind: "event",
        id: "obj_test#Create",
        js_body: "this.initialized = true; return true;"
    };

    wrapper.applyPatch(patch);
    const fn = wrapper.state.registry.events["obj_test#Create"];
    const context = { initialized: false };
    const result = fn.call(context);
    assert.strictEqual(result, true);
    assert.strictEqual(context.initialized, true);
});

test("applyPatch rejects unsupported patch kinds", () => {
    const wrapper = createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "unknown", id: "test" }), {
        message: /Unsupported patch kind: unknown/
    });
});

test("applyPatch requires js_body for script patches", () => {
    const wrapper = createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "script", id: "test" }), {
        message: /Script patch must have a 'js_body' string/
    });
});

test("applyPatch requires js_body for event patches", () => {
    const wrapper = createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "event", id: "test" }), {
        message: /Event patch must have a 'js_body' string/
    });
});

test("applyPatch increments version on each patch", () => {
    const wrapper = createRuntimeWrapper();
    assert.strictEqual(wrapper.state.registry.version, 0);

    wrapper.applyPatch({
        kind: "script",
        id: "script:a",
        js_body: "return 1;"
    });
    assert.strictEqual(wrapper.state.registry.version, 1);

    wrapper.applyPatch({
        kind: "script",
        id: "script:b",
        js_body: "return 2;"
    });
    assert.strictEqual(wrapper.state.registry.version, 2);
});

test("applyPatch calls onPatchApplied callback", () => {
    let callbackPatch = null;
    let callbackVersion = null;

    const wrapper = createRuntimeWrapper({
        onPatchApplied: (patch, version) => {
            callbackPatch = patch;
            callbackVersion = version;
        }
    });

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: "return 42;"
    };

    wrapper.applyPatch(patch);
    assert.strictEqual(callbackPatch, patch);
    assert.strictEqual(callbackVersion, 1);
});

test("undo reverts last patch", () => {
    const wrapper = createRuntimeWrapper();
    const patch = {
        kind: "script",
        id: "script:test",
        js_body: "return 1;"
    };

    wrapper.applyPatch(patch);
    assert.ok(wrapper.state.registry.scripts["script:test"]);

    const result = wrapper.undo();
    assert.ok(result.success);
    assert.ok(!wrapper.state.registry.scripts["script:test"]);
});

test("undo handles multiple patches", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:a",
        js_body: "return 1;"
    });

    wrapper.applyPatch({
        kind: "script",
        id: "script:b",
        js_body: "return 2;"
    });

    assert.ok(wrapper.state.registry.scripts["script:a"]);
    assert.ok(wrapper.state.registry.scripts["script:b"]);

    wrapper.undo();
    assert.ok(wrapper.state.registry.scripts["script:a"]);
    assert.ok(!wrapper.state.registry.scripts["script:b"]);

    wrapper.undo();
    assert.ok(!wrapper.state.registry.scripts["script:a"]);
});

test("undo fails when nothing to undo", () => {
    const wrapper = createRuntimeWrapper();
    const result = wrapper.undo();
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes("Nothing to undo"));
});

test("undo restores previous version of patched script", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:test",
        js_body: "return 1;"
    });

    const fn1 = wrapper.state.registry.scripts["script:test"];
    assert.strictEqual(fn1(null, null, []), 1);

    wrapper.applyPatch({
        kind: "script",
        id: "script:test",
        js_body: "return 2;"
    });

    const fn2 = wrapper.state.registry.scripts["script:test"];
    assert.strictEqual(fn2(null, null, []), 2);

    wrapper.undo();
    const fn3 = wrapper.state.registry.scripts["script:test"];
    assert.strictEqual(fn3(null, null, []), 1);
    assert.strictEqual(fn3, fn1);
});

test("getPatchHistory returns diagnostic information", () => {
    const wrapper = createRuntimeWrapper();
    assert.strictEqual(typeof wrapper.getPatchHistory, "function");

    const history = wrapper.getPatchHistory();
    assert.ok(Array.isArray(history));
    assert.strictEqual(history.length, 0);
});

test("getPatchHistory tracks applied patches", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:test",
        js_body: "return 1;"
    });

    const history = wrapper.getPatchHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].patch.kind, "script");
    assert.strictEqual(history[0].patch.id, "script:test");
    assert.strictEqual(history[0].version, 1);
    assert.strictEqual(history[0].action, "apply");
    assert.ok(typeof history[0].timestamp === "number");
});

test("getPatchHistory tracks multiple patches in order", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:a",
        js_body: "return 1;"
    });

    wrapper.applyPatch({
        kind: "event",
        id: "obj_test#Create",
        js_body: "this.x = 0;"
    });

    const history = wrapper.getPatchHistory();
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].patch.id, "script:a");
    assert.strictEqual(history[1].patch.id, "obj_test#Create");
    assert.ok(history[0].timestamp <= history[1].timestamp);
});

test("getPatchHistory tracks undo operations", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:test",
        js_body: "return 1;"
    });

    wrapper.undo();

    const history = wrapper.getPatchHistory();
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].action, "apply");
    assert.strictEqual(history[1].action, "undo");
    assert.strictEqual(history[1].patch.id, "script:test");
});

test("getRegistrySnapshot returns diagnostic information", () => {
    const wrapper = createRuntimeWrapper();
    assert.strictEqual(typeof wrapper.getRegistrySnapshot, "function");

    const snapshot = wrapper.getRegistrySnapshot();
    assert.strictEqual(typeof snapshot, "object");
    assert.strictEqual(snapshot.version, 0);
    assert.strictEqual(snapshot.scriptCount, 0);
    assert.strictEqual(snapshot.eventCount, 0);
    assert.strictEqual(snapshot.closureCount, 0);
});

test("getRegistrySnapshot reflects current registry state", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:a",
        js_body: "return 1;"
    });

    wrapper.applyPatch({
        kind: "script",
        id: "script:b",
        js_body: "return 2;"
    });

    wrapper.applyPatch({
        kind: "event",
        id: "obj_test#Create",
        js_body: "this.x = 0;"
    });

    const snapshot = wrapper.getRegistrySnapshot();
    assert.strictEqual(snapshot.version, 3);
    assert.strictEqual(snapshot.scriptCount, 2);
    assert.strictEqual(snapshot.eventCount, 1);
    assert.ok(snapshot.scripts.includes("script:a"));
    assert.ok(snapshot.scripts.includes("script:b"));
    assert.ok(snapshot.events.includes("obj_test#Create"));
});

test("getPatchStats returns diagnostic information", () => {
    const wrapper = createRuntimeWrapper();
    assert.strictEqual(typeof wrapper.getPatchStats, "function");

    const stats = wrapper.getPatchStats();
    assert.strictEqual(typeof stats, "object");
    assert.strictEqual(stats.totalPatches, 0);
    assert.strictEqual(stats.appliedPatches, 0);
    assert.strictEqual(stats.undonePatches, 0);
});

test("getPatchStats calculates statistics correctly", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:a",
        js_body: "return 1;"
    });

    wrapper.applyPatch({
        kind: "script",
        id: "script:b",
        js_body: "return 2;"
    });

    wrapper.applyPatch({
        kind: "event",
        id: "obj_test#Create",
        js_body: "this.x = 0;"
    });

    wrapper.undo();

    const stats = wrapper.getPatchStats();
    assert.strictEqual(stats.totalPatches, 4);
    assert.strictEqual(stats.appliedPatches, 3);
    assert.strictEqual(stats.undonePatches, 1);
    assert.strictEqual(stats.scriptPatches, 2);
    assert.strictEqual(stats.eventPatches, 2);
    assert.strictEqual(stats.uniqueIds, 3);
});

test("getPatchStats tracks unique patch IDs correctly", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:test",
        js_body: "return 1;"
    });

    wrapper.applyPatch({
        kind: "script",
        id: "script:test",
        js_body: "return 2;"
    });

    const stats = wrapper.getPatchStats();
    assert.strictEqual(stats.totalPatches, 2);
    assert.strictEqual(stats.uniqueIds, 1);
});
