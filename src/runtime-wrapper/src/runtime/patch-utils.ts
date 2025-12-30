import type {
    ApplyPatchResult,
    ClosurePatch,
    EventPatch,
    Patch,
    PatchHistoryEntry,
    PatchSnapshot,
    RuntimeFunction,
    RuntimeRegistry,
    RuntimeRegistryOverrides,
    ScriptPatch,
    ShadowTestResult
} from "./types.js";

const APPROXIMATE_EQUALITY_SCALE_MULTIPLIER = 4;

function areNumbersApproximatelyEqual(a: number, b: number): boolean {
    if (a === b) {
        return true;
    }

    if (!Number.isFinite(a) || !Number.isFinite(b)) {
        return false;
    }

    const scale = Math.max(1, Math.abs(a), Math.abs(b));
    const tolerance =
        Number.EPSILON * scale * APPROXIMATE_EQUALITY_SCALE_MULTIPLIER;
    return Math.abs(a - b) <= tolerance;
}

type RuntimeBindingGlobals = {
    JSON_game?: {
        ScriptNames?: Array<string>;
        Scripts?: Array<RuntimeFunction>;
        GMObjects?: Array<Record<string, unknown>>;
    };
};

function resolveRuntimeId(patch: ScriptPatch): string {
    const candidate = (patch as { runtimeId?: unknown }).runtimeId;
    if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
    }

    return patch.id;
}

function resolveRuntimeBindingNames(runtimeId: string): Array<string> {
    if (runtimeId.startsWith("gml/script/")) {
        const name = runtimeId.slice("gml/script/".length);
        if (!name) {
            return [];
        }
        return [`gml_Script_${name}`, `gml_GlobalScript_${name}`];
    }

    if (runtimeId.startsWith("gml/object/")) {
        const parts = runtimeId.split("/");
        if (parts.length >= 4) {
            return [`gml_Object_${parts[2]}_${parts[3]}`];
        }
        return [];
    }

    return [runtimeId];
}

function applyRuntimeBindings(patch: ScriptPatch, fn: RuntimeFunction): void {
    const runtimeId = resolveRuntimeId(patch);
    const targetNames = resolveRuntimeBindingNames(runtimeId);
    if (targetNames.length === 0) {
        return;
    }

    const globalScope = globalThis as RuntimeBindingGlobals &
        Record<string, unknown>;
    const jsonGame = globalScope.JSON_game;
    const scriptNames = jsonGame?.ScriptNames;
    const scripts = jsonGame?.Scripts;
    const gmObjects = jsonGame?.GMObjects;

    for (const name of targetNames) {
        if (
            typeof globalScope[name] === "function" ||
            (Array.isArray(scriptNames) && scriptNames.includes(name))
        ) {
            globalScope[name] = fn;
        }

        if (Array.isArray(scriptNames) && Array.isArray(scripts)) {
            const scriptIndex = scriptNames.indexOf(name);
            if (scriptIndex !== -1 && scriptIndex < scripts.length) {
                scripts[scriptIndex] = fn;
            }
        }

        if (Array.isArray(gmObjects)) {
            for (const objectEntry of gmObjects) {
                for (const [key, value] of Object.entries(objectEntry)) {
                    if (typeof value === "function" && value.name === name) {
                        objectEntry[key] = fn;
                    }
                }
            }
        }
    }
}

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
    applyRuntimeBindings(patch, fn);

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

export function calculateTimingMetrics(durations: Array<number>): {
    totalDurationMs: number;
    averagePatchDurationMs: number;
    fastestPatchMs: number;
    slowestPatchMs: number;
    p50DurationMs: number;
    p90DurationMs: number;
    p99DurationMs: number;
} | null {
    if (durations.length === 0) {
        return null;
    }

    let totalDurationMs = 0;
    let fastestPatchMs = durations[0];
    let slowestPatchMs = durations[0];

    for (const duration of durations) {
        totalDurationMs += duration;
        if (duration < fastestPatchMs) {
            fastestPatchMs = duration;
        }
        if (duration > slowestPatchMs) {
            slowestPatchMs = duration;
        }
    }

    const sorted = [...durations].toSorted((a, b) => a - b);
    const p50DurationMs = calculatePercentile(sorted, 50);
    const p90DurationMs = calculatePercentile(sorted, 90);
    const p99DurationMs = calculatePercentile(sorted, 99);

    return {
        totalDurationMs,
        averagePatchDurationMs: totalDurationMs / durations.length,
        fastestPatchMs,
        slowestPatchMs,
        p50DurationMs,
        p90DurationMs,
        p99DurationMs
    };
}

function calculatePercentile(
    sorted: Array<number>,
    percentile: number
): number {
    if (sorted.length === 0) {
        return 0;
    }

    if (sorted.length === 1) {
        return sorted[0];
    }

    const index = (percentile / 100) * (sorted.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    // If the fractional index is extremely close to an integer, return the
    // nearest element instead of performing an interpolation that can produce
    // slightly off values (especially when the neighbouring samples are far
    // apart). Floating-point precision can produce values like
    // 8.999999999999998 instead of an exact 9, so we compare the raw index to
    // its rounded integer rather than comparing floor/ceil directly.
    const nearest = Math.round(index);
    if (areNumbersApproximatelyEqual(index, nearest)) {
        return sorted[nearest];
    }

    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function collectPatchDurations(
    history: Array<PatchHistoryEntry>
): Array<number> {
    const durations: Array<number> = [];

    for (const entry of history) {
        if (entry.action === "apply" && entry.durationMs !== undefined) {
            durations.push(entry.durationMs);
        }
    }

    return durations;
}
