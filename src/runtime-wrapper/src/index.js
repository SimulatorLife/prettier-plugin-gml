// WIP HTML5 runtime hot wrapper

function validatePatch(patch) {
    if (!patch || typeof patch !== "object") {
        throw new TypeError("applyPatch expects a patch object");
    }

    if (!patch.kind) {
        throw new TypeError("Patch must have a 'kind' field");
    }

    if (!patch.id) {
        throw new TypeError("Patch must have an 'id' field");
    }
}

function applyScriptPatch(registry, patch) {
    if (!patch.js_body || typeof patch.js_body !== "string") {
        throw new TypeError("Script patch must have a 'js_body' string");
    }

    const fn = new Function("self", "other", "args", patch.js_body);
    const updatedScripts = { ...registry.scripts, [patch.id]: fn };

    return {
        ...registry,
        scripts: updatedScripts
    };
}

function applyEventPatch(registry, patch) {
    if (!patch.js_body || typeof patch.js_body !== "string") {
        throw new TypeError("Event patch must have a 'js_body' string");
    }

    const thisName = patch.this_name || "self";
    const argsDecl = patch.js_args || "";
    const fn = new Function(thisName, argsDecl, patch.js_body);

    const eventWrapper = function () {
        return fn.call(this);
    };

    const updatedEvents = { ...registry.events, [patch.id]: eventWrapper };

    return {
        ...registry,
        events: updatedEvents
    };
}

function captureSnapshot(registry, patch) {
    const snapshot = {
        id: patch.id,
        kind: patch.kind,
        version: registry.version
    };

    if (patch.kind === "script") {
        snapshot.previous = registry.scripts[patch.id] || null;
    } else if (patch.kind === "event") {
        snapshot.previous = registry.events[patch.id] || null;
    }

    return snapshot;
}

function restoreSnapshot(registry, snapshot) {
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

    return registry;
}

function testPatchInShadow(patch) {
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
            default: {
                throw new Error(`Unsupported patch kind: ${patch.kind}`);
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
} = {}) {
    const state = {
        registry: registry ?? {
            version: 0,
            scripts: Object.create(null),
            events: Object.create(null),
            closures: Object.create(null)
        },
        undoStack: [],
        patchHistory: [],
        options: {
            validateBeforeApply
        }
    };

    function applyPatch(patch) {
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
            let updatedRegistry;
            switch (patch.kind) {
                case "script": {
                    updatedRegistry = applyScriptPatch(state.registry, patch);
                    break;
                }
                case "event": {
                    updatedRegistry = applyEventPatch(state.registry, patch);
                    break;
                }
                default: {
                    throw new Error(`Unsupported patch kind: ${patch.kind}`);
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
            throw new Error(
                `Failed to apply patch ${patch.id}: ${error.message}`
            );
        }
    }

    function undo() {
        if (state.undoStack.length === 0) {
            return { success: false, message: "Nothing to undo" };
        }

        const snapshot = state.undoStack.pop();
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

    function trySafeApply(patch, onValidate) {
        validatePatch(patch);

        const testResult = testPatchInShadow(patch);
        if (!testResult.valid) {
            return {
                success: false,
                error: testResult.error,
                message: `Shadow validation failed: ${testResult.error}`
            };
        }

        if (onValidate && typeof onValidate === "function") {
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
                return {
                    success: false,
                    error: error.message,
                    message: `Custom validation failed: ${error.message}`
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

            state.patchHistory.push({
                patch: {
                    kind: patch.kind,
                    id: patch.id
                },
                version: state.registry.version,
                timestamp: Date.now(),
                action: "rollback",
                error: error.message
            });

            return {
                success: false,
                error: error.message,
                message: `Patch failed and was rolled back: ${error.message}`,
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

    function getPatchStats() {
        const stats = {
            totalPatches: state.patchHistory.length,
            appliedPatches: 0,
            undonePatches: 0,
            scriptPatches: 0,
            eventPatches: 0,
            uniqueIds: new Set()
        };

        for (const entry of state.patchHistory) {
            if (entry.action === "apply") {
                stats.appliedPatches++;
            } else if (entry.action === "undo") {
                stats.undonePatches++;
            }

            if (entry.patch.kind === "script") {
                stats.scriptPatches++;
            } else if (entry.patch.kind === "event") {
                stats.eventPatches++;
            }

            stats.uniqueIds.add(entry.patch.id);
        }

        stats.uniqueIds = stats.uniqueIds.size;

        return stats;
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
        hasEvent
    };
}

export function createWebSocketClient({
    url = "ws://127.0.0.1:17890",
    wrapper,
    onConnect,
    onDisconnect,
    onError,
    reconnectDelay = 800,
    autoConnect = true
} = {}) {
    const state = {
        ws: null,
        isConnected: false,
        reconnectTimer: null,
        manuallyDisconnected: false
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
                if (onConnect) {
                    onConnect();
                }
            });

            state.ws.addEventListener("message", (event) => {
                if (!wrapper) {
                    return;
                }

                try {
                    const patch = JSON.parse(event.data);
                    if (!patch || !patch.kind) {
                        return;
                    }
                    wrapper.applyPatch(patch);
                } catch (error) {
                    if (onError) {
                        onError(error, "patch");
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
                onError(error, "connection");
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

    function isConnected() {
        return state.isConnected;
    }

    function send(data) {
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
