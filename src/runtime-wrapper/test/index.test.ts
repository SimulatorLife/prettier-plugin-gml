import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeWrapper } from "../index.js";

test("createRuntimeWrapper returns hot wrapper state", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.ok(wrapper.state);
    assert.strictEqual(typeof wrapper.applyPatch, "function");
    assert.strictEqual(typeof wrapper.undo, "function");
});

test("applyPatch validates its input", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch(null), { name: "TypeError" });
});

test("applyPatch requires kind field", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ id: "test" }), {
        message: /Patch must have a 'kind' field/
    });
});

test("applyPatch requires id field", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "script" }), {
        message: /Patch must have an 'id' field/
    });
});

test("applyPatch handles script patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const patch = {
        kind: "script",
        id: "script:test_func",
        js_body: "return args[0] + args[1];"
    };

    const result = wrapper.applyPatch(patch);
    assert.ok(result.success);
    assert.strictEqual(result.version, 1);
    assert.strictEqual(wrapper.getVersion(), 1);
    assert.ok(wrapper.hasScript("script:test_func"));
});

test("script patch function executes correctly", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const patch = {
        kind: "script",
        id: "script:add",
        js_body: "return args[0] + args[1];"
    };

    wrapper.applyPatch(patch);
    const fn = wrapper.getScript("script:add");
    assert.ok(fn);
    const result = fn(null, null, [5, 3]) as number;
    assert.strictEqual(result, 8);
});

test("applyPatch handles event patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const patch = {
        kind: "event",
        id: "obj_player#Step",
        js_body: "return this.x + 1;"
    };

    const result = wrapper.applyPatch(patch);
    assert.ok(result.success);
    assert.strictEqual(result.version, 1);
    assert.ok(wrapper.hasEvent("obj_player#Step"));
});

test("event patch function executes correctly", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const patch = {
        kind: "event",
        id: "obj_test#Create",
        js_body: "this.initialized = true; return true;"
    };

    wrapper.applyPatch(patch);
    const fn = wrapper.getEvent("obj_test#Create");
    assert.ok(fn);
    const context = { initialized: false };
    const result = fn.call(context);
    assert.strictEqual(result, true);
    assert.strictEqual(context.initialized, true);
});

test("event patch receives instance context and arguments", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const patch = {
        kind: "event",
        id: "obj_test#Async",
        this_name: "self",
        js_args: "eventData",
        js_body:
            "self.touched = eventData.value; return `${self.name}:${eventData.value}`;"
    };

    wrapper.applyPatch(patch);
    const fn = wrapper.getEvent("obj_test#Async");
    assert.ok(fn);
    const context = { name: "player", touched: null };
    const result = fn.call(context, { value: 99 });

    assert.strictEqual(result, "player:99");
    assert.strictEqual(context.touched, 99);
});

test("applyPatch rejects unsupported patch kinds", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "unknown", id: "test" }), {
        message: /Unsupported patch kind: unknown/
    });
});

test("applyPatch requires js_body for script patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "script", id: "test" }), {
        message: /Script patch must have a 'js_body' string/
    });
});

test("applyPatch requires js_body for event patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "event", id: "test" }), {
        message: /Event patch must have a 'js_body' string/
    });
});

test("applyPatch increments version on each patch", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.strictEqual(wrapper.getVersion(), 0);

    wrapper.applyPatch({
        kind: "script",
        id: "script:a",
        js_body: "return 1;"
    });
    assert.strictEqual(wrapper.getVersion(), 1);

    wrapper.applyPatch({
        kind: "script",
        id: "script:b",
        js_body: "return 2;"
    });
    assert.strictEqual(wrapper.getVersion(), 2);
});

test("applyPatch calls onPatchApplied callback", () => {
    let callbackPatch = null;
    let callbackVersion = null;

    const wrapper = RuntimeWrapper.createRuntimeWrapper({
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
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const patch = {
        kind: "script",
        id: "script:test",
        js_body: "return 1;"
    };

    wrapper.applyPatch(patch);
    assert.ok(wrapper.hasScript("script:test"));

    const result = wrapper.undo();
    assert.ok(result.success);
    assert.ok(!wrapper.hasScript("script:test"));
});

test("undo handles multiple patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

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

    assert.ok(wrapper.hasScript("script:a"));
    assert.ok(wrapper.hasScript("script:b"));

    wrapper.undo();
    assert.ok(wrapper.hasScript("script:a"));
    assert.ok(!wrapper.hasScript("script:b"));

    wrapper.undo();
    assert.ok(!wrapper.hasScript("script:a"));
});

test("undo fails when nothing to undo", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const result = wrapper.undo();
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes("Nothing to undo"));
});

test("undo restores previous version of patched script", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:test",
        js_body: "return 1;"
    });

    const fn1 = wrapper.getScript("script:test");
    assert.ok(fn1);
    assert.strictEqual(fn1(null, null, []) as number, 1);

    wrapper.applyPatch({
        kind: "script",
        id: "script:test",
        js_body: "return 2;"
    });

    const fn2 = wrapper.getScript("script:test");
    assert.ok(fn2);
    assert.strictEqual(fn2(null, null, []) as number, 2);

    wrapper.undo();
    const fn3 = wrapper.getScript("script:test");
    assert.ok(fn3);
    assert.strictEqual(fn3(null, null, []) as number, 1);
    assert.strictEqual(fn3, fn1);
});

test("getPatchHistory returns diagnostic information", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.strictEqual(typeof wrapper.getPatchHistory, "function");

    const history = wrapper.getPatchHistory();
    assert.ok(Array.isArray(history));
    assert.strictEqual(history.length, 0);
});

test("getPatchHistory tracks applied patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

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
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

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
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

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
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.strictEqual(typeof wrapper.getRegistrySnapshot, "function");

    const snapshot = wrapper.getRegistrySnapshot();
    assert.strictEqual(typeof snapshot, "object");
    assert.strictEqual(snapshot.version, 0);
    assert.strictEqual(snapshot.scriptCount, 0);
    assert.strictEqual(snapshot.eventCount, 0);
    assert.strictEqual(snapshot.closureCount, 0);
});

test("getRegistrySnapshot reflects current registry state", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

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
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.strictEqual(typeof wrapper.getPatchStats, "function");

    const stats = wrapper.getPatchStats();
    assert.strictEqual(typeof stats, "object");
    assert.strictEqual(stats.totalPatches, 0);
    assert.strictEqual(stats.appliedPatches, 0);
    assert.strictEqual(stats.undonePatches, 0);
});

test("getPatchStats calculates statistics correctly", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

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
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

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

test("trySafeApply validates patch in shadow registry", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.strictEqual(typeof wrapper.trySafeApply, "function");

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: "return args[0] * 2;"
    };

    const result = wrapper.trySafeApply(patch);
    assert.ok(result.success);
    assert.strictEqual(result.version, 1);
    assert.strictEqual(result.rolledBack, false);
});

test("trySafeApply rejects invalid patch in shadow validation", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: ""
    };

    const result = wrapper.trySafeApply(patch);
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.message.includes("Shadow validation failed"));
});

test("trySafeApply applies valid patch to actual registry", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const patch = {
        kind: "script",
        id: "script:multiply",
        js_body: "return args[0] * args[1];"
    };

    const result = wrapper.trySafeApply(patch);
    assert.ok(result.success);

    const fn = wrapper.getScript("script:multiply");
    assert.ok(fn);
    assert.strictEqual(fn(null, null, [3, 4]) as number, 12);
});

test("trySafeApply supports custom validation callback", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: "return 1;"
    };

    const onValidate = (p) => {
        return p.id !== "script:forbidden";
    };

    const result = wrapper.trySafeApply(patch, onValidate);
    assert.ok(result.success);
});

test("trySafeApply rejects patch when custom validation fails", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const patch = {
        kind: "script",
        id: "script:forbidden",
        js_body: "return 1;"
    };

    const onValidate = (p) => {
        return p.id !== "script:forbidden";
    };

    const result = wrapper.trySafeApply(patch, onValidate);
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes("Custom validation"));
    assert.ok(!wrapper.hasScript("script:forbidden"));
});

test("trySafeApply handles custom validation errors", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: "return 1;"
    };

    const onValidate = () => {
        throw new Error("Validation error");
    };

    const result = wrapper.trySafeApply(patch, onValidate);
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes("Custom validation failed"));
    assert.strictEqual(result.error, "Validation error");
});

test("trySafeApply catches syntax errors in shadow validation", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:existing",
        js_body: "return 1;"
    });

    const initialVersion = wrapper.getVersion();

    const badPatch = {
        kind: "script",
        id: "script:bad",
        js_body: "return {{{{{ invalid syntax"
    };

    const result = wrapper.trySafeApply(badPatch);
    assert.strictEqual(result.success, false);
    assert.ok(result.error);
    assert.ok(result.message.includes("Shadow validation failed"));
    assert.ok(!wrapper.hasScript("script:bad"));
    assert.ok(wrapper.hasScript("script:existing"));
    assert.strictEqual(wrapper.getVersion(), initialVersion);
});

test("trySafeApply does not record shadow validation failures in history", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const badPatch = {
        kind: "script",
        id: "script:bad",
        js_body: "return }}} invalid"
    };

    wrapper.trySafeApply(badPatch);

    const history = wrapper.getPatchHistory();
    assert.strictEqual(history.length, 0);
});

test("validateBeforeApply option enables shadow validation", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper({ validateBeforeApply: true });

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: "return args[0] + 1;"
    };

    const result = wrapper.applyPatch(patch);
    assert.ok(result.success);
    assert.ok(wrapper.hasScript("script:test"));
});

test("validateBeforeApply rejects invalid patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper({ validateBeforeApply: true });

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: ""
    };

    assert.throws(() => wrapper.applyPatch(patch), {
        message: /Patch validation failed/
    });
});

test("trySafeApply maintains registry state after rollback", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

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

    const beforeSnapshot = wrapper.getRegistrySnapshot();

    const badPatch = {
        kind: "script",
        id: "script:bad",
        js_body: "return syntax error;"
    };

    wrapper.trySafeApply(badPatch);

    const afterSnapshot = wrapper.getRegistrySnapshot();

    assert.strictEqual(afterSnapshot.scriptCount, beforeSnapshot.scriptCount);
    assert.strictEqual(afterSnapshot.eventCount, beforeSnapshot.eventCount);
    assert.strictEqual(afterSnapshot.version, beforeSnapshot.version);
});

test("trySafeApply catches event syntax errors in shadow validation", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "event",
        id: "obj_player#Step",
        js_body: "this.x += 1;"
    });

    const badEventPatch = {
        kind: "event",
        id: "obj_enemy#Step",
        js_body: "return {{ invalid"
    };

    const result = wrapper.trySafeApply(badEventPatch);
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes("Shadow validation failed"));
    assert.ok(!wrapper.hasEvent("obj_enemy#Step"));
    assert.ok(wrapper.hasEvent("obj_player#Step"));
});

test("applyPatch handles closure patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const patch = {
        kind: "closure",
        id: "closure:make_counter",
        js_body: "let count = 0; return () => ++count;"
    };

    const result = wrapper.applyPatch(patch);
    assert.ok(result.success);
    assert.strictEqual(result.version, 1);
    assert.strictEqual(wrapper.getVersion(), 1);
    assert.ok(wrapper.hasClosure("closure:make_counter"));
});

test("closure patch function executes correctly", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const patch = {
        kind: "closure",
        id: "closure:multiplier",
        js_body: "const factor = args[0]; return (x) => x * factor;"
    };

    wrapper.applyPatch(patch);
    const fn = wrapper.getClosure("closure:multiplier");
    assert.ok(fn);
    const multiply = fn(5) as (value: number) => number;
    assert.strictEqual(multiply(3), 15);
    assert.strictEqual(multiply(7), 35);
});

test("applyPatch requires js_body for closure patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "closure", id: "test" }), {
        message: /Closure patch must have a 'js_body' string/
    });
});

test("undo reverts closure patch", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const patch = {
        kind: "closure",
        id: "closure:test",
        js_body: "return () => 42;"
    };

    wrapper.applyPatch(patch);
    assert.ok(wrapper.hasClosure("closure:test"));

    const result = wrapper.undo();
    assert.ok(result.success);
    assert.ok(!wrapper.hasClosure("closure:test"));
});

test("undo restores previous version of patched closure", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "closure",
        id: "closure:test",
        js_body: "return () => 1;"
    });

    const fn1 = wrapper.getClosure("closure:test");
    assert.ok(fn1);
    const firstClosure = fn1() as () => number;
    assert.strictEqual(firstClosure(), 1);

    wrapper.applyPatch({
        kind: "closure",
        id: "closure:test",
        js_body: "return () => 2;"
    });

    const fn2 = wrapper.getClosure("closure:test");
    assert.ok(fn2);
    const secondClosure = fn2() as () => number;
    assert.strictEqual(secondClosure(), 2);

    wrapper.undo();
    const fn3 = wrapper.getClosure("closure:test");
    assert.ok(fn3);
    const restoredClosure = fn3() as () => number;
    assert.strictEqual(restoredClosure(), 1);
    assert.strictEqual(fn3, fn1);
});

test("getPatchHistory tracks closure patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "closure",
        id: "closure:test",
        js_body: "return () => 1;"
    });

    const history = wrapper.getPatchHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].patch.kind, "closure");
    assert.strictEqual(history[0].patch.id, "closure:test");
    assert.strictEqual(history[0].version, 1);
    assert.strictEqual(history[0].action, "apply");
});

test("getRegistrySnapshot includes closure count", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:a",
        js_body: "return 1;"
    });

    wrapper.applyPatch({
        kind: "closure",
        id: "closure:b",
        js_body: "return () => 2;"
    });

    const snapshot = wrapper.getRegistrySnapshot();
    assert.strictEqual(snapshot.version, 2);
    assert.strictEqual(snapshot.scriptCount, 1);
    assert.strictEqual(snapshot.closureCount, 1);
    assert.ok(snapshot.scripts.includes("script:a"));
    assert.ok(snapshot.closures.includes("closure:b"));
});

test("getPatchStats tracks closure patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:a",
        js_body: "return 1;"
    });

    wrapper.applyPatch({
        kind: "closure",
        id: "closure:b",
        js_body: "return () => 2;"
    });

    wrapper.applyPatch({
        kind: "closure",
        id: "closure:c",
        js_body: "return () => 3;"
    });

    const stats = wrapper.getPatchStats();
    assert.strictEqual(stats.totalPatches, 3);
    assert.strictEqual(stats.scriptPatches, 1);
    assert.strictEqual(stats.closurePatches, 2);
    assert.strictEqual(stats.uniqueIds, 3);
});

test("trySafeApply validates closure patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const patch = {
        kind: "closure",
        id: "closure:test",
        js_body: "return (x) => x * 2;"
    };

    const result = wrapper.trySafeApply(patch);
    assert.ok(result.success);
    assert.strictEqual(result.version, 1);
    assert.strictEqual(result.rolledBack, false);

    const fn = wrapper.getClosure("closure:test");
    assert.ok(fn);
    const closure = fn() as (value: number) => number;
    assert.strictEqual(closure(5), 10);
});

test("trySafeApply catches closure syntax errors", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const badPatch = {
        kind: "closure",
        id: "closure:bad",
        js_body: "return {{ invalid syntax"
    };

    const result = wrapper.trySafeApply(badPatch);
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes("Shadow validation failed"));
    assert.ok(!wrapper.hasClosure("closure:bad"));
});

test("validateBeforeApply validates closure patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper({ validateBeforeApply: true });

    const patch = {
        kind: "closure",
        id: "closure:test",
        js_body: "return () => 42;"
    };

    const result = wrapper.applyPatch(patch);
    assert.ok(result.success);
    assert.ok(wrapper.hasClosure("closure:test"));
});

test("validateBeforeApply rejects invalid closure patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper({ validateBeforeApply: true });

    const patch = {
        kind: "closure",
        id: "closure:test",
        js_body: ""
    };

    assert.throws(() => wrapper.applyPatch(patch), {
        message: /Patch validation failed/
    });
});
