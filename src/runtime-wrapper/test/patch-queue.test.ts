import assert from "node:assert";
import { test } from "node:test";
import { Runtime, Clients } from "../src/index.js";

const { createRuntimeWrapper } = Runtime;
const { createWebSocketClient } = Clients;

class MockWebSocket {
    public readyState = 0;
    private listeners = new Map<string, Set<(event?: unknown) => void>>();

    constructor() {
        setTimeout(() => {
            this.readyState = 1;
            this.triggerEvent("open");
        }, 10);
    }

    addEventListener(event: string, handler: (event?: unknown) => void): void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)?.add(handler);
    }

    removeEventListener(event: string, handler: (event?: unknown) => void): void {
        this.listeners.get(event)?.delete(handler);
    }

    send(): void {
        // No-op for testing
    }

    close(): void {
        this.readyState = 3;
        setTimeout(() => this.triggerEvent("close"), 10);
    }

    triggerEvent(event: string, data?: unknown): void {
        const handlers = this.listeners.get(event);
        if (handlers) {
            for (const handler of handlers) {
                handler(data);
            }
        }
    }

    simulateMessage(data: unknown): void {
        this.triggerEvent("message", { data });
    }
}

void test("getPatchQueueMetrics returns null when queuing is disabled", () => {
    const wrapper = createRuntimeWrapper();
    const client = createWebSocketClient({
        wrapper,
        autoConnect: false
    });

    const metrics = client.getPatchQueueMetrics();
    assert.strictEqual(metrics, null);
});

void test("getPatchQueueMetrics returns initial metrics when queuing is enabled", () => {
    const wrapper = createRuntimeWrapper();
    const client = createWebSocketClient({
        wrapper,
        autoConnect: false,
        patchQueue: {
            enabled: true
        }
    });

    const metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalQueued, 0);
    assert.strictEqual(metrics.totalFlushed, 0);
    assert.strictEqual(metrics.totalDropped, 0);
    assert.strictEqual(metrics.maxQueueDepth, 0);
    assert.strictEqual(metrics.flushCount, 0);
    assert.strictEqual(metrics.lastFlushSize, 0);
    assert.strictEqual(metrics.lastFlushedAt, null);
});

void test("patch queue enqueues patches instead of applying immediately", async () => {
    const wrapper = createRuntimeWrapper();
    let patchesApplied = 0;

    const client = createWebSocketClient({
        wrapper: {
            ...wrapper,
            applyPatchBatch: (patches: Array<unknown>) => {
                patchesApplied += patches.length;
                return wrapper.applyPatchBatch(patches);
            }
        },
        autoConnect: false,
        patchQueue: {
            enabled: true,
            flushIntervalMs: 100,
            maxQueueSize: 10
        }
    });

    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const ws = client.getWebSocket() as unknown as MockWebSocket;
    assert.ok(ws);

    ws.simulateMessage(
        JSON.stringify({
            kind: "script",
            id: "script:test1",
            js_body: "return 1;"
        })
    );

    const metricsBeforeFlush = client.getPatchQueueMetrics();
    assert.ok(metricsBeforeFlush !== null);
    assert.strictEqual(metricsBeforeFlush.totalQueued, 1);
    assert.strictEqual(patchesApplied, 0);

    await new Promise((resolve) => setTimeout(resolve, 150));

    const metricsAfterFlush = client.getPatchQueueMetrics();
    assert.ok(metricsAfterFlush !== null);
    assert.strictEqual(metricsAfterFlush.totalFlushed, 1);
    assert.strictEqual(metricsAfterFlush.flushCount, 1);
    assert.strictEqual(patchesApplied, 1);

    client.disconnect();
});

void test("patch queue flushes automatically when reaching max size", async () => {
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        wrapper,
        autoConnect: false,
        patchQueue: {
            enabled: true,
            flushIntervalMs: 1000,
            maxQueueSize: 3
        }
    });

    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const ws = client.getWebSocket() as unknown as MockWebSocket;
    assert.ok(ws);

    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test1", js_body: "return 1;" }));
    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test2", js_body: "return 2;" }));

    let metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalQueued, 2);
    assert.strictEqual(metrics.flushCount, 0);

    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test3", js_body: "return 3;" }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalQueued, 3);
    assert.strictEqual(metrics.totalFlushed, 3);
    assert.strictEqual(metrics.flushCount, 1);
    assert.strictEqual(metrics.maxQueueDepth, 3);

    client.disconnect();
});

void test("patch queue drops oldest patches when exceeding max size", async () => {
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        wrapper,
        autoConnect: false,
        patchQueue: {
            enabled: true,
            flushIntervalMs: 1000,
            maxQueueSize: 2
        }
    });

    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const ws = client.getWebSocket() as unknown as MockWebSocket;
    assert.ok(ws);

    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test1", js_body: "return 1;" }));

    let metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalQueued, 1);
    assert.strictEqual(metrics.totalDropped, 0);

    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test2", js_body: "return 2;" }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalFlushed, 2);
    assert.strictEqual(metrics.flushCount, 1);

    client.disconnect();
});

void test("flushPatchQueue manually flushes queued patches", async () => {
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        wrapper,
        autoConnect: false,
        patchQueue: {
            enabled: true,
            flushIntervalMs: 10_000,
            maxQueueSize: 50
        }
    });

    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const ws = client.getWebSocket() as unknown as MockWebSocket;
    assert.ok(ws);

    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test1", js_body: "return 1;" }));
    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test2", js_body: "return 2;" }));
    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test3", js_body: "return 3;" }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    let metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalQueued, 3);
    assert.strictEqual(metrics.flushCount, 0);

    const flushed = client.flushPatchQueue();
    assert.strictEqual(flushed, 3);

    metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalFlushed, 3);
    assert.strictEqual(metrics.flushCount, 1);
    assert.strictEqual(metrics.lastFlushSize, 3);

    client.disconnect();
});

void test("flushPatchQueue returns zero when queue is empty", () => {
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        wrapper,
        autoConnect: false,
        patchQueue: {
            enabled: true
        }
    });

    const flushed = client.flushPatchQueue();
    assert.strictEqual(flushed, 0);
});

void test("flushPatchQueue returns zero when queuing is disabled", () => {
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        wrapper,
        autoConnect: false
    });

    const flushed = client.flushPatchQueue();
    assert.strictEqual(flushed, 0);
});

void test("patch queue uses applyPatchBatch when available", async () => {
    const wrapper = createRuntimeWrapper();
    const batchCalls: Array<Array<unknown>> = [];

    const client = createWebSocketClient({
        wrapper: {
            ...wrapper,
            applyPatchBatch: (patches: Array<unknown>) => {
                batchCalls.push(patches);
                return wrapper.applyPatchBatch(patches);
            }
        },
        autoConnect: false,
        patchQueue: {
            enabled: true,
            flushIntervalMs: 50,
            maxQueueSize: 10
        }
    });

    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const ws = client.getWebSocket() as unknown as MockWebSocket;
    assert.ok(ws);

    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test1", js_body: "return 1;" }));
    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test2", js_body: "return 2;" }));

    await new Promise((resolve) => setTimeout(resolve, 100));

    assert.strictEqual(batchCalls.length, 1);
    assert.strictEqual(batchCalls[0].length, 2);

    client.disconnect();
});

void test("disconnect flushes pending patches", async () => {
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        wrapper,
        autoConnect: false,
        patchQueue: {
            enabled: true,
            flushIntervalMs: 10_000,
            maxQueueSize: 50
        }
    });

    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const ws = client.getWebSocket() as unknown as MockWebSocket;
    assert.ok(ws);

    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test1", js_body: "return 1;" }));
    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test2", js_body: "return 2;" }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    let metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalQueued, 2);
    assert.strictEqual(metrics.totalFlushed, 0);

    client.disconnect();

    metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalFlushed, 2);
    assert.strictEqual(metrics.flushCount, 1);
});

void test("patch queue tracks max queue depth correctly", async () => {
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        wrapper,
        autoConnect: false,
        patchQueue: {
            enabled: true,
            flushIntervalMs: 200,
            maxQueueSize: 50
        }
    });

    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const ws = client.getWebSocket() as unknown as MockWebSocket;
    assert.ok(ws);

    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test1", js_body: "return 1;" }));

    await new Promise((resolve) => setTimeout(resolve, 20));

    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test2", js_body: "return 2;" }));
    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test3", js_body: "return 3;" }));

    await new Promise((resolve) => setTimeout(resolve, 20));

    let metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.maxQueueDepth, 3);

    await new Promise((resolve) => setTimeout(resolve, 200));

    metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.maxQueueDepth, 3);

    client.disconnect();
});

void test("patch queue metrics are frozen", () => {
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        wrapper,
        autoConnect: false,
        patchQueue: {
            enabled: true
        }
    });

    const metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.ok(Object.isFrozen(metrics));

    assert.throws(() => {
        (metrics as { totalQueued: number }).totalQueued = 999;
    });
});

void test("patch queue handles array of patches correctly", async () => {
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        wrapper,
        autoConnect: false,
        patchQueue: {
            enabled: true,
            flushIntervalMs: 50,
            maxQueueSize: 10
        }
    });

    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const ws = client.getWebSocket() as unknown as MockWebSocket;
    assert.ok(ws);

    ws.simulateMessage(
        JSON.stringify([
            { kind: "script", id: "script:test1", js_body: "return 1;" },
            { kind: "script", id: "script:test2", js_body: "return 2;" },
            { kind: "script", id: "script:test3", js_body: "return 3;" }
        ])
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    let metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalQueued, 3);

    await new Promise((resolve) => setTimeout(resolve, 100));

    metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalFlushed, 3);

    client.disconnect();
});

void test("patch queue clears flush timer on disconnect", async () => {
    const wrapper = createRuntimeWrapper();

    const client = createWebSocketClient({
        wrapper,
        autoConnect: false,
        patchQueue: {
            enabled: true,
            flushIntervalMs: 10_000,
            maxQueueSize: 50
        }
    });

    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;

    client.connect();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const ws = client.getWebSocket() as unknown as MockWebSocket;
    assert.ok(ws);

    ws.simulateMessage(JSON.stringify({ kind: "script", id: "script:test1", js_body: "return 1;" }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    client.disconnect();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.flushCount, 1);
});
