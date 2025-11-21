// WIP HTML5 runtime hot wrapper

declare function structuredClone<T>(value: T): T;

type RuntimeFunction = (...args: Array<unknown>) => unknown;

type PatchKind = "script" | "event" | "closure";

interface BasePatch {
    kind: PatchKind;
    id: string;
}

interface ScriptPatch extends BasePatch {
    kind: "script";
    js_body: string;
}

interface EventPatch extends BasePatch {
    kind: "event";
    js_body: string;
    this_name?: string;
    js_args?: string;
}

interface ClosurePatch extends BasePatch {
    kind: "closure";
    js_body: string;
}

type Patch = ScriptPatch | EventPatch | ClosurePatch;

interface RuntimeRegistry {
    version: number;
    scripts: Record<string, RuntimeFunction>;
    events: Record<string, RuntimeFunction>;
    closures: Record<string, RuntimeFunction>;
}

interface PatchSnapshot {
    kind: PatchKind;
    id: string;
    version: number;
    previous: RuntimeFunction | null;
}

type PatchAction = "apply" | "undo" | "rollback";

interface PatchHistoryEntry {
    patch: Pick<BasePatch, "kind" | "id">;
    version: number;
    timestamp: number;
    action: PatchAction;
    error?: string;
    rolledBack?: boolean;
}

interface RuntimeWrapperOptions {
    registry?: Partial<RuntimeRegistry>;
    onPatchApplied?: (patch: Patch, version: number) => void;
    validateBeforeApply?: boolean;
}

	interface RuntimeWrapper {
	    state: RuntimeWrapperState;
	    applyPatch(patch: unknown): { success: true; version: number };
	    trySafeApply(
	        patch: unknown,
	        onValidate?: (patch: Patch) => boolean | void
	    ): TrySafeApplyResult;
    undo(): { success: boolean; version?: number; message?: string };
    getPatchHistory(): Array<PatchHistoryEntry>;
    getRegistrySnapshot(): {
        version: number;
        scriptCount: number;
        eventCount: number;
        closureCount: number;
        scripts: Array<string>;
        events: Array<string>;
        closures: Array<string>;
    };
    getPatchStats(): PatchStats;
    getVersion(): number;
    getScript(id: string): RuntimeFunction | undefined;
    getEvent(id: string): RuntimeFunction | undefined;
    hasScript(id: string): boolean;
    hasEvent(id: string): boolean;
    getClosure(id: string): RuntimeFunction | undefined;
    hasClosure(id: string): boolean;
}

interface RuntimeWrapperState {
    registry: RuntimeRegistry;
    undoStack: Array<PatchSnapshot>;
    patchHistory: Array<PatchHistoryEntry>;
    options: {
        validateBeforeApply: boolean;
    };
}

interface PatchStats {
    totalPatches: number;
    appliedPatches: number;
    undonePatches: number;
    scriptPatches: number;
    eventPatches: number;
    closurePatches: number;
    uniqueIds: number;
}

interface TrySafeApplyResult {
    success: boolean;
    version?: number;
    error?: string;
    message?: string;
    rolledBack?: boolean;
}

type ApplyPatchResult = { success: true; version: number };

type RuntimePatchError = Error & { patch?: Patch; rolledBack?: boolean };

interface WebSocketClientOptions {
    url?: string;
    wrapper?: RuntimeWrapper | null;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error & { patch?: Patch; rolledBack?: boolean }, phase: "connection" | "patch") => void;
    reconnectDelay?: number;
    autoConnect?: boolean;
}

interface WebSocketClientState {
    ws: WebSocket | null;
    isConnected: boolean;
    reconnectTimer: ReturnType<typeof setTimeout> | null;
    manuallyDisconnected: boolean;
}

function validatePatch(patch: unknown): asserts patch is Patch {
    if (!patch || typeof patch !== "object") {
        throw new TypeError("applyPatch expects a patch object");
    }

    const candidate = patch as Record<string, unknown>;

    if (!("kind" in candidate)) {
        throw new TypeError("Patch must have a 'kind' field");
    }

    if (!("id" in candidate)) {
        throw new TypeError("Patch must have an 'id' field");
    }

    const kind = candidate.kind;
    if (!kind || !["script", "event", "closure"].includes(String(kind))) {
        throw new TypeError("Patch must specify a supported kind");
    }

    const idValue = candidate.id;
    if (!idValue || typeof idValue !== "string") {
        throw new TypeError("Patch must specify an 'id' string");
    }
}

function applyScriptPatch(
    registry: RuntimeRegistry,
    patch: ScriptPatch
): RuntimeRegistry {
    if (!patch.js_body || typeof patch.js_body !== "string") {
        throw new TypeError("Script patch must have a 'js_body' string");
    }

    const fn = new Function("self", "other", "args", patch.js_body) as RuntimeFunction;
    const updatedScripts = { ...registry.scripts, [patch.id]: fn };

    return {
        ...registry,
        scripts: updatedScripts
    };
}

function applyEventPatch(
    registry: RuntimeRegistry,
    patch: EventPatch
): RuntimeRegistry {
    if (!patch.js_body || typeof patch.js_body !== "string") {
        throw new TypeError("Event patch must have a 'js_body' string");
    }

    const thisName = patch.this_name || "self";
    const argsDecl = patch.js_args || "";
    const fn = new Function(thisName, argsDecl, patch.js_body) as RuntimeFunction;

    const eventWrapper = function (...incomingArgs) {
        return fn.call(this, this, ...incomingArgs);
    };

    const updatedEvents = { ...registry.events, [patch.id]: eventWrapper };

    return {
        ...registry,
        events: updatedEvents
    };
}

function applyClosurePatch(
    registry: RuntimeRegistry,
    patch: ClosurePatch
): RuntimeRegistry {
    if (!patch.js_body || typeof patch.js_body !== "string") {
        throw new TypeError("Closure patch must have a 'js_body' string");
    }

    const fn = new Function("...args", patch.js_body) as RuntimeFunction;
    const updatedClosures = { ...registry.closures, [patch.id]: fn };

    return {
        ...registry,
        closures: updatedClosures
    };
}

function captureSnapshot(
    registry: RuntimeRegistry,
    patch: Patch
): PatchSnapshot {
    const snapshot: PatchSnapshot = {
        id: patch.id,
        kind: patch.kind,
        version: registry.version,
        previous: null
    };

    switch (patch.kind) {
        case "script": {
            snapshot.previous = registry.scripts[patch.id] || null;

            break;
        }
        case "event": {
            snapshot.previous = registry.events[patch.id] || null;

            break;
        }
        case "closure": {
            snapshot.previous = registry.closures[patch.id] || null;

            break;
        }
        // No default
    }

    return snapshot;
}

function restoreSnapshot(
    registry: RuntimeRegistry,
    snapshot: PatchSnapshot
): RuntimeRegistry {
    if (snapshot.kind === "script") {
        const updatedScripts = { ...registry.scripts };
        if (snapshot.previous) {
            updatedScripts[snapshot.id] = snapshot.previous;
        } else {
            delete updatedScripts[snapshot.id];
        }
        return {
            ...registry,
            scripts: updatedScripts
        };
    }

    if (snapshot.kind === "event") {
        const updatedEvents = { ...registry.events };
        if (snapshot.previous) {
            updatedEvents[snapshot.id] = snapshot.previous;
        } else {
            delete updatedEvents[snapshot.id];
        }
        return {
            ...registry,
            events: updatedEvents
        };
    }

    if (snapshot.kind === "closure") {
        const updatedClosures = { ...registry.closures };
        if (snapshot.previous) {
            updatedClosures[snapshot.id] = snapshot.previous;
        } else {
            delete updatedClosures[snapshot.id];
        }
        return {
            ...registry,
            closures: updatedClosures
        };
    }

    return registry;
}

function testPatchInShadow(patch: Patch) {
    const shadowRegistry = {
        version: 0,
        scripts: Object.create(null),
        events: Object.create(null),
        closures: Object.create(null)
    };

    try {
        switch (patch.kind) {
            case "script": {
                applyScriptPatch(shadowRegistry, patch);
                break;
            }
            case "event": {
                applyEventPatch(shadowRegistry, patch);
                break;
            }
            case "closure": {
                applyClosurePatch(shadowRegistry, patch);
                break;
            }
            default: {
                throw new Error("Unsupported patch kind");
            }
        }
        return { valid: true };
    } catch (error) {
        return { valid: false, error: error.message };
    }
}

export function createRuntimeWrapper({
    registry,
    onPatchApplied,
    validateBeforeApply = false
}: RuntimeWrapperOptions = {}): RuntimeWrapper {
    const baseRegistry: RuntimeRegistry = {
        version: registry?.version ?? 0,
        scripts:
            registry?.scripts ??
            (Object.create(null) as Record<string, RuntimeFunction>),
        events:
            registry?.events ??
            (Object.create(null) as Record<string, RuntimeFunction>),
        closures:
            registry?.closures ??
            (Object.create(null) as Record<string, RuntimeFunction>)
    };

    const state: RuntimeWrapperState = {
        registry: baseRegistry,
        undoStack: [],
        patchHistory: [],
        options: {
            validateBeforeApply
        }
    };

    function applyPatch(patch: unknown): ApplyPatchResult {
        validatePatch(patch);

        if (state.options.validateBeforeApply) {
            const testResult = testPatchInShadow(patch);
            if (!testResult.valid) {
                throw new Error(
                    `Patch validation failed for ${patch.id}: ${testResult.error}`
                );
            }
        }

        const snapshot = captureSnapshot(state.registry, patch);
        const timestamp = Date.now();

        try {
            let updatedRegistry: RuntimeRegistry;
            switch (patch.kind) {
                case "script": {
                    updatedRegistry = applyScriptPatch(state.registry, patch);
                    break;
                }
                case "event": {
                    updatedRegistry = applyEventPatch(state.registry, patch);
                    break;
                }
                case "closure": {
                    updatedRegistry = applyClosurePatch(state.registry, patch);
                    break;
                }
                default: {
                    throw new Error("Unsupported patch kind");
                }
            }

            state.registry = {
                ...updatedRegistry,
                version: updatedRegistry.version + 1
            };
            state.undoStack.push(snapshot);
            state.patchHistory.push({
                patch: {
                    kind: patch.kind,
                    id: patch.id
                },
                version: state.registry.version,
                timestamp,
                action: "apply"
            });

            if (onPatchApplied) {
                onPatchApplied(patch, state.registry.version);
            }

            return { success: true, version: state.registry.version };
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error ?? "Unknown error");
            throw new Error(`Failed to apply patch ${patch.id}: ${message}`);
        }
    }

    function undo(): { success: boolean; version?: number; message?: string } {
        if (state.undoStack.length === 0) {
            return { success: false, message: "Nothing to undo" };
        }

        const snapshot = state.undoStack.pop()!;
        const updatedRegistry = restoreSnapshot(state.registry, snapshot);

        state.registry = {
            ...updatedRegistry,
            version: updatedRegistry.version + 1
        };

        state.patchHistory.push({
            patch: {
                kind: snapshot.kind,
                id: snapshot.id
            },
            version: state.registry.version,
            timestamp: Date.now(),
            action: "undo"
        });

        return { success: true, version: state.registry.version };
    }

    function trySafeApply(
        patch: unknown,
        onValidate?: (patch: Patch) => boolean | void
    ): TrySafeApplyResult {
        validatePatch(patch);

        const testResult = testPatchInShadow(patch);
        if (!testResult.valid) {
            return {
                success: false,
                error: testResult.error,
                message: `Shadow validation failed: ${testResult.error}`
            };
        }

        if (onValidate) {
            try {
                const validationResult = onValidate(patch);
                if (validationResult === false) {
                    return {
                        success: false,
                        error: "Custom validation rejected patch",
                        message: "Custom validation callback returned false"
                    };
                }
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : String(error ?? "Unknown error");
                return {
                    success: false,
                    error: message,
                    message: `Custom validation failed: ${message}`
                };
            }
        }

        const snapshot = captureSnapshot(state.registry, patch);
        const previousVersion = state.registry.version;

        try {
            const result = applyPatch(patch);
            return {
                success: true,
                version: result.version,
                rolledBack: false
            };
        } catch (error) {
            const restoredRegistry = restoreSnapshot(state.registry, snapshot);
            state.registry = {
                ...restoredRegistry,
                version: previousVersion
            };

            const message =
                error instanceof Error
                    ? error.message
                    : String(error ?? "Unknown error");

            state.patchHistory.push({
                patch: {
                    kind: patch.kind,
                    id: patch.id
                },
                version: state.registry.version,
                timestamp: Date.now(),
                action: "rollback",
                error: message
            });

            return {
                success: false,
                error: message,
                message: `Patch failed and was rolled back: ${message}`,
                rolledBack: true
            };
        }
    }

    function getPatchHistory() {
        return [...state.patchHistory];
    }

    function getRegistrySnapshot() {
        return {
            version: state.registry.version,
            scriptCount: Object.keys(state.registry.scripts).length,
            eventCount: Object.keys(state.registry.events).length,
            closureCount: Object.keys(state.registry.closures).length,
            scripts: Object.keys(state.registry.scripts),
            events: Object.keys(state.registry.events),
            closures: Object.keys(state.registry.closures)
        };
    }

    function getPatchStats(): PatchStats {
        const stats = {
            totalPatches: state.patchHistory.length,
            appliedPatches: 0,
            undonePatches: 0,
            scriptPatches: 0,
            eventPatches: 0,
            closurePatches: 0
        };

        const uniqueIds = new Set<string>();

        for (const entry of state.patchHistory) {
            if (entry.action === "apply") {
                stats.appliedPatches++;
            } else if (entry.action === "undo") {
                stats.undonePatches++;
            }

            switch (entry.patch.kind) {
                case "script": {
                    stats.scriptPatches++;

                    break;
                }
                case "event": {
                    stats.eventPatches++;

                    break;
                }
                case "closure": {
                    stats.closurePatches++;

                    break;
                }
                // No default
            }

            uniqueIds.add(entry.patch.id);
        }

        return {
            ...stats,
            uniqueIds: uniqueIds.size
        };
    }

    function getVersion() {
        return state.registry.version;
    }

    function getScript(id) {
        return state.registry.scripts[id];
    }

    function getEvent(id) {
        return state.registry.events[id];
    }

    function hasScript(id) {
        return id in state.registry.scripts;
    }

    function hasEvent(id) {
        return id in state.registry.events;
    }

    function getClosure(id) {
        return state.registry.closures[id];
    }

    function hasClosure(id) {
        return id in state.registry.closures;
    }

    return {
        state,
        applyPatch,
        trySafeApply,
        undo,
        getPatchHistory,
        getRegistrySnapshot,
        getPatchStats,
        getVersion,
        getScript,
        getEvent,
        hasScript,
        hasEvent,
        getClosure,
        hasClosure
    };
}

export function createWebSocketClient({
    url = "ws://127.0.0.1:17890",
    wrapper = null,
    onConnect,
    onDisconnect,
    onError,
    reconnectDelay = 800,
    autoConnect = true
}: WebSocketClientOptions = {}) {
    const state: WebSocketClientState = {
        ws: null,
        isConnected: false,
        reconnectTimer: null,
        manuallyDisconnected: false
    };

    const applyIncomingPatch = (incoming: unknown): boolean => {
        if (
            !incoming ||
            typeof incoming !== "object" ||
            !("kind" in incoming) ||
            !("id" in incoming)
        ) {
            return true;
        }

        const patchCandidate = incoming as Record<string, unknown>;
        try {
            validatePatch(patchCandidate);
        } catch (error) {
            if (onError) {
                onError(
                    error instanceof Error
                        ? error
                        : new Error(String(error ?? "Unknown error")),
                    "patch"
                );
            }
            return false;
        }

        const patch = patchCandidate as Patch;

        if (wrapper && wrapper.trySafeApply) {
            try {
                const result = wrapper.trySafeApply(patch);

                if (!result || result.success !== true) {
                    const errorMessage =
                        result?.message ||
                        result?.error ||
                        `Failed to apply patch ${patch.id ?? "<unknown>"}`;
                    const safeError = new Error(
                        errorMessage
                    ) as RuntimePatchError;
                    safeError.patch = patch;
                    safeError.rolledBack = result?.rolledBack;

                    if (onError) {
                        onError(safeError, "patch");
                    }

                    return false;
                }

                return true;
            } catch (error) {
                const safeError = new Error(
                    error instanceof Error
                        ? error.message
                        : String(error ?? "Unknown error")
                ) as RuntimePatchError;
                safeError.patch = patch;
                safeError.rolledBack =
                    error && typeof error === "object" && "rolledBack" in error
                        ? (error as { rolledBack?: boolean }).rolledBack
                        : undefined;

                if (onError) {
                    onError(safeError, "patch");
                }

                return false;
            }
        }

        if (wrapper) {
            try {
                wrapper.applyPatch(patch);
                return true;
            } catch (error) {
                const safeError = new Error(
                    error instanceof Error
                        ? error.message
                        : String(error ?? "Unknown error")
                ) as RuntimePatchError;
                safeError.patch = patch;

                if (onError) {
                    onError(safeError, "patch");
                }

                return false;
            }
        }

        return true;
    };

    function connect() {
        if (state.ws && state.isConnected) {
            return;
        }

        state.manuallyDisconnected = false;

        try {
            state.ws = new WebSocket(url);

            state.ws.addEventListener("open", () => {
                state.isConnected = true;

                if (state.reconnectTimer) {
                    clearTimeout(state.reconnectTimer);
                    state.reconnectTimer = null;
                }

                if (onConnect) {
                    onConnect();
                }
            });

            state.ws.addEventListener("message", (event) => {
                if (!wrapper) {
                    return;
                }

                let payload: unknown;

                try {
                    payload = JSON.parse(event.data);
                } catch (error) {
                    if (onError) {
                        onError(
                            error instanceof Error
                                ? error
                                : new Error(String(error ?? "Unknown error")),
                            "patch"
                        );
                    }

                    return;
                }

                const patches = Array.isArray(payload) ? payload : [payload];

                for (const patch of patches) {
                    try {
                        const applied = applyIncomingPatch(patch);
                        if (!applied) {
                            break;
                        }
                    } catch (error) {
                        if (onError) {
                            onError(
                                error instanceof Error
                                    ? error
                                    : new Error(
                                          String(error ?? "Unknown error")
                                      ),
                                "patch"
                            );
                        }
                        break;
                    }
                }
            });

            state.ws.addEventListener("close", () => {
                state.isConnected = false;
                state.ws = null;

                if (onDisconnect) {
                    onDisconnect();
                }

                if (!state.manuallyDisconnected && reconnectDelay > 0) {
                    state.reconnectTimer = setTimeout(() => {
                        connect();
                    }, reconnectDelay);
                }
            });

            state.ws.addEventListener("error", () => {
                if (state.ws) {
                    state.ws.close();
                }
            });
        } catch (error) {
            if (onError) {
                onError(
                    error instanceof Error
                        ? error
                        : new Error(String(error ?? "Unknown error")),
                    "connection"
                );
            }
        }
    }

    function disconnect() {
        state.manuallyDisconnected = true;

        if (state.reconnectTimer) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }

        if (state.ws) {
            state.ws.close();
            state.ws = null;
        }

        state.isConnected = false;
    }

    function isConnected(): boolean {
        return state.isConnected;
    }

    function send(data: string | unknown) {
        if (!state.ws || !state.isConnected) {
            throw new Error("WebSocket is not connected");
        }

        const message = typeof data === "string" ? data : JSON.stringify(data);
        state.ws.send(message);
    }

    function getWebSocket() {
        return state.ws;
    }

    if (autoConnect) {
        connect();
    }

    return {
        connect,
        disconnect,
        isConnected,
        send,
        getWebSocket
    };
}
