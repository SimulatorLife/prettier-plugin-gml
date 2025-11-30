import assert from "node:assert/strict";
import test from "node:test";
import  {
    RuntimeWrapper,
    type MessageEventLike,
    type RuntimePatchError,
    type RuntimeWebSocketConstructor,
    type RuntimeWebSocketInstance,
    type WebSocketEvent
} from "../index.js";

const globalWithWebSocket = globalThis as unknown as {
    WebSocket?: RuntimeWebSocketConstructor;
};

const wait = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

const flush = () =>
    new Promise<void>((resolve) => {
        setImmediate(resolve);
    });

class MockWebSocket implements RuntimeWebSocketInstance {
    public readyState = 0;
    private readonly listeners: Record<
        WebSocketEvent,
        Array<(event?: unknown) => void>
    > = {
        open: [],
        message: [],
        close: [],
        error: []
    };

    constructor(public readonly url: string) {
        setImmediate(() => {
            this.readyState = 1;
            this.dispatch("open");
        });
    }

    addEventListener(
        event: WebSocketEvent,
        handler: (event?: Error | MessageEventLike) => void
    ) {
        this.listeners[event]?.push(handler);
    }

    removeEventListener(
        event: WebSocketEvent,
        handler: (event?: Error | MessageEventLike) => void
    ) {
        const queue = this.listeners[event];
        const index = queue?.indexOf(handler);
        if (queue && typeof index === "number" && index >= 0) {
            queue.splice(index, 1);
        }
    }

    send(_data: string) {
        if (this.readyState !== 1) {
            throw new Error("WebSocket is not open");
        }
    }

    close() {
        if (this.readyState === 3) {
            return;
        }

        this.readyState = 3;
        setImmediate(() => {
            this.dispatch("close");
        });
    }

    simulateMessage(data: string) {
        this.dispatch("message", { data });
    }

    simulateError(error: Error = new Error("Connection error")) {
        this.dispatch("error", error);
    }

    private dispatch(
        event: WebSocketEvent,
        payload?: Error | MessageEventLike
    ) {
        for (const handler of this.listeners[event] ?? []) {
            handler(payload);
        }
    }
}

test("createWebSocketClient returns client interface", () => {
    const client = RuntimeWrapper.createWebSocketClient({ autoConnect: false });
    assert.strictEqual(typeof client.connect, "function");
    assert.strictEqual(typeof client.disconnect, "function");
    assert.strictEqual(typeof client.isConnected, "function");
    assert.strictEqual(typeof client.send, "function");
});

test("createWebSocketClient does not auto-connect when autoConnect is false", () => {
    const client = RuntimeWrapper.createWebSocketClient({ autoConnect: false });
    assert.strictEqual(client.isConnected(), false);
});

test("WebSocket client connects and receives patches", async () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    let connectCalled = false;

    globalWithWebSocket.WebSocket = MockWebSocket;

    const client = RuntimeWrapper.createWebSocketClient({
        wrapper,
        onConnect: () => {
            connectCalled = true;
        },
        autoConnect: true
    });

    await wait(50);

    assert.ok(connectCalled);
    assert.ok(client.isConnected());

    client.disconnect();
    delete globalWithWebSocket.WebSocket;
});

test("WebSocket client applies patches from messages", async () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    globalWithWebSocket.WebSocket = MockWebSocket;

    const client = RuntimeWrapper.createWebSocketClient({
        wrapper,
        autoConnect: true
    });

    await wait(50);

    const patch = {
        kind: "script",
        id: "script:test",
        js_body: "return 42;"
    };

    const ws = client.getWebSocket();
    assert.ok(ws, "WebSocket should be available");
    const mockSocket = ws as MockWebSocket;

    mockSocket.simulateMessage(JSON.stringify(patch));

    await wait(10);

    assert.ok(wrapper.hasScript("script:test"));

    client.disconnect();
    delete globalWithWebSocket.WebSocket;
});

test("WebSocket client applies batch patches from messages", async () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    globalWithWebSocket.WebSocket = MockWebSocket;

    const client = RuntimeWrapper.createWebSocketClient({
        wrapper,
        autoConnect: true
    });

    await wait(50);

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
    const mockSocket = ws as MockWebSocket;

    mockSocket.simulateMessage(JSON.stringify(patches));

    await wait(10);

    assert.ok(wrapper.hasScript("script:batch_one"));
    assert.ok(wrapper.hasEvent("obj_batch#Create"));

    client.disconnect();
    delete globalWithWebSocket.WebSocket;
});

test("WebSocket client prefers trySafeApply when available", async () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    const originalTrySafeApply = wrapper.trySafeApply;
    let trySafeApplyCalls = 0;

    wrapper.trySafeApply = (...args) => {
        trySafeApplyCalls++;
        return originalTrySafeApply(...args);
    };

    globalWithWebSocket.WebSocket = MockWebSocket;

    const client = RuntimeWrapper.createWebSocketClient({
        wrapper,
        autoConnect: true
    });

    await wait(50);

    const patch = {
        kind: "script",
        id: "script:prefers_safe",
        js_body: "return 7;"
    };

    const ws = client.getWebSocket();
    assert.ok(ws, "WebSocket should be available");
    const mockSocket = ws as MockWebSocket;

    mockSocket.simulateMessage(JSON.stringify(patch));

    await wait(10);

    assert.strictEqual(trySafeApplyCalls, 1);
    assert.ok(wrapper.hasScript("script:prefers_safe"));

    client.disconnect();
    delete globalWithWebSocket.WebSocket;
});

test("WebSocket client handles invalid JSON gracefully", async () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    let errorCalled = false;

    globalWithWebSocket.WebSocket = MockWebSocket;

    const client = RuntimeWrapper.createWebSocketClient({
        wrapper,
        onError: (error, context) => {
            errorCalled = true;
            assert.strictEqual(context, "patch");
        },
        autoConnect: true
    });

    await wait(50);

    const ws = client.getWebSocket();
    assert.ok(ws, "WebSocket should be available");
    const mockSocket = ws as MockWebSocket;

    mockSocket.simulateMessage("invalid json");

    await wait(10);

    assert.ok(errorCalled);

    client.disconnect();
    delete globalWithWebSocket.WebSocket;
});

test("WebSocket client surfaces trySafeApply failures", async () => {
    let capturedError: RuntimePatchError | null = null;
    let capturedContext: "connection" | "patch" | null = null;

    const wrapper = RuntimeWrapper.createRuntimeWrapper();
    wrapper.trySafeApply = () => ({
        success: false,
        message: "Shadow validation failed: syntax error",
        error: "syntax error",
        rolledBack: true
    });

    globalWithWebSocket.WebSocket = MockWebSocket;

    const client = RuntimeWrapper.createWebSocketClient({
        wrapper,
        onError: (error, context) => {
            capturedError = error;
            capturedContext = context;
        },
        autoConnect: true
    });

    await wait(50);

    const ws = client.getWebSocket();
    assert.ok(ws, "WebSocket should be available");
    const mockSocket = ws as MockWebSocket;

    const failingPatch = {
        kind: "script",
        id: "script:bad",
        js_body: "return 42;"
    };

    mockSocket.simulateMessage(JSON.stringify(failingPatch));

    await wait(10);

    assert.ok(capturedError);
    assert.strictEqual(capturedContext, "patch");
    assert.ok(capturedError.message.includes("Shadow validation failed"));
    assert.deepEqual(capturedError.patch, failingPatch);
    assert.strictEqual(capturedError.rolledBack, true);

    client.disconnect();
    delete globalWithWebSocket.WebSocket;
});

test("WebSocket client disconnects cleanly", async () => {
    let disconnectCalled = false;

    globalWithWebSocket.WebSocket = MockWebSocket;

    const client = RuntimeWrapper.createWebSocketClient({
        onDisconnect: () => {
            disconnectCalled = true;
        },
        autoConnect: true
    });

    await wait(50);

    client.disconnect();

    await wait(50);

    assert.ok(disconnectCalled);
    assert.strictEqual(client.isConnected(), false);

    delete globalWithWebSocket.WebSocket;
});

test("WebSocket client reconnects after connection loss", async () => {
    let reconnectCount = 0;

    globalWithWebSocket.WebSocket = MockWebSocket;

    const client = RuntimeWrapper.createWebSocketClient({
        onConnect: () => {
            reconnectCount++;
        },
        reconnectDelay: 30,
        autoConnect: true
    });

    try {
        await wait(40);

        assert.strictEqual(reconnectCount, 1);

        const ws = client.getWebSocket();
        assert.ok(ws, "WebSocket should be available");

        ws.close();

        await wait(10);
        await wait(40);

        assert.ok(
            reconnectCount >= 2,
            `Expected at least 2 reconnects, got ${reconnectCount}`
        );
    } finally {
        client?.disconnect();
        delete globalWithWebSocket.WebSocket;
    }
});

test("WebSocket client clears pending reconnect timer on manual reconnect", async () => {
    const wrapper = RuntimeWrapper.createRuntimeWrapper();

    globalWithWebSocket.WebSocket = MockWebSocket;

    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const trackedTimers = new Map<
        ReturnType<typeof originalSetTimeout>,
        { cleared: boolean; delay: number }
    >();
    let client: ReturnType<typeof RuntimeWrapper.createWebSocketClient> | null =
        null;

    try {
        globalThis.setTimeout = ((
            fn: (...callbackArgs: Array<unknown>) => void,
            delay?: number,
            ...args: Array<unknown>
        ) => {
            const handle = originalSetTimeout(() => {
                trackedTimers.delete(handle);
                fn(...args);
            }, delay);

            trackedTimers.set(handle, {
                cleared: false,
                delay: delay ?? 0
            });
            return handle;
        }) as typeof setTimeout;

        globalThis.clearTimeout = ((
            handle: ReturnType<typeof originalSetTimeout>
        ) => {
            const meta = trackedTimers.get(handle);
            if (meta) {
                meta.cleared = true;
            }

            return originalClearTimeout(handle);
        }) as typeof clearTimeout;

        client = RuntimeWrapper.createWebSocketClient({
            wrapper,
            autoConnect: false,
            reconnectDelay: 50
        });

        client.connect();
        await flush();

        const initialSocket = client.getWebSocket();
        assert.ok(initialSocket, "Initial WebSocket should be available");

        initialSocket.close();
        await flush();

        const timers = [...trackedTimers.entries()];
        assert.strictEqual(timers.length, 1);

        const [handle, meta] = timers[0];
        assert.ok(handle, "Expected reconnect timer handle to be tracked");
        assert.strictEqual(meta.cleared, false);

        client.connect();
        await flush();

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
        delete globalWithWebSocket.WebSocket;
    }
});

test("WebSocket client does not reconnect after manual disconnect", async () => {
    let connectCount = 0;

    globalWithWebSocket.WebSocket = MockWebSocket;

    const client = RuntimeWrapper.createWebSocketClient({
        onConnect: () => {
            connectCount++;
        },
        reconnectDelay: 50,
        autoConnect: true
    });

    await wait(50);

    assert.strictEqual(connectCount, 1);

    client.disconnect();

    await wait(150);

    assert.strictEqual(connectCount, 1);

    delete globalWithWebSocket.WebSocket;
});

test("WebSocket send throws when not connected", () => {
    const client = RuntimeWrapper.createWebSocketClient({ autoConnect: false });

    assert.throws(() => client.send({ test: "data" }), {
        message: /WebSocket is not connected/
    });
});

test("WebSocket send works when connected", async () => {
    globalWithWebSocket.WebSocket = MockWebSocket;

    const client = RuntimeWrapper.createWebSocketClient({ autoConnect: true });

    await wait(50);

    assert.doesNotThrow(() => {
        client.send({ kind: "ping" });
    });

    client.disconnect();
    delete globalWithWebSocket.WebSocket;
});
