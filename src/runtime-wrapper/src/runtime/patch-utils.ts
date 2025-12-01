import type {
    ApplyPatchResult,
    ClosurePatch,
    EventPatch,
    Patch,
    PatchSnapshot,
    RuntimeFunction,
    RuntimeRegistry,
    RuntimeRegistryOverrides,
    ScriptPatch,
    ShadowTestResult
} from "./types.js";

export function createRegistry(
    overrides?: RuntimeRegistryOverrides
): RuntimeRegistry {
    return {
        version: overrides?.version ?? 0,
        scripts: overrides?.scripts ?? Object.create(null),
        events: overrides?.events ?? Object.create(null),
        closures: overrides?.closures ?? Object.create(null)
    };
}

export function validatePatch(patch: unknown): asserts patch is Patch {
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

    const kindValue = candidate.kind;
    if (typeof kindValue !== "string") {
        throw new TypeError("Patch 'kind' must be a string");
    }
    const kind = kindValue;
    if (!isSupportedPatchKind(kind)) {
        throw new TypeError(`Unsupported patch kind: ${kind}`);
    }

    const idValue = candidate.id;
    if (!idValue || typeof idValue !== "string") {
        throw new TypeError("Patch must specify an 'id' string");
    }
}

export function applyPatchToRegistry(
    registry: RuntimeRegistry,
    patch: Patch
): RuntimeRegistry {
    switch (patch.kind) {
        case "script": {
            return applyScriptPatch(registry, patch);
        }
        case "event": {
            return applyEventPatch(registry, patch);
        }
        case "closure": {
            return applyClosurePatch(registry, patch);
        }
        default: {
            return registry;
        }
    }
}

export function captureSnapshot(
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
            snapshot.previous = registry.scripts[patch.id] ?? null;
            break;
        }
        case "event": {
            snapshot.previous = registry.events[patch.id] ?? null;
            break;
        }
        case "closure": {
            snapshot.previous = registry.closures[patch.id] ?? null;
            break;
        }
        // No default
    }

    return snapshot;
}

export function restoreSnapshot(
    registry: RuntimeRegistry,
    snapshot: PatchSnapshot
): RuntimeRegistry {
    switch (snapshot.kind) {
        case "script": {
            return restoreEntry(registry, snapshot, "scripts");
        }
        case "event": {
            return restoreEntry(registry, snapshot, "events");
        }
        case "closure": {
            return restoreEntry(registry, snapshot, "closures");
        }
        default: {
            return registry;
        }
    }
}

export function testPatchInShadow(patch: Patch): ShadowTestResult {
    const shadowRegistry = createRegistry();

    try {
        applyPatchToRegistry(shadowRegistry, patch);
        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            error:
                error instanceof Error
                    ? error.message
                    : String(error ?? "Unknown error")
        };
    }
}

export function applyPatchInternal(
    stateRegistry: RuntimeRegistry,
    patch: Patch
): { registry: RuntimeRegistry; result: ApplyPatchResult } {
    const updatedRegistry = applyPatchToRegistry(stateRegistry, patch);

    const nextRegistry: RuntimeRegistry = {
        ...updatedRegistry,
        version: stateRegistry.version + 1
    };

    return {
        registry: nextRegistry,
        result: { success: true, version: nextRegistry.version }
    };
}

function applyScriptPatch(
    registry: RuntimeRegistry,
    patch: ScriptPatch
): RuntimeRegistry {
    if (!patch.js_body || typeof patch.js_body !== "string") {
        throw new TypeError("Script patch must have a 'js_body' string");
    }

    const fn = new Function(
        "self",
        "other",
        "args",
        patch.js_body
    ) as RuntimeFunction;

    return {
        ...registry,
        scripts: {
            ...registry.scripts,
            [patch.id]: fn
        }
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
    const fn = new Function(
        thisName,
        argsDecl,
        patch.js_body
    ) as RuntimeFunction;

    const eventWrapper = function (...incomingArgs: Array<unknown>) {
        return fn.call(this, this, ...incomingArgs);
    };

    return {
        ...registry,
        events: {
            ...registry.events,
            [patch.id]: eventWrapper
        }
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

    return {
        ...registry,
        closures: {
            ...registry.closures,
            [patch.id]: fn
        }
    };
}

function restoreEntry(
    registry: RuntimeRegistry,
    snapshot: PatchSnapshot,
    key: "scripts" | "events" | "closures"
): RuntimeRegistry {
    const collection = { ...registry[key] };

    if (snapshot.previous) {
        collection[snapshot.id] = snapshot.previous;
    } else {
        delete collection[snapshot.id];
    }

    return {
        ...registry,
        [key]: collection
    };
}

function isSupportedPatchKind(value: string): value is Patch["kind"] {
    return value === "script" || value === "event" || value === "closure";
}
