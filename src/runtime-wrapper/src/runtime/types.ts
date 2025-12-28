export type RuntimeFunction = (...args: Array<unknown>) => unknown;

export type PatchKind = "script" | "event" | "closure";

export interface BasePatch {
    kind: PatchKind;
    id: string;
}

export interface ScriptPatch extends BasePatch {
    kind: "script";
    js_body: string;
}

export interface EventPatch extends BasePatch {
    kind: "event";
    js_body: string;
    this_name?: string;
    js_args?: string;
}

export interface ClosurePatch extends BasePatch {
    kind: "closure";
    js_body: string;
}

export type Patch = ScriptPatch | EventPatch | ClosurePatch;

export interface RuntimeRegistry {
    version: number;
    scripts: Record<string, RuntimeFunction>;
    events: Record<string, RuntimeFunction>;
    closures: Record<string, RuntimeFunction>;
}

export interface RuntimeRegistryOverrides {
    version?: number;
    scripts?: Record<string, RuntimeFunction>;
    events?: Record<string, RuntimeFunction>;
    closures?: Record<string, RuntimeFunction>;
}

export interface PatchSnapshot {
    kind: PatchKind;
    id: string;
    version: number;
    previous: RuntimeFunction | null;
}

export type PatchAction = "apply" | "undo" | "rollback";

export interface PatchHistoryEntry {
    patch: Pick<BasePatch, "kind" | "id">;
    version: number;
    timestamp: number;
    action: PatchAction;
    error?: string;
    rolledBack?: boolean;
    durationMs?: number;
}

export type RegistryChangeEvent =
    | { type: "patch-applied"; patch: Patch; version: number }
    | {
          type: "patch-rolled-back";
          patch: Patch;
          version: number;
          error: string;
      }
    | {
          type: "patch-undone";
          patch: Pick<BasePatch, "kind" | "id">;
          version: number;
      }
    | { type: "registry-cleared"; version: number };

export type RegistryChangeListener = (event: RegistryChangeEvent) => void;

export interface RuntimeWrapperOptions {
    registry?: RuntimeRegistryOverrides;
    onPatchApplied?: (patch: Patch, version: number) => void;
    validateBeforeApply?: boolean;
    onChange?: RegistryChangeListener;
}

export interface RuntimeWrapperState {
    registry: RuntimeRegistry;
    undoStack: Array<PatchSnapshot>;
    patchHistory: Array<PatchHistoryEntry>;
    options: {
        validateBeforeApply: boolean;
    };
}

export interface PatchStats {
    totalPatches: number;
    appliedPatches: number;
    undonePatches: number;
    rolledBackPatches: number;
    scriptPatches: number;
    eventPatches: number;
    closurePatches: number;
    uniqueIds: number;
    averagePatchDurationMs?: number;
    totalDurationMs?: number;
    fastestPatchMs?: number;
    slowestPatchMs?: number;
    p50DurationMs?: number;
    p90DurationMs?: number;
    p99DurationMs?: number;
}

export interface RuntimeRegistrySnapshot {
    version: number;
    scriptCount: number;
    eventCount: number;
    closureCount: number;
    scripts: Array<string>;
    events: Array<string>;
    closures: Array<string>;
}

export interface TrySafeApplyResult {
    success: boolean;
    version?: number;
    error?: string;
    message?: string;
    rolledBack?: boolean;
}

export interface BatchApplyResult {
    success: boolean;
    version?: number;
    appliedCount: number;
    failedIndex?: number;
    error?: string;
    message?: string;
    rolledBack: boolean;
}

export type ApplyPatchResult = { success: true; version: number };

export type RuntimePatchError = Error & { patch?: Patch; rolledBack?: boolean };

export interface ShadowTestResult {
    valid: boolean;
    error?: string;
}

export interface RuntimeWrapper {
    state: RuntimeWrapperState;
    applyPatch(patch: unknown): ApplyPatchResult;
    applyPatchBatch(patches: Array<unknown>): BatchApplyResult;
    trySafeApply(
        patch: unknown,
        onValidate?: (patch: Patch) => boolean | void
    ): TrySafeApplyResult;
    undo(): { success: boolean; version?: number; message?: string };
    getPatchHistory(): Array<PatchHistoryEntry>;
    getRegistrySnapshot(): RuntimeRegistrySnapshot;
    getPatchStats(): PatchStats;
    getVersion(): number;
    getScript(id: string): RuntimeFunction | undefined;
    getEvent(id: string): RuntimeFunction | undefined;
    hasScript(id: string): boolean;
    hasEvent(id: string): boolean;
    getClosure(id: string): RuntimeFunction | undefined;
    hasClosure(id: string): boolean;
    clearRegistry(): void;
}
