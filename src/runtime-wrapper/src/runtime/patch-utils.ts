import { resolveBuiltinConstants } from "./builtin-constants.js";
import { areNumbersApproximatelyEqual, isErrorLike, isNonEmptyString } from "./runtime-core-helpers.js";
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

type RuntimeBindingGlobals = {
    JSON_game?: {
        ScriptNames?: Array<string>;
        Scripts?: Array<RuntimeFunction>;
        GMObjects?: Array<Record<string, unknown>>;
    };
    g_pBuiltIn?: Record<string, unknown>;
    _cx?: {
        _dx?: Record<string, unknown>;
    };
    g_RunRoom?: {
        m_Active?: {
            pool?: Array<unknown>;
        };
    };
    g_pObjectManager?: {
        objnamelist?: Record<string, unknown>;
        objidlist?: Array<unknown>;
    };
};

const EVENT_INDEX_MAP: Record<string, string> = {
    PreCreateEvent: "EVENT_PRE_CREATE",
    CreateEvent: "EVENT_CREATE",
    DestroyEvent: "EVENT_DESTROY",
    CleanUpEvent: "EVENT_CLEAN_UP",
    StepBeginEvent: "EVENT_STEP_BEGIN",
    StepNormalEvent: "EVENT_STEP_NORMAL",
    StepEndEvent: "EVENT_STEP_END",
    DrawEvent: "EVENT_DRAW",
    DrawGUI: "EVENT_DRAW_GUI",
    DrawEventBegin: "EVENT_DRAW_BEGIN",
    DrawEventEnd: "EVENT_DRAW_END",
    DrawGUIBegin: "EVENT_DRAW_GUI_BEGIN",
    DrawGUIEnd: "EVENT_DRAW_GUI_END"
};

function resolveInstanceStore(globalScope: RuntimeBindingGlobals): Record<string, unknown> | undefined {
    if (globalScope._cx?._dx) {
        return globalScope._cx._dx;
    }

    if (globalScope.g_RunRoom?.m_Active?.pool && Array.isArray(globalScope.g_RunRoom.m_Active.pool)) {
        return globalScope.g_RunRoom.m_Active.pool as unknown as Record<string, unknown>;
    }

    return undefined;
}

function resolveRuntimeId(patch: ScriptPatch): string {
    const candidate = (patch as { runtimeId?: unknown }).runtimeId;
    if (isNonEmptyString(candidate)) {
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

function resolveEventIndexName(eventKey: string): string | null {
    switch (eventKey) {
        case "PreCreateEvent": {
            return "_qI";
        }
        case "CreateEvent": {
            return "_rI";
        }
        case "DestroyEvent": {
            return "_tI";
        }
        case "CleanUpEvent": {
            return "_aI";
        }
        case "StepBeginEvent": {
            return "_sB2";
        }
        case "StepNormalEvent": {
            return "_uB2";
        }
        case "StepEndEvent": {
            return "_wB2";
        }
        case "DrawEvent": {
            return "_6E2";
        }
        case "DrawGUI": {
            return "_2G2";
        }
        case "DrawEventBegin": {
            return "_4G2";
        }
        case "DrawEventEnd": {
            return "_5G2";
        }
        case "DrawGUIBegin": {
            return "_6G2";
        }
        case "DrawGUIEnd": {
            return "_7G2";
        }
        default: {
            return null;
        }
    }
}

function resolveNamedFunctionId(runtimeId: string): string | null {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(runtimeId)) {
        return null;
    }

    return runtimeId;
}

function resolveObjectEventKey(eventName: string): string | null {
    if (eventName.startsWith("Create")) {
        return "CreateEvent";
    }
    if (eventName.startsWith("Step")) {
        return "StepNormalEvent";
    }
    if (eventName.startsWith("Draw")) {
        return "DrawEvent";
    }
    if (eventName.startsWith("Destroy")) {
        return "DestroyEvent";
    }

    return null;
}

function parseObjectRuntimeId(runtimeId: string): { objectName: string; eventName: string } | null {
    if (!runtimeId.startsWith("gml_Object_")) {
        return null;
    }

    const withoutPrefix = runtimeId.slice("gml_Object_".length);
    const parts = withoutPrefix.split("_");
    if (parts.length < 2) {
        return null;
    }

    const eventName = parts.slice(-2).join("_");
    const objectName = parts.slice(0, -2).join("_");
    if (!objectName || !eventName) {
        return null;
    }

    return { objectName, eventName };
}

function createNamedRuntimeFunction(runtimeId: string, rawFn: RuntimeFunction): RuntimeFunction {
    const name = resolveNamedFunctionId(runtimeId);
    if (!name) {
        return rawFn;
    }

    const wrapperFactory = new Function(
        "rawFn",
        `return function ${name}(self, other, args) { return rawFn(self, other, args); }`
    ) as (rawFn: RuntimeFunction) => RuntimeFunction;

    return wrapperFactory(rawFn);
}

function updateGMObjects(
    gmObjects: Array<Record<string, unknown>>,
    objectRuntime: { objectName: string; eventName: string } | null,
    objectEventKey: string | null,
    fn: RuntimeFunction,
    instanceKeysToUpdate: Set<string>,
    name: string
): string | null {
    let objectName: string | null = null;
    for (const objectEntry of gmObjects) {
        if (
            objectRuntime &&
            typeof objectEntry.pName === "string" &&
            objectEntry.pName === objectRuntime.objectName &&
            objectEventKey
        ) {
            objectEntry[objectEventKey] = fn;
            instanceKeysToUpdate.add(objectEventKey);
            if (!objectName) {
                objectName = objectRuntime.objectName;
            }
        }

        for (const [key, value] of Object.entries(objectEntry)) {
            if (typeof value === "function" && value.name === name) {
                objectEntry[key] = fn;
                instanceKeysToUpdate.add(key);

                if (!objectName) {
                    objectName = typeof objectEntry.pName === "string" ? objectEntry.pName : null;
                }
            }
        }
    }
    return objectName;
}

function updateInstance(
    instance: Record<string, unknown>,
    instanceKeysToUpdate: Set<string>,
    fn: RuntimeFunction,
    globalScope: RuntimeBindingGlobals & Record<string, unknown>,
    name: string
) {
    for (const key of instanceKeysToUpdate) {
        instance[key] = fn;

        // Also update the object definition (pObject) which the event loop uses
        const pObject = (instance as any).pObject || (instance as any)._kx;
        if (pObject && typeof pObject === "object") {
            if (pObject[key] !== fn) {
                pObject[key] = fn;
            }

            // Resolve event index (try minified first, then standard)
            const eventIndexName = resolveEventIndexName(key);
            let index: number | null = null;

            if (eventIndexName && typeof globalScope[eventIndexName] === "number") {
                index = globalScope[eventIndexName];
            } else {
                const standardName = EVENT_INDEX_MAP[key];
                if (standardName && typeof globalScope[standardName] === "number") {
                    index = globalScope[standardName];
                }
            }

            if (typeof index === "number" && Array.isArray(pObject.Event)) {
                pObject.Event[index] = true;
            }
        }

        const eventIndexName = resolveEventIndexName(key);
        if (eventIndexName) {
            const eventIndexValue = globalScope[eventIndexName];
            const index = typeof eventIndexValue === "number" ? eventIndexValue : null;
            const eventArray = instance.Event as Array<boolean> | undefined;
            if (typeof index === "number" && Array.isArray(eventArray)) {
                eventArray[index] = true;
            }
        }
    }

    for (const [key, value] of Object.entries(instance)) {
        if (typeof value === "function" && value.name === name) {
            instance[key] = fn;
        }
    }
}

function updateInstances(
    instanceStore: Record<string, unknown>,
    objectName: string | null,
    instanceKeysToUpdate: Set<string>,
    fn: RuntimeFunction,
    globalScope: RuntimeBindingGlobals & Record<string, unknown>,
    name: string
) {
    for (const instance of Object.values(instanceStore)) {
        if (!instance || typeof instance !== "object") {
            continue;
        }

        if (objectName) {
            const instanceObject = (instance as Record<string, unknown>)._kx as
                | { pName?: unknown; _lx?: unknown }
                | undefined;
            const instanceObjectName =
                typeof instanceObject?.pName === "string"
                    ? instanceObject.pName
                    : typeof instanceObject?._lx === "string"
                      ? instanceObject._lx
                      : null;
            if (instanceObjectName && instanceObjectName !== objectName) {
                continue;
            }
        }

        updateInstance(instance as Record<string, unknown>, instanceKeysToUpdate, fn, globalScope, name);
    }
}

function applyRuntimeBindings(patch: ScriptPatch, fn: RuntimeFunction): void {
    const runtimeId = resolveRuntimeId(patch);
    const targetNames = resolveRuntimeBindingNames(runtimeId);
    if (targetNames.length === 0) {
        return;
    }

    const globalScope = globalThis as RuntimeBindingGlobals & Record<string, unknown>;
    const jsonGame = globalScope.JSON_game;
    const scriptNames = jsonGame?.ScriptNames;
    const scripts = jsonGame?.Scripts;
    const gmObjects = jsonGame?.GMObjects;
    const instanceStore = resolveInstanceStore(globalScope);
    let objectName: string | null = null;
    const instanceKeysToUpdate = new Set<string>();

    const objectRuntime = parseObjectRuntimeId(runtimeId);
    let objectEventKey: string | null = null;
    if (objectRuntime) {
        objectEventKey = resolveObjectEventKey(objectRuntime.eventName);
    }

    const resolvedNames = new Set(targetNames);
    const fallbackScriptMatch =
        runtimeId.startsWith("gml/script/") && runtimeId === patch.id ? runtimeId.slice("gml/script/".length) : null;

    if (fallbackScriptMatch && Array.isArray(gmObjects)) {
        for (const objectEntry of gmObjects) {
            for (const value of Object.values(objectEntry)) {
                if (
                    typeof value === "function" &&
                    value.name.startsWith("gml_Object_") &&
                    value.name.endsWith(`_${fallbackScriptMatch}`)
                ) {
                    resolvedNames.add(value.name);
                }
            }
        }
    }

    for (const name of resolvedNames) {
        if (typeof globalScope[name] === "function" || (Array.isArray(scriptNames) && scriptNames.includes(name))) {
            globalScope[name] = fn;
        }

        if (Array.isArray(scriptNames) && Array.isArray(scripts)) {
            const scriptIndex = scriptNames.indexOf(name);
            if (scriptIndex !== -1 && scriptIndex < scripts.length) {
                scripts[scriptIndex] = fn;
            }
        }

        if (Array.isArray(gmObjects)) {
            const foundName = updateGMObjects(gmObjects, objectRuntime, objectEventKey, fn, instanceKeysToUpdate, name);
            if (!objectName && foundName) {
                objectName = foundName;
            }
        }

        if (instanceStore && typeof instanceStore === "object") {
            updateInstances(instanceStore, objectName, instanceKeysToUpdate, fn, globalScope, name);
        }
    }
}

export function createRegistry(overrides?: RuntimeRegistryOverrides): RuntimeRegistry {
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

export interface DependencyValidationResult {
    satisfied: boolean;
    missingDependencies: Array<string>;
}

export function validatePatchDependencies(patch: Patch, registry: RuntimeRegistry): DependencyValidationResult {
    const dependencies = patch.metadata?.dependencies;

    if (!dependencies || !Array.isArray(dependencies) || dependencies.length === 0) {
        return { satisfied: true, missingDependencies: [] };
    }

    const missingDependencies: Array<string> = [];

    for (const depId of dependencies) {
        if (typeof depId !== "string" || !depId) {
            continue;
        }

        const existsInScripts = depId in registry.scripts;
        const existsInEvents = depId in registry.events;
        const existsInClosures = depId in registry.closures;

        if (!existsInScripts && !existsInEvents && !existsInClosures) {
            missingDependencies.push(depId);
        }
    }

    return {
        satisfied: missingDependencies.length === 0,
        missingDependencies
    };
}

export function applyPatchToRegistry(registry: RuntimeRegistry, patch: Patch): RuntimeRegistry {
    const handler = resolvePatchKindHandler(patch.kind);
    return handler.apply(registry, patch);
}

export function captureSnapshot(registry: RuntimeRegistry, patch: Patch): PatchSnapshot {
    const snapshot: PatchSnapshot = {
        id: patch.id,
        kind: patch.kind,
        version: registry.version,
        previous: null
    };

    const handler = resolvePatchKindHandler(patch.kind);
    snapshot.previous = registry[handler.key][patch.id] ?? null;

    return snapshot;
}

export function restoreSnapshot(registry: RuntimeRegistry, snapshot: PatchSnapshot): RuntimeRegistry {
    const handler = resolvePatchKindHandler(snapshot.kind);
    return restoreEntry(registry, snapshot, handler.key);
}

export function testPatchInShadow(patch: Patch): ShadowTestResult {
    const shadowRegistry = createRegistry();

    try {
        applyPatchToRegistry(shadowRegistry, patch);
        return { valid: true };
    } catch (error) {
        return {
            valid: false,
            error: isErrorLike(error) ? error.message : String(error ?? "Unknown error")
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

function requirePatchBody(patch: Patch, label: string): string {
    const body = patch.js_body;
    if (!body || typeof body !== "string") {
        throw new TypeError(`${label} patch must have a 'js_body' string`);
    }

    return body;
}

function applyScriptPatch(registry: RuntimeRegistry, patch: ScriptPatch): RuntimeRegistry {
    const patchBody = requirePatchBody(patch, "Script");

    const rawFn = new Function(
        "self",
        "other",
        "args",
        "__gml_constants",
        "__gml_builtins",
        `const __gml_scope = self && typeof self === "object" ? self : Object.create(null);
const __global_scope = typeof globalThis === "object" && globalThis !== null ? globalThis : null;
const __html_color_pattern = /^rgba?\\(/;
const __is_html_color_string = (value) => typeof value === "string" && __html_color_pattern.test(value);
const __resolveSpriteConstant = (prop) => {
    const jsonGame = __global_scope?.JSON_game;
    const sprites = jsonGame?.Sprites;
    if (Array.isArray(sprites)) {
        const index = sprites.findIndex(
            (sprite) => sprite?.pName === prop || sprite?.Name === prop
        );
        if (index !== -1) {
            return index;
        }
    }

    const spriteManager = __global_scope?.g_pSpriteManager;
    if (spriteManager && typeof spriteManager.Sprite_Find === "function") {
        const value = spriteManager.Sprite_Find(prop);
        if (typeof value === "number" && value >= 0) {
            return value;
        }
    }

    return undefined;
};
const __resolveScriptFunction = (prop) => {
    const jsonGame = __global_scope?.JSON_game;
    const scriptNames = jsonGame?.ScriptNames;
    const scripts = jsonGame?.Scripts;
    if (!Array.isArray(scriptNames) || !Array.isArray(scripts)) {
        return undefined;
    }

    const scriptIndex = scriptNames.indexOf(\`gml_Script_\${prop}\`);
    if (scriptIndex !== -1 && scriptIndex < scripts.length) {
        return scripts[scriptIndex];
    }

    const globalScriptIndex = scriptNames.indexOf(\`gml_GlobalScript_\${prop}\`);
    if (globalScriptIndex !== -1 && globalScriptIndex < scripts.length) {
        return scripts[globalScriptIndex];
    }

    return undefined;
};
const __computeGmlPropertyNames = (prop) => [\`gml\${prop}\`, \`__\${prop}\`];
const __resolveExistingGmlPropertyKey = (target, prop) => {
    const [gmlProp, underscoreProp] = __computeGmlPropertyNames(prop);
    if (prop in target) {
        return prop;
    }
    if (gmlProp in target) {
        return gmlProp;
    }
    if (underscoreProp in target) {
        return underscoreProp;
    }
    return null;
};
const __gml_proxy = new Proxy(__gml_scope, {
    has(target, prop) {
        if (typeof prop !== "string") {
            return prop in target;
        }
        const key = __resolveExistingGmlPropertyKey(target, prop);
        if (key !== null) {
            return true;
        }
        const __has_global_value = __global_scope && prop in __global_scope;
        if (Object.prototype.hasOwnProperty.call(__gml_constants, prop)) {
            return true;
        }
        const __global_value = __has_global_value ? __global_scope[prop] : undefined;
        if (__has_global_value && __global_value !== undefined) {
            return true;
        }
        if (__resolveSpriteConstant(prop) !== undefined) {
            return true;
        }
        if (__resolveScriptFunction(prop) !== undefined) {
            return true;
        }
        if (
            __gml_builtins &&
            typeof __gml_builtins[\`get_\${prop}\`] === "function"
        ) {
            return true;
        }
        if (__gml_builtins && prop in __gml_builtins) {
            return true;
        }
        return false;
    },
    get(target, prop, receiver) {
        if (typeof prop !== "string") {
            return Reflect.get(target, prop, receiver);
        }
        const key = __resolveExistingGmlPropertyKey(target, prop);
        if (key !== null) {
            return Reflect.get(target, key, receiver);
        }
        const __has_global_value = __global_scope && prop in __global_scope;
        const __global_value = __has_global_value ? __global_scope[prop] : undefined;
        const __sprite_constant = __resolveSpriteConstant(prop);
        const __script_function = __resolveScriptFunction(prop);
        if (Object.prototype.hasOwnProperty.call(__gml_constants, prop)) {
            if (__global_value === undefined || __is_html_color_string(__global_value)) {
                return __gml_constants[prop];
            }
            return __global_value;
        }
        if (__has_global_value && __global_value !== undefined) {
            return __global_value;
        }
        if (__sprite_constant !== undefined) {
            return __sprite_constant;
        }
        if (__script_function !== undefined) {
            return __script_function;
        }
        if (__gml_builtins) {
            const getter = __gml_builtins[\`get_\${prop}\`];
            if (typeof getter === "function") {
                return getter.call(__gml_builtins);
            }
            if (prop in __gml_builtins) {
                return __gml_builtins[prop];
            }
        }
        return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
        if (typeof prop !== "string") {
            return Reflect.set(target, prop, value, receiver);
        }
        const key = __resolveExistingGmlPropertyKey(target, prop);
        if (key !== null) {
            return Reflect.set(target, key, value, receiver);
        }
        return Reflect.set(target, prop, value, receiver);
    }
});
with (__gml_proxy) {
${patchBody}
}`
    ) as RuntimeFunction;

    const fn = ((self, other, args) => {
        const globals = globalThis as RuntimeBindingGlobals & Record<string, unknown>;
        const constants = resolveBuiltinConstants(globals);
        const builtins = globals.g_pBuiltIn && typeof globals.g_pBuiltIn === "object" ? globals.g_pBuiltIn : undefined;
        return rawFn.call(self, self, other, args, constants, builtins);
    }) as RuntimeFunction;
    const namedFn = createNamedRuntimeFunction(resolveRuntimeId(patch), fn);

    applyRuntimeBindings(patch, namedFn);

    return updateRegistryCollection(registry, "scripts", patch.id, namedFn);
}

function applyEventPatch(registry: RuntimeRegistry, patch: EventPatch): RuntimeRegistry {
    const patchBody = requirePatchBody(patch, "Event");

    const thisName = patch.this_name || "self";
    const argsDecl = patch.js_args || "";
    const fn = new Function(thisName, argsDecl, patchBody) as RuntimeFunction;

    const eventWrapper = function (...incomingArgs: Array<unknown>) {
        return fn.call(this, this, ...incomingArgs);
    };

    return updateRegistryCollection(registry, "events", patch.id, eventWrapper);
}

function applyClosurePatch(registry: RuntimeRegistry, patch: ClosurePatch): RuntimeRegistry {
    const patchBody = requirePatchBody(patch, "Closure");

    const fn = new Function("...args", patchBody) as RuntimeFunction;

    return updateRegistryCollection(registry, "closures", patch.id, fn);
}

type RegistryCollectionKey = "scripts" | "events" | "closures";

function updateRegistryCollection(
    registry: RuntimeRegistry,
    key: RegistryCollectionKey,
    patchId: string,
    fn: RuntimeFunction
): RuntimeRegistry {
    return {
        ...registry,
        [key]: {
            ...registry[key],
            [patchId]: fn
        }
    };
}

type PatchKindHandler = {
    key: RegistryCollectionKey;
    apply: (registry: RuntimeRegistry, patch: Patch) => RuntimeRegistry;
};

function resolvePatchKindHandler(kind: Patch["kind"]): PatchKindHandler {
    switch (kind) {
        case "script": {
            return {
                key: "scripts",
                apply: (registry, patch) => applyScriptPatch(registry, patch as ScriptPatch)
            };
        }
        case "event": {
            return {
                key: "events",
                apply: (registry, patch) => applyEventPatch(registry, patch as EventPatch)
            };
        }
        case "closure": {
            return {
                key: "closures",
                apply: (registry, patch) => applyClosurePatch(registry, patch as ClosurePatch)
            };
        }
        default: {
            throw new TypeError("Unsupported patch kind");
        }
    }
}

function restoreEntry(registry: RuntimeRegistry, snapshot: PatchSnapshot, key: RegistryCollectionKey): RuntimeRegistry {
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

function calculatePercentile(sorted: Array<number>, percentile: number): number {
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

export function collectPatchDurations(history: Array<PatchHistoryEntry>): Array<number> {
    const durations: Array<number> = [];

    for (const entry of history) {
        if (entry.action === "apply" && entry.durationMs !== undefined) {
            durations.push(entry.durationMs);
        }
    }

    return durations;
}
