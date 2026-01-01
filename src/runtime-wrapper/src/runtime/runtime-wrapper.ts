import {
    applyPatchInternal,
    calculateTimingMetrics,
    captureSnapshot,
    collectPatchDurations,
    createRegistry,
    restoreSnapshot,
    testPatchInShadow,
    validatePatch
} from "./patch-utils.js";
import type {
    ApplyPatchResult,
    BatchApplyResult,
    Patch,
    PatchHistoryEntry,
    PatchStats,
    RegistryHealthCheck,
    RegistryHealthIssue,
    RuntimeFunction,
    RuntimeRegistrySnapshot,
    RuntimeWrapper,
    RuntimeWrapperOptions,
    RuntimeWrapperState,
    TrySafeApplyResult
} from "./types.js";

const UNKNOWN_ERROR_MESSAGE = "Unknown error";
const DEFAULT_MAX_UNDO_STACK_SIZE = 50;

export function createRuntimeWrapper(
    options: RuntimeWrapperOptions = {}
): RuntimeWrapper {
    const baseRegistry = createRegistry(options.registry);

    const state: RuntimeWrapperState = {
        registry: baseRegistry,
        undoStack: [],
        patchHistory: [],
        options: {
            validateBeforeApply: options.validateBeforeApply ?? false,
            maxUndoStackSize:
                options.maxUndoStackSize ?? DEFAULT_MAX_UNDO_STACK_SIZE
        }
    };

    const onPatchApplied = options.onPatchApplied;
    const onChange = options.onChange;

    function trimUndoStack(): void {
        const maxSize = state.options.maxUndoStackSize;
        if (maxSize > 0 && state.undoStack.length > maxSize) {
            state.undoStack.splice(0, state.undoStack.length - maxSize);
        }
    }

    function applyPatch(patchCandidate: unknown): ApplyPatchResult {
        validatePatch(patchCandidate);
        const patch = patchCandidate;

        if (state.options.validateBeforeApply) {
            const testResult = testPatchInShadow(patch);
            if (!testResult.valid) {
                throw new Error(
                    `Patch validation failed for ${patch.id}: ${testResult.error}`
                );
            }
        }

        const snapshot = captureSnapshot(state.registry, patch);
        const startTime = Date.now();

        try {
            const { registry: nextRegistry, result } = applyPatchInternal(
                state.registry,
                patch
            );
            const durationMs = Date.now() - startTime;

            state.registry = nextRegistry;
            state.undoStack.push(snapshot);
            trimUndoStack();
            state.patchHistory.push({
                patch: { kind: patch.kind, id: patch.id },
                version: state.registry.version,
                timestamp: startTime,
                action: "apply",
                durationMs
            });

            if (onPatchApplied) {
                onPatchApplied(patch, state.registry.version);
            }

            if (onChange) {
                onChange({
                    type: "patch-applied",
                    patch,
                    version: state.registry.version
                });
            }

            return result;
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error ?? UNKNOWN_ERROR_MESSAGE);
            throw new Error(`Failed to apply patch ${patch.id}: ${message}`);
        }
    }

    function validateBatchPatches(
        patchCandidates: Array<unknown>
    ): Array<Patch> | BatchApplyResult {
        const validatedPatches: Array<Patch> = [];
        for (const candidate of patchCandidates) {
            validatePatch(candidate);
            validatedPatches.push(candidate);
        }

        if (state.options.validateBeforeApply) {
            for (const [index, patch] of validatedPatches.entries()) {
                const testResult = testPatchInShadow(patch);
                if (!testResult.valid) {
                    return {
                        success: false,
                        appliedCount: 0,
                        failedIndex: index,
                        error: testResult.error,
                        message: `Batch validation failed at patch ${index} (${patch.id}): ${testResult.error}`,
                        rolledBack: false
                    };
                }
            }
        }

        return validatedPatches;
    }

    function applyPatchBatch(
        patchCandidates: Array<unknown>
    ): BatchApplyResult {
        if (!Array.isArray(patchCandidates)) {
            throw new TypeError("applyPatchBatch expects an array of patches");
        }

        if (patchCandidates.length === 0) {
            return {
                success: true,
                version: state.registry.version,
                appliedCount: 0,
                rolledBack: false
            };
        }

        const validationResult = validateBatchPatches(patchCandidates);
        if (!Array.isArray(validationResult)) {
            return validationResult;
        }
        const validatedPatches = validationResult;

        const batchSnapshot = {
            version: state.registry.version,
            registry: { ...state.registry },
            undoStackSize: state.undoStack.length,
            historySize: state.patchHistory.length
        };

        const startTime = Date.now();
        let appliedCount = 0;

        try {
            for (const patch of validatedPatches) {
                const snapshot = captureSnapshot(state.registry, patch);
                const patchStartTime = Date.now();

                const { registry: nextRegistry } = applyPatchInternal(
                    state.registry,
                    patch
                );
                const durationMs = Date.now() - patchStartTime;

                state.registry = nextRegistry;
                state.undoStack.push(snapshot);
                trimUndoStack();
                state.patchHistory.push({
                    patch: { kind: patch.kind, id: patch.id },
                    version: state.registry.version,
                    timestamp: patchStartTime,
                    action: "apply",
                    durationMs
                });

                appliedCount++;

                if (onPatchApplied) {
                    onPatchApplied(patch, state.registry.version);
                }

                if (onChange) {
                    onChange({
                        type: "patch-applied",
                        patch,
                        version: state.registry.version
                    });
                }
            }

            const totalDuration = Date.now() - startTime;
            state.patchHistory.push({
                patch: {
                    kind: "script",
                    id: `batch:${appliedCount}_patches`
                },
                version: state.registry.version,
                timestamp: startTime,
                action: "apply",
                durationMs: totalDuration
            });

            return {
                success: true,
                version: state.registry.version,
                appliedCount,
                rolledBack: false
            };
        } catch (error) {
            state.registry = batchSnapshot.registry;
            state.undoStack.length = batchSnapshot.undoStackSize;
            state.patchHistory.length = batchSnapshot.historySize;

            const message =
                error instanceof Error
                    ? error.message
                    : String(error ?? UNKNOWN_ERROR_MESSAGE);

            state.patchHistory.push({
                patch: {
                    kind: "script",
                    id: `batch:${appliedCount}_of_${validatedPatches.length}`
                },
                version: state.registry.version,
                timestamp: Date.now(),
                action: "rollback",
                error: message
            });

            return {
                success: false,
                version: state.registry.version,
                appliedCount,
                failedIndex: appliedCount,
                error: message,
                message: `Batch apply failed at patch ${appliedCount}: ${message}`,
                rolledBack: true
            };
        }
    }

    function undo(): { success: boolean; version?: number; message?: string } {
        if (state.undoStack.length === 0) {
            return { success: false, message: "Nothing to undo" };
        }

        const snapshot = state.undoStack.pop();
        const restoredRegistry = restoreSnapshot(state.registry, snapshot);

        state.registry = {
            ...restoredRegistry,
            version: state.registry.version + 1
        };

        state.patchHistory.push({
            patch: { kind: snapshot.kind, id: snapshot.id },
            version: state.registry.version,
            timestamp: Date.now(),
            action: "undo"
        });

        if (onChange) {
            onChange({
                type: "patch-undone",
                patch: { kind: snapshot.kind, id: snapshot.id },
                version: state.registry.version
            });
        }

        return { success: true, version: state.registry.version };
    }

    function trySafeApply(
        patchCandidate: unknown,
        onValidate?: (patch: Patch) => boolean | void
    ): TrySafeApplyResult {
        validatePatch(patchCandidate);
        const patch = patchCandidate;

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
                        : String(error ?? UNKNOWN_ERROR_MESSAGE);
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

            const lastSnapshot = state.undoStack.at(-1);
            if (
                lastSnapshot &&
                lastSnapshot.id === patch.id &&
                lastSnapshot.kind === patch.kind &&
                lastSnapshot.version === previousVersion
            ) {
                state.undoStack.pop();
            }

            const message =
                error instanceof Error
                    ? error.message
                    : String(error ?? UNKNOWN_ERROR_MESSAGE);

            state.patchHistory.push({
                patch: { kind: patch.kind, id: patch.id },
                version: state.registry.version,
                timestamp: Date.now(),
                action: "rollback",
                error: message
            });

            if (onChange) {
                onChange({
                    type: "patch-rolled-back",
                    patch,
                    version: state.registry.version,
                    error: message
                });
            }

            return {
                success: false,
                error: message,
                message: `Patch failed and was rolled back: ${message}`,
                rolledBack: true
            };
        }
    }

    function getPatchHistory(): Array<PatchHistoryEntry> {
        return [...state.patchHistory];
    }

    function getUndoStackSize(): number {
        return state.undoStack.length;
    }

    function getRegistrySnapshot(): RuntimeRegistrySnapshot {
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
        const stats: Omit<PatchStats, "uniqueIds"> = {
            totalPatches: state.patchHistory.length,
            appliedPatches: 0,
            undonePatches: 0,
            rolledBackPatches: 0,
            scriptPatches: 0,
            eventPatches: 0,
            closurePatches: 0
        };

        const uniqueIds = new Set<string>();

        for (const entry of state.patchHistory) {
            switch (entry.action) {
                case "apply": {
                    stats.appliedPatches++;

                    break;
                }
                case "undo": {
                    stats.undonePatches++;

                    break;
                }
                case "rollback": {
                    stats.rolledBackPatches++;

                    break;
                }
                // No default
            }

            uniqueIds.add(entry.patch.id);

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
        }

        const durations = collectPatchDurations(state.patchHistory);
        const timingMetrics = calculateTimingMetrics(durations);

        if (timingMetrics) {
            return { ...stats, ...timingMetrics, uniqueIds: uniqueIds.size };
        }

        return { ...stats, uniqueIds: uniqueIds.size };
    }

    function getVersion(): number {
        return state.registry.version;
    }

    function getScript(id: string): RuntimeFunction | undefined {
        return state.registry.scripts[id];
    }

    function getEvent(id: string): RuntimeFunction | undefined {
        return state.registry.events[id];
    }

    function hasScript(id: string): boolean {
        return id in state.registry.scripts;
    }

    function hasEvent(id: string): boolean {
        return id in state.registry.events;
    }

    function getClosure(id: string): RuntimeFunction | undefined {
        return state.registry.closures[id];
    }

    function hasClosure(id: string): boolean {
        return id in state.registry.closures;
    }

    function clearRegistry(): void {
        state.registry = createRegistry({
            version: state.registry.version + 1
        });
        state.undoStack = [];

        if (onChange) {
            onChange({
                type: "registry-cleared",
                version: state.registry.version
            });
        }
    }

    function checkRegistryHealth(): RegistryHealthCheck {
        const issues: Array<RegistryHealthIssue> = [];

        for (const [id, fn] of Object.entries(state.registry.scripts)) {
            if (typeof fn !== "function") {
                issues.push({
                    severity: "error",
                    category: "function-type",
                    message: `Script registry entry is not a function (type: ${typeof fn})`,
                    affectedId: id
                });
            }
        }

        for (const [id, fn] of Object.entries(state.registry.events)) {
            if (typeof fn !== "function") {
                issues.push({
                    severity: "error",
                    category: "function-type",
                    message: `Event registry entry is not a function (type: ${typeof fn})`,
                    affectedId: id
                });
            }
        }

        for (const [id, fn] of Object.entries(state.registry.closures)) {
            if (typeof fn !== "function") {
                issues.push({
                    severity: "error",
                    category: "function-type",
                    message: `Closure registry entry is not a function (type: ${typeof fn})`,
                    affectedId: id
                });
            }
        }

        return {
            healthy: issues.length === 0,
            version: state.registry.version,
            issues
        };
    }

    return {
        state,
        applyPatch,
        applyPatchBatch,
        trySafeApply,
        undo,
        getPatchHistory,
        getUndoStackSize,
        getRegistrySnapshot,
        getPatchStats,
        getVersion,
        getScript,
        getEvent,
        hasScript,
        hasEvent,
        getClosure,
        hasClosure,
        clearRegistry,
        checkRegistryHealth
    };
}
