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
}

export interface RuntimeWrapperOptions {
    registry?: RuntimeRegistryOverrides;
    onPatchApplied?: (patch: Patch, version: number) => void;
    validateBeforeApply?: boolean;
    enablePerformanceTracking?: boolean;
}

export interface RuntimeWrapperState {
    registry: RuntimeRegistry;
    undoStack: Array<PatchSnapshot>;
    patchHistory: Array<PatchHistoryEntry>;
    performanceHistory: Array<PatchPerformanceEntry>;
    options: {
        validateBeforeApply: boolean;
        enablePerformanceTracking: boolean;
    };
}

export interface PatchStats {
    totalPatches: number;
    appliedPatches: number;
    undonePatches: number;
    scriptPatches: number;
    eventPatches: number;
    closurePatches: number;
    uniqueIds: number;
}

export interface PerformanceMetrics {
    patchApplicationTimeMs: number;
    shadowValidationTimeMs?: number;
    rollbackTimeMs?: number;
    totalTimeMs: number;
}

export interface PatchPerformanceEntry {
    patchId: string;
    patchKind: PatchKind;
    action: PatchAction;
    timestamp: number;
    metrics: PerformanceMetrics;
}

export interface PerformanceStats {
    totalOperations: number;
    averagePatchTimeMs: number;
    maxPatchTimeMs: number;
    minPatchTimeMs: number;
    totalTimeMs: number;
    averageShadowValidationMs: number;
    rollbackCount: number;
    averageRollbackTimeMs: number;
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

export type ApplyPatchResult = { success: true; version: number };

export type RuntimePatchError = Error & { patch?: Patch; rolledBack?: boolean };

export interface ShadowTestResult {
    valid: boolean;
    error?: string;
}

export interface RuntimeWrapper {
    state: RuntimeWrapperState;
    applyPatch(patch: unknown): ApplyPatchResult;
    trySafeApply(
        patch: unknown,
        onValidate?: (patch: Patch) => boolean | void
    ): TrySafeApplyResult;
    undo(): { success: boolean; version?: number; message?: string };
    getPatchHistory(): Array<PatchHistoryEntry>;
    getRegistrySnapshot(): RuntimeRegistrySnapshot;
    getPatchStats(): PatchStats;
    getPerformanceHistory(): Array<PatchPerformanceEntry>;
    getPerformanceStats(): PerformanceStats;
    clearPerformanceHistory(): void;
    getVersion(): number;
    getScript(id: string): RuntimeFunction | undefined;
    getEvent(id: string): RuntimeFunction | undefined;
    hasScript(id: string): boolean;
    hasEvent(id: string): boolean;
    getClosure(id: string): RuntimeFunction | undefined;
    hasClosure(id: string): boolean;
}
