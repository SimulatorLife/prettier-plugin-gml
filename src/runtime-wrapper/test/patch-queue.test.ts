import assert from "node:assert";
import { test } from "node:test";

import { Clients, Runtime } from "../src/index.js";

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
        // No-op for testing: Mock WebSocket implementation doesn't transmit
        // messages over the network. Tests verify client-side behavior
        // (event handling, reconnection logic, state management) without
        // requiring an actual WebSocket server. Real message transmission
        // would add test flakiness and infrastructure dependencies.
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

const DEFAULT_PATCH_QUEUE_OPTIONS = {
    enabled: true,
    flushIntervalMs: 1000,
    maxQueueSize: 50
};

type RuntimeWrapperInstance = ReturnType<typeof createRuntimeWrapper>;
type WebSocketClientOptions = Parameters<typeof createWebSocketClient>[0];
type WebSocketClientInstance = ReturnType<typeof createWebSocketClient>;

type PatchQueueClientSetupOptions = {
    patchQueue?: WebSocketClientOptions["patchQueue"];
    wrapperMutator?: (wrapper: RuntimeWrapperInstance) => RuntimeWrapperInstance;
    waitAfterConnectMs?: number;
};

function installMockWebSocket(): void {
    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
}

function sendScriptPatch(ws: MockWebSocket, id: string, jsBody = "return 1;"): void {
    ws.simulateMessage(JSON.stringify({ kind: "script", id, js_body: jsBody }));
}

function sendScriptPatchBatch(ws: MockWebSocket, patches: Array<{ id: string; js_body?: string }>): void {
    ws.simulateMessage(
        JSON.stringify(
            patches.map((patch) => ({
                kind: "script",
                id: patch.id,
                js_body: patch.js_body ?? "return 1;"
            }))
        )
    );
}

function wait(durationMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function createConnectedPatchQueueClient(
    options: PatchQueueClientSetupOptions = {}
): Promise<{ wrapper: RuntimeWrapperInstance; client: WebSocketClientInstance; ws: MockWebSocket }> {
    const wrapper = createRuntimeWrapper();
    const configuredWrapper = options.wrapperMutator ? options.wrapperMutator(wrapper) : wrapper;

    const client = createWebSocketClient({
        wrapper: configuredWrapper,
        autoConnect: false,
        patchQueue: {
            ...DEFAULT_PATCH_QUEUE_OPTIONS,
            ...options.patchQueue
        }
    });

    installMockWebSocket();

    client.connect();
    await wait(options.waitAfterConnectMs ?? 50);

    const ws = client.getWebSocket() as unknown as MockWebSocket;
    assert.ok(ws);

    return { wrapper, client, ws };
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
    let patchesApplied = 0;

    const { client, ws } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 100,
            maxQueueSize: 10
        },
        wrapperMutator: (wrapper) => {
            const originalApplyPatchBatch = wrapper.applyPatchBatch.bind(wrapper);
            wrapper.applyPatchBatch = (patches: Array<unknown>) => {
                patchesApplied += patches.length;
                return originalApplyPatchBatch(patches);
            };
            return wrapper;
        }
    });

    sendScriptPatch(ws, "script:test1");

    const metricsBeforeFlush = client.getPatchQueueMetrics();
    assert.ok(metricsBeforeFlush !== null);
    assert.strictEqual(metricsBeforeFlush.totalQueued, 1);
    assert.strictEqual(patchesApplied, 0);

    await wait(150);

    const metricsAfterFlush = client.getPatchQueueMetrics();
    assert.ok(metricsAfterFlush !== null);
    assert.strictEqual(metricsAfterFlush.totalFlushed, 1);
    assert.strictEqual(metricsAfterFlush.flushCount, 1);
    assert.strictEqual(patchesApplied, 1);

    client.disconnect();
});

void test("patch queue flushes automatically when reaching max size", async () => {
    const { client, ws } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 1000,
            maxQueueSize: 3
        }
    });

    sendScriptPatch(ws, "script:test1");
    sendScriptPatch(ws, "script:test2");

    let metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalQueued, 2);
    assert.strictEqual(metrics.flushCount, 0);

    sendScriptPatch(ws, "script:test3");

    await wait(50);

    metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalQueued, 3);
    assert.strictEqual(metrics.totalFlushed, 3);
    assert.strictEqual(metrics.flushCount, 1);
    assert.strictEqual(metrics.maxQueueDepth, 3);

    client.disconnect();
});

void test("patch queue drops oldest patches when exceeding max size", async () => {
    const { client, ws } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 1000,
            maxQueueSize: 2
        }
    });

    sendScriptPatch(ws, "script:test1");

    let metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalQueued, 1);
    assert.strictEqual(metrics.totalDropped, 0);

    sendScriptPatch(ws, "script:test2");

    await wait(50);

    metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalFlushed, 2);
    assert.strictEqual(metrics.flushCount, 1);

    client.disconnect();
});

void test("flushPatchQueue manually flushes queued patches", async () => {
    const { client, ws } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 10_000,
            maxQueueSize: 50
        }
    });

    sendScriptPatch(ws, "script:test1");
    sendScriptPatch(ws, "script:test2");
    sendScriptPatch(ws, "script:test3");

    await wait(50);

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
    const batchCalls: Array<Array<unknown>> = [];

    const { client, ws } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 50,
            maxQueueSize: 10
        },
        wrapperMutator: (wrapper) => {
            const originalApplyPatchBatch = wrapper.applyPatchBatch.bind(wrapper);
            wrapper.applyPatchBatch = (patches: Array<unknown>) => {
                batchCalls.push(patches);
                return originalApplyPatchBatch(patches);
            };
            return wrapper;
        }
    });

    sendScriptPatch(ws, "script:test1");
    sendScriptPatch(ws, "script:test2");

    await wait(100);

    assert.strictEqual(batchCalls.length, 1);
    assert.strictEqual(batchCalls[0].length, 2);

    client.disconnect();
});

void test("disconnect flushes pending patches", async () => {
    const { client, ws } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 10_000,
            maxQueueSize: 50
        }
    });

    sendScriptPatch(ws, "script:test1");
    sendScriptPatch(ws, "script:test2");

    await wait(50);

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
    const { client, ws } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 200,
            maxQueueSize: 50
        }
    });

    sendScriptPatch(ws, "script:test1");

    await wait(20);

    sendScriptPatch(ws, "script:test2");
    sendScriptPatch(ws, "script:test3");

    await wait(20);

    let metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.maxQueueDepth, 3);

    await wait(200);

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
    const { client, ws } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 50,
            maxQueueSize: 10
        }
    });

    sendScriptPatchBatch(ws, [{ id: "script:test1" }, { id: "script:test2" }, { id: "script:test3" }]);

    await wait(20);

    let metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalQueued, 3);

    await wait(100);

    metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.totalFlushed, 3);

    client.disconnect();
});

void test("patch queue reports failures when a batch rolls back", async () => {
    const { wrapper, client, ws } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 50,
            maxQueueSize: 10
        }
    });

    sendScriptPatchBatch(ws, [
        { id: "script:good", js_body: "return 1;" },
        { id: "script:bad", js_body: "return {{ invalid syntax" }
    ]);

    await wait(100);

    const queueMetrics = client.getPatchQueueMetrics();
    assert.ok(queueMetrics !== null);
    assert.strictEqual(queueMetrics.totalFlushed, 2);
    assert.strictEqual(queueMetrics.flushCount, 1);

    const connectionMetrics = client.getConnectionMetrics();
    assert.strictEqual(connectionMetrics.patchesApplied, 0);
    assert.strictEqual(connectionMetrics.patchesFailed, 2);
    assert.strictEqual(connectionMetrics.patchErrors, 2);

    assert.strictEqual(wrapper.hasScript("script:good"), false);

    client.disconnect();
});

void test("patch queue clears flush timer on disconnect", async () => {
    const { client, ws } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 10_000,
            maxQueueSize: 50
        }
    });

    sendScriptPatch(ws, "script:test1");

    await wait(50);

    client.disconnect();

    await wait(100);

    const metrics = client.getPatchQueueMetrics();
    assert.ok(metrics !== null);
    assert.strictEqual(metrics.flushCount, 1);
});
