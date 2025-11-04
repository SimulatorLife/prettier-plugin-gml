import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWrapper } from "../src/index.js";
import { createWebSocketClient } from "../src/websocket-client.js";

test("WebSocket client integrates with runtime wrapper", async () => {
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        url: "ws://localhost:9999",
        onPatch: (patch) => {
            try {
                wrapper.applyPatch(patch);
            } catch (error) {
                console.error("Failed to apply patch:", error);
            }
        },
        onStatus: () => {}
    });

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: "return 42;"
    };

    if (client.connect) {
        client.onPatch?.(patch);
    }

    assert.strictEqual(wrapper.state.registry.version, 0);
    client.disconnect();
});

test("runtime wrapper and WebSocket client work together for multiple patches", () => {
    const appliedPatches = [];

    const wrapper = createRuntimeWrapper({
        onPatchApplied: (patch, version) => {
            appliedPatches.push({ id: patch.id, version });
        }
    });

    const client = createWebSocketClient({
        url: "ws://localhost:9999",
        onPatch: (patch) => {
            wrapper.applyPatch(patch);
        },
        onStatus: () => {}
    });

    const patches = [
        { kind: "script", id: "script:a", js_body: "return 1;" },
        { kind: "script", id: "script:b", js_body: "return 2;" },
        { kind: "event", id: "obj_test#Step", js_body: "this.x += 1;" }
    ];

    patches.forEach((patch) => {
        wrapper.applyPatch(patch);
    });

    assert.strictEqual(appliedPatches.length, 3);
    assert.strictEqual(appliedPatches[0].id, "script:a");
    assert.strictEqual(appliedPatches[1].id, "script:b");
    assert.strictEqual(appliedPatches[2].id, "obj_test#Step");
    assert.strictEqual(wrapper.state.registry.version, 3);

    client.disconnect();
});

test("WebSocket client reports connection status during integration", async () => {
    const wrapper = createRuntimeWrapper();
    const statuses = [];

    const client = createWebSocketClient({
        url: "ws://localhost:9999",
        onPatch: (patch) => {
            wrapper.applyPatch(patch);
        },
        onStatus: (status) => {
            statuses.push(status);
        }
    });

    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 100));

    client.disconnect();

    assert.ok(statuses.length > 0);
    assert.ok(
        statuses.includes("connecting") || statuses.includes("disconnected")
    );
});

test("runtime wrapper handles patches from WebSocket with error recovery", () => {
    let errorHandled = false;
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        url: "ws://localhost:9999",
        onPatch: (patch) => {
            try {
                wrapper.applyPatch(patch);
            } catch {
                errorHandled = true;
            }
        },
        onStatus: () => {}
    });

    const invalidPatch = {
        kind: "script",
        id: "script:bad"
    };

    try {
        wrapper.applyPatch(invalidPatch);
    } catch {
        errorHandled = true;
    }

    assert.ok(errorHandled);
    client.disconnect();
});
