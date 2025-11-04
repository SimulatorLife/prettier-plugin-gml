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

test("getDiagnostics returns current state metrics", () => {
    const wrapper = createRuntimeWrapper();

    const initialDiag = wrapper.getDiagnostics();
    assert.strictEqual(initialDiag.version, 0);
    assert.strictEqual(initialDiag.registeredScripts, 0);
    assert.strictEqual(initialDiag.registeredEvents, 0);
    assert.strictEqual(initialDiag.totalPatchesApplied, 0);

    wrapper.applyPatch({
        kind: "script",
        id: "script:a",
        js_body: "return 1;"
    });

    wrapper.applyPatch({
        kind: "event",
        id: "obj_test#Step",
        js_body: "return 2;"
    });

    const diag = wrapper.getDiagnostics();
    assert.strictEqual(diag.version, 2);
    assert.strictEqual(diag.registeredScripts, 1);
    assert.strictEqual(diag.registeredEvents, 1);
    assert.strictEqual(diag.totalPatchesApplied, 2);
    assert.strictEqual(diag.successfulPatches, 2);
    assert.strictEqual(diag.failedPatches, 0);
});

test("getDiagnostics tracks failed patches", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:good",
        js_body: "return 1;"
    });

    try {
        wrapper.applyPatch({
            kind: "script",
            id: "script:bad"
        });
    } catch {
        // Expected to fail, patch history should track the failure
    }

    const diag = wrapper.getDiagnostics();
    assert.strictEqual(diag.totalPatchesApplied, 2);
    assert.strictEqual(diag.successfulPatches, 1);
    assert.strictEqual(diag.failedPatches, 1);
});

test("getPatchHistory returns patch application history", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:a",
        js_body: "return 1;"
    });

    wrapper.applyPatch({
        kind: "event",
        id: "obj_test#Create",
        js_body: "return 2;"
    });

    const history = wrapper.getPatchHistory();
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].patch.kind, "script");
    assert.strictEqual(history[0].patch.id, "script:a");
    assert.strictEqual(history[0].success, true);
    assert.strictEqual(history[1].patch.kind, "event");
    assert.strictEqual(history[1].patch.id, "obj_test#Create");
    assert.strictEqual(history[1].success, true);
});

test("getPatchHistory includes timestamps", () => {
    const wrapper = createRuntimeWrapper();
    const before = Date.now();

    wrapper.applyPatch({
        kind: "script",
        id: "script:test",
        js_body: "return 1;"
    });

    const after = Date.now();
    const history = wrapper.getPatchHistory();

    assert.strictEqual(history.length, 1);
    assert.ok(history[0].timestamp >= before);
    assert.ok(history[0].timestamp <= after);
});

test("getPatchHistory can be filtered by kind", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:a",
        js_body: "return 1;"
    });

    wrapper.applyPatch({
        kind: "event",
        id: "obj_test#Step",
        js_body: "return 2;"
    });

    wrapper.applyPatch({
        kind: "script",
        id: "script:b",
        js_body: "return 3;"
    });

    const scriptHistory = wrapper.getPatchHistory({ kind: "script" });
    assert.strictEqual(scriptHistory.length, 2);
    assert.ok(scriptHistory.every((h) => h.patch.kind === "script"));

    const eventHistory = wrapper.getPatchHistory({ kind: "event" });
    assert.strictEqual(eventHistory.length, 1);
    assert.strictEqual(eventHistory[0].patch.kind, "event");
});

test("getPatchHistory can be limited", () => {
    const wrapper = createRuntimeWrapper();

    for (let i = 0; i < 5; i++) {
        wrapper.applyPatch({
            kind: "script",
            id: `script:test${i}`,
            js_body: `return ${i};`
        });
    }

    const limited = wrapper.getPatchHistory({ limit: 2 });
    assert.strictEqual(limited.length, 2);
    assert.strictEqual(limited[0].patch.id, "script:test3");
    assert.strictEqual(limited[1].patch.id, "script:test4");
});

test("getPatchHistory can filter successful patches only", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "script",
        id: "script:good",
        js_body: "return 1;"
    });

    try {
        wrapper.applyPatch({
            kind: "script",
            id: "script:bad"
        });
    } catch {
        // Expected to fail, testing successOnly filter
    }

    const allHistory = wrapper.getPatchHistory();
    assert.strictEqual(allHistory.length, 2);

    const successOnly = wrapper.getPatchHistory({ successOnly: true });
    assert.strictEqual(successOnly.length, 1);
    assert.strictEqual(successOnly[0].patch.id, "script:good");
});

test("getPatchHistory records error messages for failed patches", () => {
    const wrapper = createRuntimeWrapper();

    try {
        wrapper.applyPatch({
            kind: "script",
            id: "script:bad"
        });
    } catch {
        // Expected to fail, testing error message recording
    }

    const history = wrapper.getPatchHistory();
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].success, false);
    assert.ok(history[0].error);
    assert.ok(history[0].error.includes("js_body"));
});

test("getRegisteredIds returns script IDs", () => {
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

    const ids = wrapper.getRegisteredIds("script");
    assert.strictEqual(ids.length, 2);
    assert.ok(ids.includes("script:a"));
    assert.ok(ids.includes("script:b"));
});

test("getRegisteredIds returns event IDs", () => {
    const wrapper = createRuntimeWrapper();

    wrapper.applyPatch({
        kind: "event",
        id: "obj_player#Step",
        js_body: "return 1;"
    });

    const ids = wrapper.getRegisteredIds("event");
    assert.strictEqual(ids.length, 1);
    assert.strictEqual(ids[0], "obj_player#Step");
});

test("getRegisteredIds returns empty array for unknown kind", () => {
    const wrapper = createRuntimeWrapper();
    const ids = wrapper.getRegisteredIds("unknown");
    assert.ok(Array.isArray(ids));
    assert.strictEqual(ids.length, 0);
});
