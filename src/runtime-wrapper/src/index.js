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

export function createRuntimeWrapper({ registry, onPatchApplied } = {}) {
    const state = {
        registry: registry ?? {
            version: 0,
            scripts: Object.create(null),
            events: Object.create(null),
            closures: Object.create(null)
        },
        undoStack: [],
        patchHistory: []
    };

    function applyPatch(patch) {
        validatePatch(patch);

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

    return {
        state,
        applyPatch,
        undo,
        getPatchHistory,
        getRegistrySnapshot,
        getPatchStats
    };
}
