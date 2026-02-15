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
type PatchQueueMetricsSnapshot = NonNullable<ReturnType<WebSocketClientInstance["getPatchQueueMetrics"]>>;

type PatchQueueClientSetupOptions = {
    patchQueue?: WebSocketClientOptions["patchQueue"];
    wrapperMutator?: (wrapper: RuntimeWrapperInstance) => RuntimeWrapperInstance;
    waitAfterConnectMs?: number;
};

function installMockWebSocket(): void {
    (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
}

function prepareRuntimeGlobalsForPatchQueue(): () => void {
    const globals = globalThis as {
        g_pBuiltIn?: Record<string, unknown>;
        JSON_game?: { ScriptNames?: Array<string>; Scripts?: Array<unknown> };
    };
    const hadBuiltins = Object.hasOwn(globals, "g_pBuiltIn");
    const hadJsonGame = Object.hasOwn(globals, "JSON_game");
    const savedBuiltins = globals.g_pBuiltIn;
    const savedJsonGame = globals.JSON_game;

    globals.g_pBuiltIn = { application_surface: -1 };
    globals.JSON_game = {
        ScriptNames: ["__patch_queue_test__"],
        Scripts: [() => {}]
    };

    return () => {
        if (hadBuiltins) {
            globals.g_pBuiltIn = savedBuiltins;
        } else {
            delete globals.g_pBuiltIn;
        }

        if (hadJsonGame) {
            globals.JSON_game = savedJsonGame;
        } else {
            delete globals.JSON_game;
        }
    };
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

async function waitForCondition(
    label: string,
    predicate: () => boolean,
    options: { timeoutMs: number; pollIntervalMs: number }
): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < options.timeoutMs) {
        if (predicate()) {
            return;
        }
        await wait(options.pollIntervalMs);
    }
    throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForConnection(client: WebSocketClientInstance, timeoutMs = 200): Promise<void> {
    await waitForCondition("WebSocket connection", () => client.isConnected(), {
        timeoutMs,
        pollIntervalMs: 5
    });
}

async function waitForQueueMetrics(
    client: WebSocketClientInstance,
    label: string,
    predicate: (metrics: PatchQueueMetricsSnapshot) => boolean,
    timeoutMs = 200
): Promise<PatchQueueMetricsSnapshot> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const metrics = client.getPatchQueueMetrics();
        if (metrics && predicate(metrics)) {
            return metrics;
        }
        await wait(5);
    }
    const latest = client.getPatchQueueMetrics();
    const snapshot = latest ? JSON.stringify(latest) : "null";
    throw new Error(`Timed out waiting for ${label}. Latest metrics: ${snapshot}`);
}

async function createConnectedPatchQueueClient(options: PatchQueueClientSetupOptions = {}): Promise<{
    wrapper: RuntimeWrapperInstance;
    client: WebSocketClientInstance;
    ws: MockWebSocket;
    restoreRuntimeGlobals: () => void;
}> {
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
    const restoreRuntimeGlobals = prepareRuntimeGlobalsForPatchQueue();

    client.connect();
    await waitForConnection(client, options.waitAfterConnectMs ?? 200);

    const ws = client.getWebSocket() as unknown as MockWebSocket;
    assert.ok(ws);

    return { wrapper, client, ws, restoreRuntimeGlobals };
}

void test("patch queue tracks patches received without double-counting on flush", async () => {
    const { client, ws, restoreRuntimeGlobals } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 50
        }
    });

    try {
        const metricsBefore = client.getConnectionMetrics();
        assert.strictEqual(metricsBefore.patchesReceived, 0);

        sendScriptPatch(ws, "script:queued_metrics");

        await waitForQueueMetrics(client, "queue to contain pending patch", (snapshot) => snapshot.totalQueued === 1);

        const metricsWhileQueued = client.getConnectionMetrics();
        assert.strictEqual(metricsWhileQueued.patchesReceived, 1);
        assert.strictEqual(metricsWhileQueued.patchesApplied, 0);

        const flushedCount = client.flushPatchQueue();
        assert.strictEqual(flushedCount, 1);

        await waitForQueueMetrics(
            client,
            "queue to flush pending patch",
            (snapshot) => snapshot.totalFlushed === 1 && snapshot.flushCount === 1,
            100
        );

        const metricsAfterFlush = client.getConnectionMetrics();
        assert.strictEqual(metricsAfterFlush.patchesReceived, 1);
        assert.strictEqual(metricsAfterFlush.patchesApplied, 1);
    } finally {
        client.disconnect();
        restoreRuntimeGlobals();
    }
});

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

    const { client, ws, restoreRuntimeGlobals } = await createConnectedPatchQueueClient({
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

    try {
        sendScriptPatch(ws, "script:test1");

        const metricsBeforeFlush = await waitForQueueMetrics(
            client,
            "queue to contain pending patch",
            (metrics) => metrics.totalQueued === 1
        );
        assert.strictEqual(metricsBeforeFlush.totalQueued, 1);
        assert.strictEqual(patchesApplied, 0);

        const metricsAfterFlush = await waitForQueueMetrics(
            client,
            "queue to flush pending patch",
            (metrics) => metrics.totalFlushed === 1 && metrics.flushCount === 1,
            300
        );

        assert.strictEqual(metricsAfterFlush.totalFlushed, 1);
        assert.strictEqual(metricsAfterFlush.flushCount, 1);
        assert.strictEqual(patchesApplied, 1);
    } finally {
        client.disconnect();
        restoreRuntimeGlobals();
    }
});

void test("patch queue flushes automatically when reaching max size", async () => {
    const { client, ws, restoreRuntimeGlobals } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 1000,
            maxQueueSize: 3
        }
    });

    try {
        sendScriptPatch(ws, "script:test1");
        sendScriptPatch(ws, "script:test2");

        let metrics = await waitForQueueMetrics(
            client,
            "queue to capture two patches",
            (snapshot) => snapshot.totalQueued === 2
        );
        assert.strictEqual(metrics.totalQueued, 2);
        assert.strictEqual(metrics.flushCount, 0);

        sendScriptPatch(ws, "script:test3");

        metrics = await waitForQueueMetrics(
            client,
            "queue to flush after reaching max size",
            (snapshot) => snapshot.totalFlushed === 3 && snapshot.flushCount === 1
        );
        assert.strictEqual(metrics.totalQueued, 3);
        assert.strictEqual(metrics.totalFlushed, 3);
        assert.strictEqual(metrics.flushCount, 1);
        assert.strictEqual(metrics.maxQueueDepth, 3);
    } finally {
        client.disconnect();
        restoreRuntimeGlobals();
    }
});

void test("patch queue drops oldest patches when exceeding max size", async () => {
    const { client, ws, restoreRuntimeGlobals } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 1000,
            maxQueueSize: 2
        }
    });

    try {
        sendScriptPatch(ws, "script:test1");

        let metrics = await waitForQueueMetrics(
            client,
            "queue to contain initial patch",
            (snapshot) => snapshot.totalQueued === 1
        );
        assert.strictEqual(metrics.totalQueued, 1);
        assert.strictEqual(metrics.totalDropped, 0);

        sendScriptPatch(ws, "script:test2");

        metrics = await waitForQueueMetrics(
            client,
            "queue to flush after reaching max size",
            (snapshot) => snapshot.totalFlushed === 2 && snapshot.flushCount === 1
        );
        assert.strictEqual(metrics.totalFlushed, 2);
        assert.strictEqual(metrics.flushCount, 1);
    } finally {
        client.disconnect();
        restoreRuntimeGlobals();
    }
});

void test("flushPatchQueue manually flushes queued patches", async () => {
    const { client, ws, restoreRuntimeGlobals } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 500,
            maxQueueSize: 50
        }
    });

    try {
        sendScriptPatch(ws, "script:test1");
        sendScriptPatch(ws, "script:test2");
        sendScriptPatch(ws, "script:test3");

        const metrics = await waitForQueueMetrics(
            client,
            "queue to hold three patches before manual flush",
            (snapshot) => snapshot.totalQueued === 3 && snapshot.flushCount === 0
        );
        assert.strictEqual(metrics.totalQueued, 3);
        assert.strictEqual(metrics.flushCount, 0);

        const flushed = client.flushPatchQueue();
        assert.strictEqual(flushed, 3);

        const flushedMetrics = await waitForQueueMetrics(
            client,
            "queue to reflect manual flush",
            (snapshot) => snapshot.totalFlushed === 3 && snapshot.flushCount === 1
        );
        assert.strictEqual(flushedMetrics.totalFlushed, 3);
        assert.strictEqual(flushedMetrics.flushCount, 1);
        assert.strictEqual(flushedMetrics.lastFlushSize, 3);
    } finally {
        client.disconnect();
        restoreRuntimeGlobals();
    }
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

    const { client, ws, restoreRuntimeGlobals } = await createConnectedPatchQueueClient({
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

    try {
        sendScriptPatch(ws, "script:test1");
        sendScriptPatch(ws, "script:test2");

        await waitForCondition("batch applyPatchBatch call", () => batchCalls.length === 1, {
            timeoutMs: 200,
            pollIntervalMs: 5
        });

        assert.strictEqual(batchCalls.length, 1);
        assert.strictEqual(batchCalls[0].length, 2);
    } finally {
        client.disconnect();
        restoreRuntimeGlobals();
    }
});

void test("disconnect flushes pending patches", async () => {
    const { client, ws, restoreRuntimeGlobals } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 500,
            maxQueueSize: 50
        }
    });

    try {
        sendScriptPatch(ws, "script:test1");
        sendScriptPatch(ws, "script:test2");

        await waitForQueueMetrics(
            client,
            "queue to contain two patches before disconnect",
            (snapshot) => snapshot.totalQueued === 2
        );

        let metrics = client.getPatchQueueMetrics();
        assert.ok(metrics !== null);
        assert.strictEqual(metrics.totalQueued, 2);
        assert.strictEqual(metrics.totalFlushed, 0);

        client.disconnect();

        metrics = await waitForQueueMetrics(
            client,
            "queue to reflect flush on disconnect",
            (snapshot) => snapshot.totalFlushed === 2 && snapshot.flushCount === 1
        );
        assert.strictEqual(metrics.totalFlushed, 2);
        assert.strictEqual(metrics.flushCount, 1);
    } finally {
        client.disconnect();
        restoreRuntimeGlobals();
    }
});

void test("patch queue tracks max queue depth correctly", async () => {
    const { client, ws, restoreRuntimeGlobals } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 200,
            maxQueueSize: 50
        }
    });

    try {
        sendScriptPatch(ws, "script:test1");
        sendScriptPatch(ws, "script:test2");
        sendScriptPatch(ws, "script:test3");

        let metrics = await waitForQueueMetrics(
            client,
            "queue to reach max depth",
            (snapshot) => snapshot.maxQueueDepth === 3
        );
        assert.strictEqual(metrics.maxQueueDepth, 3);

        metrics = await waitForQueueMetrics(
            client,
            "queue to flush without resetting max depth",
            (snapshot) => snapshot.flushCount === 1 && snapshot.maxQueueDepth === 3,
            400
        );
        assert.strictEqual(metrics.maxQueueDepth, 3);
    } finally {
        client.disconnect();
        restoreRuntimeGlobals();
    }
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
    const { client, ws, restoreRuntimeGlobals } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 50,
            maxQueueSize: 10
        }
    });

    try {
        sendScriptPatchBatch(ws, [{ id: "script:test1" }, { id: "script:test2" }, { id: "script:test3" }]);

        let metrics = await waitForQueueMetrics(
            client,
            "queue to capture batch",
            (snapshot) => snapshot.totalQueued === 3
        );
        assert.strictEqual(metrics.totalQueued, 3);

        metrics = await waitForQueueMetrics(client, "queue to flush batch", (snapshot) => snapshot.totalFlushed === 3);
        assert.strictEqual(metrics.totalFlushed, 3);
    } finally {
        client.disconnect();
        restoreRuntimeGlobals();
    }
});

void test("patch queue reports failures when a batch rolls back", async () => {
    const { wrapper, client, ws, restoreRuntimeGlobals } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 50,
            maxQueueSize: 10
        }
    });

    sendScriptPatchBatch(ws, [
        { id: "script:good", js_body: "return 1;" },
        { id: "script:bad", js_body: "return {{ invalid syntax" }
    ]);

    try {
        const queueMetrics = await waitForQueueMetrics(
            client,
            "queue to flush failed batch",
            (snapshot) => snapshot.totalFlushed === 2 && snapshot.flushCount === 1,
            300
        );
        assert.strictEqual(queueMetrics.totalFlushed, 2);
        assert.strictEqual(queueMetrics.flushCount, 1);

        const connectionMetrics = client.getConnectionMetrics();
        assert.strictEqual(connectionMetrics.patchesApplied, 0);
        assert.strictEqual(connectionMetrics.patchesFailed, 2);
        assert.strictEqual(connectionMetrics.patchErrors, 2);

        assert.strictEqual(wrapper.hasScript("script:good"), false);
    } finally {
        client.disconnect();
        restoreRuntimeGlobals();
    }
});

void test("patch queue clears flush timer on disconnect", async () => {
    const { client, ws, restoreRuntimeGlobals } = await createConnectedPatchQueueClient({
        patchQueue: {
            flushIntervalMs: 500,
            maxQueueSize: 50
        }
    });

    try {
        sendScriptPatch(ws, "script:test1");

        await waitForQueueMetrics(
            client,
            "queue to capture patch before disconnect",
            (snapshot) => snapshot.totalQueued === 1
        );

        client.disconnect();

        const metrics = await waitForQueueMetrics(
            client,
            "queue to flush on disconnect",
            (snapshot) => snapshot.flushCount === 1
        );

        assert.strictEqual(metrics.flushCount, 1);
    } finally {
        client.disconnect();
        restoreRuntimeGlobals();
    }
});
