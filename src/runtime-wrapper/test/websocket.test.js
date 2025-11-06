import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeWrapper, createWebSocketClient } from "../src/index.js";

class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = 0;
        this._listeners = {
            open: [],
            message: [],
            close: [],
            error: []
        };

        setImmediate(() => {
            this.readyState = 1;
            for (const handler of this._listeners.open) {
                handler();
            }
        });
    }

    addEventListener(event, handler) {
        if (this._listeners[event]) {
            this._listeners[event].push(handler);
        }
    }

    removeEventListener(event, handler) {
        if (this._listeners[event]) {
            const index = this._listeners[event].indexOf(handler);
            if (index !== -1) {
                this._listeners[event].splice(index, 1);
            }
        }
    }

    send(_data) {
        if (this.readyState !== 1) {
            throw new Error("WebSocket is not open");
        }
    }

    close() {
        this.readyState = 3;
        setImmediate(() => {
            for (const handler of this._listeners.close) {
                handler();
            }
        });
    }

    simulateMessage(data) {
        for (const handler of this._listeners.message) {
            handler({ data });
        }
    }

    simulateError() {
        for (const handler of this._listeners.error) {
            handler(new Error("Connection error"));
        }
    }
}

test("createWebSocketClient returns client interface", () => {
    const client = createWebSocketClient({ autoConnect: false });
    assert.strictEqual(typeof client.connect, "function");
    assert.strictEqual(typeof client.disconnect, "function");
    assert.strictEqual(typeof client.isConnected, "function");
    assert.strictEqual(typeof client.send, "function");
});

test("createWebSocketClient does not auto-connect when autoConnect is false", () => {
    const client = createWebSocketClient({ autoConnect: false });
    assert.strictEqual(client.isConnected(), false);
});

test("WebSocket client connects and receives patches", async () => {
    const wrapper = createRuntimeWrapper();
    let connectCalled = false;

    globalThis.WebSocket = MockWebSocket;

    const client = createWebSocketClient({
        wrapper,
        onConnect: () => {
            connectCalled = true;
        },
        autoConnect: true
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.ok(connectCalled);
    assert.ok(client.isConnected());

    client.disconnect();
    delete globalThis.WebSocket;
});

test("WebSocket client applies patches from messages", async () => {
    const wrapper = createRuntimeWrapper();

    globalThis.WebSocket = MockWebSocket;

    const client = createWebSocketClient({
        wrapper,
        autoConnect: true
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: "return 42;"
    };

    const ws = client.getWebSocket();
    assert.ok(ws, "WebSocket should be available");

    ws.simulateMessage(JSON.stringify(patch));

    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.ok(wrapper.hasScript("script:test"));

    client.disconnect();
    delete globalThis.WebSocket;
});

test("WebSocket client applies batch patches from messages", async () => {
    const wrapper = createRuntimeWrapper();

    globalThis.WebSocket = MockWebSocket;

    const client = createWebSocketClient({
        wrapper,
        autoConnect: true
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const patches = [
        {
            kind: "script",
            id: "script:batch_one",
            js_body: "return 21;"
        },
        {
            kind: "event",
            id: "obj_batch#Create",
            js_body: "this.created = true;"
        }
    ];

    const ws = client.getWebSocket();
    assert.ok(ws, "WebSocket should be available");

    ws.simulateMessage(JSON.stringify(patches));

    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.ok(wrapper.hasScript("script:batch_one"));
    assert.ok(wrapper.hasEvent("obj_batch#Create"));

    client.disconnect();
    delete globalThis.WebSocket;
});

test("WebSocket client handles invalid JSON gracefully", async () => {
    const wrapper = createRuntimeWrapper();
    let errorCalled = false;

    globalThis.WebSocket = MockWebSocket;

    const client = createWebSocketClient({
        wrapper,
        onError: (error, context) => {
            errorCalled = true;
            assert.strictEqual(context, "patch");
        },
        autoConnect: true
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const ws = client.getWebSocket();
    assert.ok(ws, "WebSocket should be available");

    ws.simulateMessage("invalid json");

    await new Promise((resolve) => setTimeout(resolve, 10));

    assert.ok(errorCalled);

    client.disconnect();
    delete globalThis.WebSocket;
});

test("WebSocket client disconnects cleanly", async () => {
    let disconnectCalled = false;

    globalThis.WebSocket = MockWebSocket;

    const client = createWebSocketClient({
        onDisconnect: () => {
            disconnectCalled = true;
        },
        autoConnect: true
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    client.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.ok(disconnectCalled);
    assert.strictEqual(client.isConnected(), false);

    delete globalThis.WebSocket;
});

test("WebSocket client reconnects after connection loss", async () => {
    let reconnectCount = 0;

    globalThis.WebSocket = MockWebSocket;

    const client = createWebSocketClient({
        onConnect: () => {
            reconnectCount++;
        },
        reconnectDelay: 100,
        autoConnect: true
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.strictEqual(reconnectCount, 1);

    const ws = client.getWebSocket();
    assert.ok(ws, "WebSocket should be available");

    ws.close();

    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.ok(
        reconnectCount >= 2,
        `Expected at least 2 reconnects, got ${reconnectCount}`
    );

    client.disconnect();
    delete globalThis.WebSocket;
});

test("WebSocket client clears pending reconnect timer on manual reconnect", async () => {
    const wrapper = createRuntimeWrapper();

    globalThis.WebSocket = MockWebSocket;

    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const trackedTimers = new Map();
    let client;

    try {
        globalThis.setTimeout = (fn, delay, ...args) => {
            const handle = originalSetTimeout(() => {
                trackedTimers.delete(handle);
                fn(...args);
            }, delay);

            trackedTimers.set(handle, { cleared: false, delay });
            return handle;
        };

        globalThis.clearTimeout = (handle) => {
            const meta = trackedTimers.get(handle);
            if (meta) {
                meta.cleared = true;
            }

            return originalClearTimeout(handle);
        };

        client = createWebSocketClient({
            wrapper,
            autoConnect: false,
            reconnectDelay: 50
        });

        client.connect();
        await new Promise((resolve) => setImmediate(resolve));

        const initialSocket = client.getWebSocket();
        assert.ok(initialSocket, "Initial WebSocket should be available");

        initialSocket.close();
        await new Promise((resolve) => setImmediate(resolve));

        const timers = [...trackedTimers.entries()];
        assert.strictEqual(timers.length, 1);

        const [handle, meta] = timers[0];
        assert.ok(handle, "Expected reconnect timer handle to be tracked");
        assert.strictEqual(meta.cleared, false);

        client.connect();
        await new Promise((resolve) => setImmediate(resolve));

        assert.strictEqual(
            meta.cleared,
            true,
            "Reconnect timer should be cleared on reconnect"
        );
        assert.ok(
            client.isConnected(),
            "Client should be connected after manual reconnect"
        );

        client.disconnect();
    } finally {
        globalThis.setTimeout = originalSetTimeout;
        globalThis.clearTimeout = originalClearTimeout;
        delete globalThis.WebSocket;
    }
});

test("WebSocket client does not reconnect after manual disconnect", async () => {
    let connectCount = 0;

    globalThis.WebSocket = MockWebSocket;

    const client = createWebSocketClient({
        onConnect: () => {
            connectCount++;
        },
        reconnectDelay: 50,
        autoConnect: true
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.strictEqual(connectCount, 1);

    client.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 150));

    assert.strictEqual(connectCount, 1);

    delete globalThis.WebSocket;
});

test("WebSocket send throws when not connected", () => {
    const client = createWebSocketClient({ autoConnect: false });

    assert.throws(() => client.send({ test: "data" }), {
        message: /WebSocket is not connected/
    });
});

test("WebSocket send works when connected", async () => {
    globalThis.WebSocket = MockWebSocket;

    const client = createWebSocketClient({ autoConnect: true });

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.doesNotThrow(() => {
        client.send({ kind: "ping" });
    });

    client.disconnect();
    delete globalThis.WebSocket;
});
