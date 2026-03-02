import { Core } from "@gml-modules/core";

import { resolveBuiltinConstants } from "./builtin-constants.js";
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
        Sprites?: Array<{ pName?: string; Name?: string }>;
    };
    g_pBuiltIn?: Record<string, unknown>;
    g_pSpriteManager?: { Sprite_Find?: (name: string) => unknown };
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

// ---------------------------------------------------------------------------
// Module-level GML scope proxy helpers
//
// These constants and functions are defined at module load time so they are
// shared across every compiled script function. Previously they were defined
// as closures inside the `new Function(...)` template, which caused each
// invocation of a patched script to allocate a fresh set of helper closures
// and a new proxy handler object—measurable GC pressure at 60fps with many
// active patched scripts.
// ---------------------------------------------------------------------------

const HTML_COLOR_PATTERN = /^rgba?\(/;

/** Returns true if `value` is a CSS-style HTML color string. */
function isHtmlColorString(value: unknown): boolean {
    return typeof value === "string" && HTML_COLOR_PATTERN.test(value);
}

/**
 * Maps a GML property name to the canonical key used in an instance scope
 * object. Returns `null` when no matching key exists in `target`.
 *
 * GML emits instance variables with a `gml` prefix (e.g. `armNum` → `gmlarmNum`)
 * and occasionally with a double-underscore prefix (`__armNum`). This function
 * checks all three candidates and returns the first that actually exists on the
 * target, or `null` if none do.
 */
function resolveGmlScopePropertyKey(target: Record<string, unknown>, prop: string): string | null {
    if (prop in target) {
        return prop;
    }

    const gmlProp = `gml${prop}`;
    if (gmlProp in target) {
        return gmlProp;
    }

    const underscoreProp = `__${prop}`;
    if (underscoreProp in target) {
        return underscoreProp;
    }

    return null;
}

/**
 * Resolves a sprite name to its numeric runtime index by querying the
 * GameMaker HTML5 runtime's sprite table or sprite manager.
 * Returns `null` when no matching sprite is found.
 */
function resolveSpriteConstantFromRuntime(prop: string): number | null {
    const globals = globalThis as RuntimeBindingGlobals;
    const sprites = globals.JSON_game?.Sprites;

    if (Array.isArray(sprites)) {
        const index = sprites.findIndex((sprite) => sprite?.pName === prop || sprite?.Name === prop);
        if (index !== -1) {
            return index;
        }
    }

    const spriteManager = globals.g_pSpriteManager;
    if (spriteManager && typeof spriteManager.Sprite_Find === "function") {
        const value = spriteManager.Sprite_Find(prop);
        if (typeof value === "number" && value >= 0) {
            return value;
        }
    }

    return null;
}

/**
 * Resolves a GML script name to its compiled function via the GameMaker
 * HTML5 runtime's script name/function table.
 * Returns `null` when no matching script is registered.
 */
function resolveScriptFunctionFromRuntime(prop: string): RuntimeFunction | null {
    const globals = globalThis as RuntimeBindingGlobals;
    const scriptNames = globals.JSON_game?.ScriptNames;
    const scripts = globals.JSON_game?.Scripts;

    if (!Array.isArray(scriptNames) || !Array.isArray(scripts)) {
        return null;
    }

    const idx = scriptNames.indexOf(`gml_Script_${prop}`);
    if (idx !== -1 && idx < scripts.length) {
        return scripts[idx];
    }

    const globalIdx = scriptNames.indexOf(`gml_GlobalScript_${prop}`);
    if (globalIdx !== -1 && globalIdx < scripts.length) {
        return scripts[globalIdx];
    }

    return null;
}

/**
 * Stable `with`-scope proxy handler for compiled GML script functions.
 *
 * Allocated once at module load. The `with (__gml_proxy)` statement injected
 * into every compiled script function references this shared handler instead of
 * constructing a fresh handler object on each invocation. The handler reads
 * `globalThis` and the memoized builtin-constants table on demand, so no
 * per-call state needs to be captured.
 */
const GML_SCOPE_PROXY_HANDLER: ProxyHandler<Record<string, unknown>> = {
    has(target, prop): boolean {
        if (typeof prop !== "string") {
            return prop in target;
        }

        if (resolveGmlScopePropertyKey(target, prop) !== null) {
            return true;
        }

        const globals = globalThis as Record<string, unknown>;
        const gmlConstants = resolveBuiltinConstants(globals);

        if (Object.hasOwn(gmlConstants, prop)) {
            return true;
        }

        if (globals[prop] !== undefined) {
            return true;
        }

        if (resolveSpriteConstantFromRuntime(prop) !== null) {
            return true;
        }

        if (resolveScriptFunctionFromRuntime(prop) !== null) {
            return true;
        }

        const gmlBuiltins = globals.g_pBuiltIn as Record<string, unknown> | undefined;
        if (gmlBuiltins) {
            if (typeof gmlBuiltins[`get_${prop}`] === "function") {
                return true;
            }
            if (prop in gmlBuiltins) {
                return true;
            }
        }

        return false;
    },

    get(target, prop, receiver): unknown {
        if (typeof prop !== "string") {
            return Reflect.get(target, prop, receiver);
        }

        const key = resolveGmlScopePropertyKey(target, prop);
        if (key !== null) {
            return Reflect.get(target, key, receiver);
        }

        const globals = globalThis as Record<string, unknown>;
        const hasGlobalValue = prop in globals;
        const globalValue = hasGlobalValue ? globals[prop] : undefined;
        const gmlConstants = resolveBuiltinConstants(globals);

        if (Object.hasOwn(gmlConstants, prop)) {
            if (globalValue === undefined || isHtmlColorString(globalValue)) {
                return (gmlConstants as Record<string, unknown>)[prop];
            }
            return globalValue;
        }

        if (hasGlobalValue && globalValue !== undefined) {
            return globalValue;
        }

        const spriteConst = resolveSpriteConstantFromRuntime(prop);
        if (spriteConst !== null) {
            return spriteConst;
        }

        const scriptFn = resolveScriptFunctionFromRuntime(prop);
        if (scriptFn !== null) {
            return scriptFn;
        }

        const gmlBuiltins = globals.g_pBuiltIn as Record<string, unknown> | undefined;
        if (gmlBuiltins) {
            const getter = gmlBuiltins[`get_${prop}`];
            if (typeof getter === "function") {
                return (getter as () => unknown).call(gmlBuiltins);
            }
            if (prop in gmlBuiltins) {
                return gmlBuiltins[prop];
            }
        }

        return Reflect.get(target, prop, receiver);
    },

    set(target, prop, value, receiver): boolean {
        if (typeof prop !== "string") {
            return Reflect.set(target, prop, value, receiver);
        }

        const key = resolveGmlScopePropertyKey(target, prop);
        if (key !== null) {
            return Reflect.set(target, key, value, receiver);
        }

        return Reflect.set(target, prop, value, receiver);
    }
};

/**
 * Prefix prepended to every compiled script function body. Together with a
 * trailing `\n}` it forms the complete `with`-scope wrapper. Kept as a
 * module-level constant so the string is allocated once.
 */
const SCRIPT_PATCH_BODY_PREFIX =
    `const __gml_scope = self && typeof self === "object" ? self : Object.create(null);\n` +
    `const __gml_proxy = new Proxy(__gml_scope, __proxy_handler);\n` +
    `with (__gml_proxy) {\n`;

type EventMapping = {
    standard: string;
    minified: string;
};

const EVENT_MAPPINGS: ReadonlyMap<string, EventMapping> = new Map([
    ["PreCreateEvent", { standard: "EVENT_PRE_CREATE", minified: "_qI" }],
    ["CreateEvent", { standard: "EVENT_CREATE", minified: "_rI" }],
    ["DestroyEvent", { standard: "EVENT_DESTROY", minified: "_tI" }],
    ["CleanUpEvent", { standard: "EVENT_CLEAN_UP", minified: "_aI" }],
    ["StepBeginEvent", { standard: "EVENT_STEP_BEGIN", minified: "_sB2" }],
    ["StepNormalEvent", { standard: "EVENT_STEP_NORMAL", minified: "_uB2" }],
    ["StepEndEvent", { standard: "EVENT_STEP_END", minified: "_wB2" }],
    ["DrawEvent", { standard: "EVENT_DRAW", minified: "_6E2" }],
    ["DrawGUI", { standard: "EVENT_DRAW_GUI", minified: "_2G2" }],
    ["DrawEventBegin", { standard: "EVENT_DRAW_BEGIN", minified: "_4G2" }],
    ["DrawEventEnd", { standard: "EVENT_DRAW_END", minified: "_5G2" }],
    ["DrawGUIBegin", { standard: "EVENT_DRAW_GUI_BEGIN", minified: "_6G2" }],
    ["DrawGUIEnd", { standard: "EVENT_DRAW_GUI_END", minified: "_7G2" }]
]);

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
    if (Core.isNonEmptyString(patch.runtimeId)) {
        return patch.runtimeId;
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

function resolveEventIndex(
    globalScope: RuntimeBindingGlobals & Record<string, unknown>,
    eventKey: string
): number | null {
    const mapping = EVENT_MAPPINGS.get(eventKey);
    if (!mapping) {
        return null;
    }

    const minifiedValue = globalScope[mapping.minified];
    if (typeof minifiedValue === "number") {
        return minifiedValue;
    }

    const standardValue = globalScope[mapping.standard];
    if (typeof standardValue === "number") {
        return standardValue;
    }

    return null;
}

function markEventIndexAsEnabled(eventCollection: unknown, index: number | null): void {
    if (typeof index !== "number" || !Array.isArray(eventCollection)) {
        return;
    }

    eventCollection[index] = true;
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
        const rawPObject = instance.pObject ?? instance._kx;
        const pObject = rawPObject && typeof rawPObject === "object" ? (rawPObject as Record<string, unknown>) : null;
        if (pObject !== null && pObject[key] !== fn) {
            pObject[key] = fn;
        }

        const eventIndex = resolveEventIndex(globalScope, key);
        markEventIndexAsEnabled(instance.Event, eventIndex);
        markEventIndexAsEnabled(pObject?.Event, eventIndex);
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

type DependencyLookup = ReadonlySet<string>;

function createDependencyLookup(registry: RuntimeRegistry): DependencyLookup {
    return new Set([
        ...Object.keys(registry.scripts),
        ...Object.keys(registry.events),
        ...Object.keys(registry.closures)
    ]);
}

function collectMissingDependencies(
    dependencies: ReadonlyArray<unknown>,
    dependencyLookup: DependencyLookup
): Array<string> {
    const missingDependencies: Array<string> = [];
    const checkedDependencies = new Set<string>();

    for (const dependencyCandidate of dependencies) {
        if (typeof dependencyCandidate !== "string" || dependencyCandidate.length === 0) {
            continue;
        }

        if (checkedDependencies.has(dependencyCandidate)) {
            continue;
        }
        checkedDependencies.add(dependencyCandidate);

        if (!dependencyLookup.has(dependencyCandidate)) {
            missingDependencies.push(dependencyCandidate);
        }
    }

    return missingDependencies;
}

export function validatePatchDependencies(patch: Patch, registry: RuntimeRegistry): DependencyValidationResult {
    const dependencies = patch.metadata?.dependencies;

    if (!dependencies || !Array.isArray(dependencies) || dependencies.length === 0) {
        return { satisfied: true, missingDependencies: [] };
    }

    const dependencyLookup = createDependencyLookup(registry);
    const missingDependencies = collectMissingDependencies(dependencies, dependencyLookup);

    return {
        satisfied: missingDependencies.length === 0,
        missingDependencies
    };
}

export type BatchDependencyValidationResult =
    | { satisfied: true }
    | {
          satisfied: false;
          failedIndex: number;
          missingDependencies: Array<string>;
      };

/**
 * Validates patch dependencies in the order a batch will be applied.
 *
 * Dependencies can be satisfied either by the current registry state or by
 * patches that appear earlier in the same batch.
 */
export function validateBatchPatchDependencies(
    patches: ReadonlyArray<Patch>,
    registry: RuntimeRegistry
): BatchDependencyValidationResult {
    const dependencyLookup = new Set(createDependencyLookup(registry));

    for (const [index, patch] of patches.entries()) {
        const dependencies = patch.metadata?.dependencies;
        if (dependencies && Array.isArray(dependencies) && dependencies.length > 0) {
            const missingDependencies = collectMissingDependencies(dependencies, dependencyLookup);
            if (missingDependencies.length > 0) {
                return {
                    satisfied: false,
                    failedIndex: index,
                    missingDependencies
                };
            }
        }

        dependencyLookup.add(patch.id);
    }

    return { satisfied: true };
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
            error: Core.isErrorLike(error) ? error.message : String(error ?? "Unknown error")
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
        "__proxy_handler",
        `${SCRIPT_PATCH_BODY_PREFIX}${patchBody}\n}`
    ) as RuntimeFunction;

    const fn = ((self, other, args) => {
        return rawFn.call(self, self, other, args, GML_SCOPE_PROXY_HANDLER);
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

    const sorted = durations.toSorted((a, b) => a - b);
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
    if (Core.areNumbersApproximatelyEqual(index, nearest)) {
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
