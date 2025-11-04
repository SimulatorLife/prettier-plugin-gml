import assert from "node:assert/strict";
import test from "node:test";
import { createWebSocketClient } from "../src/websocket-client.js";

test("createWebSocketClient returns client interface", () => {
    const client = createWebSocketClient({
        url: "ws://localhost:9999",
        onPatch: () => {},
        onStatus: () => {}
    });

    assert.strictEqual(typeof client.connect, "function");
    assert.strictEqual(typeof client.disconnect, "function");
    assert.strictEqual(typeof client.getStatus, "function");
});

test("initial status is disconnected", () => {
    const client = createWebSocketClient({
        url: "ws://localhost:9999",
        onPatch: () => {},
        onStatus: () => {}
    });

    assert.strictEqual(client.getStatus(), "disconnected");
});

test("status callback is invoked when connect fails in Node.js", async () => {
    const statuses = [];

    const client = createWebSocketClient({
        url: "ws://localhost:9999",
        onPatch: () => {},
        onStatus: (status) => {
            statuses.push(status);
        }
    });

    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 100));

    client.disconnect();

    assert.ok(
        statuses.includes("reconnecting") || statuses.includes("disconnected")
    );
});

test("disconnect stops reconnection attempts", async () => {
    let statusChanges = 0;

    const client = createWebSocketClient({
        url: "ws://localhost:9999",
        onPatch: () => {},
        onStatus: () => {
            statusChanges++;
        }
    });

    client.connect();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const changesBeforeDisconnect = statusChanges;

    client.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 600));

    const changesAfterDisconnect = statusChanges;

    assert.ok(changesAfterDisconnect <= changesBeforeDisconnect + 1);
});

test("client interface works without WebSocket available", () => {
    const client = createWebSocketClient({
        url: "ws://localhost:9999",
        onPatch: () => {},
        onStatus: () => {}
    });

    assert.strictEqual(client.getStatus(), "disconnected");

    client.connect();
    client.disconnect();

    assert.strictEqual(client.getStatus(), "disconnected");
});
