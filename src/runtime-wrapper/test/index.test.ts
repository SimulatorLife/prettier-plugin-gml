import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeWrapper } from "../index.js";

void test("createRuntimeWrapper returns hot wrapper state", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.ok(wrapper.state);
    assert.strictEqual(typeof wrapper.applyPatch, "function");
    assert.strictEqual(typeof wrapper.undo, "function");
});

void test("applyPatch validates its input", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch(null), { name: "TypeError" });
});

void test("applyPatch requires kind field", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ id: "test" }), {
        message: /Patch must have a 'kind' field/
    });
});

void test("applyPatch requires id field", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "script" }), {
        message: /Patch must have an 'id' field/
    });
});

void test("applyPatch handles script patches", () => {
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

void test("script patch function executes correctly", () => {
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

void test("applyPatch handles event patches", () => {
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

void test("event patch function executes correctly", () => {
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

void test("event patch receives instance context and arguments", () => {
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

void test("applyPatch rejects unsupported patch kinds", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "unknown", id: "test" }), {
        message: /Unsupported patch kind: unknown/
    });
});

void test("applyPatch requires js_body for script patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "script", id: "test" }), {
        message: /Script patch must have a 'js_body' string/
    });
});

void test("applyPatch requires js_body for event patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "event", id: "test" }), {
        message: /Event patch must have a 'js_body' string/
    });
});

void test("applyPatch increments version on each patch", () => {
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

void test("applyPatch calls onPatchApplied callback", () => {
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

void test("undo reverts last patch", () => {
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

void test("undo handles multiple patches", () => {
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

void test("undo fails when nothing to undo", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const result = wrapper.undo();
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes("Nothing to undo"));
});

void test("undo restores previous version of patched script", () => {
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

void test("getPatchHistory returns diagnostic information", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.strictEqual(typeof wrapper.getPatchHistory, "function");

    const history = wrapper.getPatchHistory();
    assert.ok(Array.isArray(history));
    assert.strictEqual(history.length, 0);
});

void test("getPatchHistory tracks applied patches", () => {
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

void test("getPatchHistory tracks multiple patches in order", () => {
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

void test("getPatchHistory tracks undo operations", () => {
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

void test("getRegistrySnapshot returns diagnostic information", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.strictEqual(typeof wrapper.getRegistrySnapshot, "function");

    const snapshot = wrapper.getRegistrySnapshot();
    assert.strictEqual(typeof snapshot, "object");
    assert.strictEqual(snapshot.version, 0);
    assert.strictEqual(snapshot.scriptCount, 0);
    assert.strictEqual(snapshot.eventCount, 0);
    assert.strictEqual(snapshot.closureCount, 0);
});

void test("getRegistrySnapshot reflects current registry state", () => {
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

void test("getPatchStats returns diagnostic information", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.strictEqual(typeof wrapper.getPatchStats, "function");

    const stats = wrapper.getPatchStats();
    assert.strictEqual(typeof stats, "object");
    assert.strictEqual(stats.totalPatches, 0);
    assert.strictEqual(stats.appliedPatches, 0);
    assert.strictEqual(stats.undonePatches, 0);
    assert.strictEqual(stats.rolledBackPatches, 0);
});

void test("getPatchStats calculates statistics correctly", () => {
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
    assert.strictEqual(stats.rolledBackPatches, 0);
    assert.strictEqual(stats.scriptPatches, 2);
    assert.strictEqual(stats.eventPatches, 2);
    assert.strictEqual(stats.uniqueIds, 3);
});

void test("getPatchStats tracks unique patch IDs correctly", () => {
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

void test("getPatchStats counts rollback operations", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper({
        onPatchApplied: () => {
            throw new Error("post-apply failure");
        }
    });

    const patch = {
        kind: "script",
        id: "script:rollback",
        js_body: "return 1;"
    };

    const result = wrapper.trySafeApply(patch);
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.rolledBack, true);
    assert.ok(result.message?.includes("rolled back"));
    assert.strictEqual(wrapper.hasScript("script:rollback"), false);
    assert.strictEqual(wrapper.getVersion(), 0);

    const stats = wrapper.getPatchStats();
    assert.strictEqual(stats.totalPatches, 2);
    assert.strictEqual(stats.appliedPatches, 1);
    assert.strictEqual(stats.rolledBackPatches, 1);
    assert.strictEqual(stats.scriptPatches, 2);
});

void test("trySafeApply validates patch in shadow registry", () => {
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

void test("trySafeApply rejects invalid patch in shadow validation", () => {
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

void test("trySafeApply applies valid patch to actual registry", () => {
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

void test("trySafeApply supports custom validation callback", () => {
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

void test("trySafeApply rejects patch when custom validation fails", () => {
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

void test("trySafeApply handles custom validation errors", () => {
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

void test("trySafeApply catches syntax errors in shadow validation", () => {
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

void test("trySafeApply does not record shadow validation failures in history", () => {
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

void test("validateBeforeApply option enables shadow validation", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper({
        validateBeforeApply: true
    });

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: "return args[0] + 1;"
    };

    const result = wrapper.applyPatch(patch);
    assert.ok(result.success);
    assert.ok(wrapper.hasScript("script:test"));
});

void test("validateBeforeApply rejects invalid patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper({
        validateBeforeApply: true
    });

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: ""
    };

    assert.throws(() => wrapper.applyPatch(patch), {
        message: /Patch validation failed/
    });
});

void test("trySafeApply maintains registry state after rollback", () => {
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

void test("trySafeApply catches event syntax errors in shadow validation", () => {
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

void test("applyPatch handles closure patches", () => {
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

void test("closure patch function executes correctly", () => {
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

void test("applyPatch requires js_body for closure patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    assert.throws(() => wrapper.applyPatch({ kind: "closure", id: "test" }), {
        message: /Closure patch must have a 'js_body' string/
    });
});

void test("undo reverts closure patch", () => {
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

void test("undo restores previous version of patched closure", () => {
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

void test("getPatchHistory tracks closure patches", () => {
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

void test("getRegistrySnapshot includes closure count", () => {
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

void test("getPatchStats tracks closure patches", () => {
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

void test("trySafeApply validates closure patches", () => {
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

void test("trySafeApply catches closure syntax errors", () => {
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

void test("validateBeforeApply validates closure patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper({
        validateBeforeApply: true
    });

    const patch = {
        kind: "closure",
        id: "closure:test",
        js_body: "return () => 42;"
    };

    const result = wrapper.applyPatch(patch);
    assert.ok(result.success);
    assert.ok(wrapper.hasClosure("closure:test"));
});

void test("validateBeforeApply rejects invalid closure patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper({
        validateBeforeApply: true
    });

    const patch = {
        kind: "closure",
        id: "closure:test",
        js_body: ""
    };

    assert.throws(() => wrapper.applyPatch(patch), {
        message: /Patch validation failed/
    });
});

void test("getPatchHistory includes duration for patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:timed",
        js_body: "return 42;"
    });

    const history = wrapper.getPatchHistory();
    assert.strictEqual(history.length, 1);
    assert.ok(history[0].durationMs !== undefined);
    assert.ok(typeof history[0].durationMs === "number");
    assert.ok(history[0].durationMs >= 0);
});

void test("getPatchStats includes timing metrics", () => {
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

    const stats = wrapper.getPatchStats();
    assert.ok(stats.totalDurationMs !== undefined);
    assert.ok(stats.averagePatchDurationMs !== undefined);
    assert.ok(stats.fastestPatchMs !== undefined);
    assert.ok(stats.slowestPatchMs !== undefined);
    assert.ok(stats.totalDurationMs >= 0);
    assert.ok(stats.averagePatchDurationMs >= 0);
    assert.ok(stats.fastestPatchMs >= 0);
    assert.ok(stats.slowestPatchMs >= 0);
    assert.ok(stats.fastestPatchMs <= stats.slowestPatchMs);
});

void test("clearRegistry removes all patches", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:test1",
        js_body: "return 1;"
    });

    wrapper.applyPatch({
        kind: "event",
        id: "obj_test#Create",
        js_body: "this.x = 0;"
    });

    wrapper.applyPatch({
        kind: "closure",
        id: "closure:test",
        js_body: "return () => 42;"
    });

    assert.ok(wrapper.hasScript("script:test1"));
    assert.ok(wrapper.hasEvent("obj_test#Create"));
    assert.ok(wrapper.hasClosure("closure:test"));

    const versionBeforeClear = wrapper.getVersion();
    wrapper.clearRegistry();

    assert.ok(!wrapper.hasScript("script:test1"));
    assert.ok(!wrapper.hasEvent("obj_test#Create"));
    assert.ok(!wrapper.hasClosure("closure:test"));
    assert.strictEqual(wrapper.getVersion(), versionBeforeClear + 1);

    const snapshot = wrapper.getRegistrySnapshot();
    assert.strictEqual(snapshot.scriptCount, 0);
    assert.strictEqual(snapshot.eventCount, 0);
    assert.strictEqual(snapshot.closureCount, 0);
});

void test("clearRegistry clears undo stack", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:test",
        js_body: "return 1;"
    });

    wrapper.clearRegistry();

    const undoResult = wrapper.undo();
    assert.strictEqual(undoResult.success, false);
    assert.strictEqual(undoResult.message, "Nothing to undo");
});

void test("applyPatchBatch applies multiple patches atomically", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const patches = [
        { kind: "script", id: "script:batch1", js_body: "return 1;" },
        { kind: "script", id: "script:batch2", js_body: "return 2;" },
        { kind: "event", id: "obj_test#Create", js_body: "this.x = 0;" }
    ];

    const result = wrapper.applyPatchBatch(patches);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.appliedCount, 3);
    assert.strictEqual(result.rolledBack, false);
    assert.ok(wrapper.hasScript("script:batch1"));
    assert.ok(wrapper.hasScript("script:batch2"));
    assert.ok(wrapper.hasEvent("obj_test#Create"));
});

void test("applyPatchBatch handles empty array", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const initialVersion = wrapper.getVersion();

    const result = wrapper.applyPatchBatch([]);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.appliedCount, 0);
    assert.strictEqual(result.rolledBack, false);
    assert.strictEqual(result.version, initialVersion);
});

void test("applyPatchBatch validates input is array", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    assert.throws(
        () => wrapper.applyPatchBatch(null as unknown as Array<unknown>),
        { message: /applyPatchBatch expects an array/ }
    );
});

void test("applyPatchBatch rolls back on failure", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const patches = [
        { kind: "script", id: "script:good1", js_body: "return 1;" },
        { kind: "script", id: "script:good2", js_body: "return 2;" },
        { kind: "script", id: "script:bad", js_body: "return {{ invalid" }
    ];

    const result = wrapper.applyPatchBatch(patches);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.rolledBack, true);
    assert.strictEqual(result.failedIndex, 2);
    assert.ok(!wrapper.hasScript("script:good1"));
    assert.ok(!wrapper.hasScript("script:good2"));
    assert.ok(!wrapper.hasScript("script:bad"));
});

void test("applyPatchBatch validates all patches before applying", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper({
        validateBeforeApply: true
    });

    const patches = [
        { kind: "script", id: "script:first", js_body: "return 1;" },
        { kind: "script", id: "script:bad", js_body: "return {{ invalid" },
        { kind: "script", id: "script:third", js_body: "return 3;" }
    ];

    const result = wrapper.applyPatchBatch(patches);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.rolledBack, false);
    assert.strictEqual(result.appliedCount, 0);
    assert.strictEqual(result.failedIndex, 1);
    assert.ok(!wrapper.hasScript("script:first"));
    assert.ok(!wrapper.hasScript("script:third"));
});

void test("applyPatchBatch increments version correctly", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const initialVersion = wrapper.getVersion();

    const patches = [
        { kind: "script", id: "script:v1", js_body: "return 1;" },
        { kind: "script", id: "script:v2", js_body: "return 2;" }
    ];

    const result = wrapper.applyPatchBatch(patches);

    assert.strictEqual(result.success, true);
    assert.strictEqual(wrapper.getVersion(), initialVersion + 2);
});

void test("applyPatchBatch calls onPatchApplied for each patch", () => {
    const appliedPatches: Array<{ id: string; version: number }> = [];

    const wrapper = RuntimeWrapper.createRuntimeWrapper({
        onPatchApplied: (patch, version) => {
            appliedPatches.push({ id: patch.id, version });
        }
    });

    const patches = [
        { kind: "script", id: "script:cb1", js_body: "return 1;" },
        { kind: "script", id: "script:cb2", js_body: "return 2;" }
    ];

    wrapper.applyPatchBatch(patches);

    assert.strictEqual(appliedPatches.length, 2);
    assert.strictEqual(appliedPatches[0].id, "script:cb1");
    assert.strictEqual(appliedPatches[1].id, "script:cb2");
});

void test("applyPatchBatch records batch operation in history", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const patches = [
        { kind: "script", id: "script:h1", js_body: "return 1;" },
        { kind: "script", id: "script:h2", js_body: "return 2;" }
    ];

    wrapper.applyPatchBatch(patches);

    const history = wrapper.getPatchHistory();
    assert.strictEqual(history.length, 3);
    assert.strictEqual(history[0].patch.id, "script:h1");
    assert.strictEqual(history[1].patch.id, "script:h2");
    assert.strictEqual(history[2].patch.id, "batch:2_patches");
    assert.ok(history[2].durationMs !== undefined);
});

void test("applyPatchBatch supports mixed patch types", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const patches = [
        { kind: "script", id: "script:mixed", js_body: "return 1;" },
        { kind: "event", id: "obj_mixed#Step", js_body: "this.x++;" },
        { kind: "closure", id: "closure:mixed", js_body: "return () => 42;" }
    ];

    const result = wrapper.applyPatchBatch(patches);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.appliedCount, 3);
    assert.ok(wrapper.hasScript("script:mixed"));
    assert.ok(wrapper.hasEvent("obj_mixed#Step"));
    assert.ok(wrapper.hasClosure("closure:mixed"));
});

void test("applyPatchBatch maintains undo stack integrity on success", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    const patches = [
        { kind: "script", id: "script:undo1", js_body: "return 1;" },
        { kind: "script", id: "script:undo2", js_body: "return 2;" }
    ];

    wrapper.applyPatchBatch(patches);

    assert.ok(wrapper.hasScript("script:undo1"));
    assert.ok(wrapper.hasScript("script:undo2"));

    wrapper.undo();
    assert.ok(!wrapper.hasScript("script:undo2"));
    assert.ok(wrapper.hasScript("script:undo1"));

    wrapper.undo();
    assert.ok(!wrapper.hasScript("script:undo1"));
});

void test("applyPatchBatch clears undo stack on rollback", () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:before_batch",
        js_body: "return 0;"
    });

    const patches = [
        { kind: "script", id: "script:batch_fail1", js_body: "return 1;" },
        { kind: "script", id: "script:batch_fail2", js_body: "return {{ bad" }
    ];

    const result = wrapper.applyPatchBatch(patches);

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.rolledBack, true);
    assert.ok(wrapper.hasScript("script:before_batch"));
    assert.ok(!wrapper.hasScript("script:batch_fail1"));
});
