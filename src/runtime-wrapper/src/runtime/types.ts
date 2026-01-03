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
    maxUndoStackSize?: number;
}

export interface RuntimeWrapperState {
    registry: RuntimeRegistry;
    undoStack: Array<PatchSnapshot>;
    patchHistory: Array<PatchHistoryEntry>;
    options: {
        validateBeforeApply: boolean;
        maxUndoStackSize: number;
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

/**
 * Patch application operations.
 *
 * Provides the core capability to apply runtime patches without coupling
 * to history tracking, registry queries, or statistics gathering.
 * Consumers that only need to apply patches (e.g., WebSocket clients)
 * should depend on this interface rather than the full RuntimeWrapper.
 */
export interface PatchApplicator {
    applyPatch(patch: unknown): ApplyPatchResult;
    applyPatchBatch(patches: Array<unknown>): BatchApplyResult;
    trySafeApply(patch: unknown, onValidate?: (patch: Patch) => boolean | void): TrySafeApplyResult;
}

/**
 * History and undo operations.
 *
 * Provides patch history tracking and the ability to undo previously
 * applied patches without coupling to patch application or registry queries.
 */
export interface HistoryManager {
    undo(): { success: boolean; version?: number; message?: string };
    getPatchHistory(): Array<PatchHistoryEntry>;
    getUndoStackSize(): number;
}

/**
 * Read-only registry access.
 *
 * Provides query operations for scripts, events, and closures in the
 * runtime registry without coupling to mutation or patch application.
 */
export interface RegistryReader {
    getScript(id: string): RuntimeFunction | undefined;
    getEvent(id: string): RuntimeFunction | undefined;
    getClosure(id: string): RuntimeFunction | undefined;
    hasScript(id: string): boolean;
    hasEvent(id: string): boolean;
    hasClosure(id: string): boolean;
}

/**
 * Registry mutation operations.
 *
 * Provides the ability to clear the runtime registry without coupling
 * to patch application or query operations.
 */
export interface RegistryMutator {
    clearRegistry(): void;
}

export interface RegistryHealthCheck {
    healthy: boolean;
    version: number;
    issues: Array<RegistryHealthIssue>;
}

export interface RegistryHealthIssue {
    severity: "warning" | "error";
    category: "function-type" | "id-format" | "collection-integrity";
    message: string;
    affectedId?: string;
}

/**
 * Registry health and diagnostics.
 *
 * Provides validation and health checking capabilities for the runtime
 * registry without coupling to patch application or mutation operations.
 */
export interface RegistryDiagnostics {
    checkRegistryHealth(): RegistryHealthCheck;
}

/**
 * Runtime metrics and snapshot operations.
 *
 * Provides statistics gathering and registry snapshot capabilities
 * without coupling to patch application or registry mutations.
 */
export interface RuntimeMetrics {
    getPatchStats(): PatchStats;
    getRegistrySnapshot(): RuntimeRegistrySnapshot;
    getVersion(): number;
}

/**
 * Complete runtime wrapper interface.
 *
 * Combines all role-focused interfaces for consumers that need full
 * runtime wrapper capabilities. Consumers should prefer depending on
 * the minimal interface they need (PatchApplicator, HistoryManager, etc.)
 * rather than this composite interface when possible.
 */
export interface RuntimeWrapper
    extends PatchApplicator,
        HistoryManager,
        RegistryReader,
        RegistryMutator,
        RuntimeMetrics,
        RegistryDiagnostics {
    state: RuntimeWrapperState;
}
