import {
    applyPatchInternal,
    captureSnapshot,
    createRegistry,
    restoreSnapshot,
    testPatchInShadow,
    validatePatch
} from "./patch-utils.js";
import type {
    ApplyPatchResult,
    Patch,
    PatchHistoryEntry,
    PatchKind,
    PatchPerformanceEntry,
    PatchStats,
    PerformanceMetrics,
    PerformanceStats,
    RuntimeFunction,
    RuntimeRegistrySnapshot,
    RuntimeWrapper,
    RuntimeWrapperOptions,
    RuntimeWrapperState,
    TrySafeApplyResult
} from "./types.js";

export function createRuntimeWrapper(
    options: RuntimeWrapperOptions = {}
): RuntimeWrapper {
    const baseRegistry = createRegistry(options.registry);

    const state: RuntimeWrapperState = {
        registry: baseRegistry,
        undoStack: [],
        patchHistory: [],
        performanceHistory: [],
        options: {
            validateBeforeApply: options.validateBeforeApply ?? false,
            enablePerformanceTracking:
                options.enablePerformanceTracking ?? false
        }
    };

    const onPatchApplied = options.onPatchApplied;

    function applyPatch(patchCandidate: unknown): ApplyPatchResult {
        const startTime = state.options.enablePerformanceTracking
            ? performance.now()
            : 0;
        let shadowValidationTime = 0;

        validatePatch(patchCandidate);
        const patch = patchCandidate;

        if (state.options.validateBeforeApply) {
            const shadowStart = state.options.enablePerformanceTracking
                ? performance.now()
                : 0;
            const testResult = testPatchInShadow(patch);
            if (state.options.enablePerformanceTracking) {
                shadowValidationTime = performance.now() - shadowStart;
            }

            if (!testResult.valid) {
                throw new Error(
                    `Patch validation failed for ${patch.id}: ${testResult.error}`
                );
            }
        }

        const snapshot = captureSnapshot(state.registry, patch);
        const timestamp = Date.now();

        try {
            const { registry: nextRegistry, result } = applyPatchInternal(
                state.registry,
                patch
            );
            state.registry = nextRegistry;
            state.undoStack.push(snapshot);
            state.patchHistory.push({
                patch: { kind: patch.kind, id: patch.id },
                version: state.registry.version,
                timestamp,
                action: "apply"
            });

            if (state.options.enablePerformanceTracking) {
                const totalTime = performance.now() - startTime;
                const patchTime = totalTime - shadowValidationTime;
                recordPerformance(patch, "apply", {
                    patchApplicationTimeMs: patchTime,
                    shadowValidationTimeMs:
                        shadowValidationTime > 0
                            ? shadowValidationTime
                            : undefined,
                    totalTimeMs: totalTime
                });
            }

            if (onPatchApplied) {
                onPatchApplied(patch, state.registry.version);
            }

            return result;
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : String(error ?? "Unknown error");
            throw new Error(`Failed to apply patch ${patch.id}: ${message}`);
        }
    }

    function undo(): { success: boolean; version?: number; message?: string } {
        const startTime = state.options.enablePerformanceTracking
            ? performance.now()
            : 0;

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

        if (state.options.enablePerformanceTracking) {
            const totalTime = performance.now() - startTime;
            recordPerformance(
                { kind: snapshot.kind, id: snapshot.id },
                "undo",
                {
                    patchApplicationTimeMs: totalTime,
                    totalTimeMs: totalTime
                }
            );
        }

        return { success: true, version: state.registry.version };
    }

    function recordPerformance(
        patch: { kind: PatchKind; id: string },
        action: "apply" | "undo" | "rollback",
        metrics: PerformanceMetrics
    ): void {
        state.performanceHistory.push({
            patchId: patch.id,
            patchKind: patch.kind,
            action,
            timestamp: Date.now(),
            metrics
        });
    }

    function trySafeApply(
        patchCandidate: unknown,
        onValidate?: (patch: Patch) => boolean | void
    ): TrySafeApplyResult {
        const startTime = state.options.enablePerformanceTracking
            ? performance.now()
            : 0;
        let shadowValidationTime = 0;

        validatePatch(patchCandidate);
        const patch = patchCandidate;

        const shadowStart = state.options.enablePerformanceTracking
            ? performance.now()
            : 0;
        const testResult = testPatchInShadow(patch);
        if (state.options.enablePerformanceTracking) {
            shadowValidationTime = performance.now() - shadowStart;
        }

        if (!testResult.valid) {
            return {
                success: false,
                error: testResult.error,
                message: `Shadow validation failed: ${testResult.error}`,
                rolledBack: false
            };
        }

        if (onValidate) {
            try {
                const validationResult = onValidate(patch);
                if (validationResult === false) {
                    return {
                        success: false,
                        error: "Custom validation rejected patch",
                        message: "Custom validation callback returned false",
                        rolledBack: false
                    };
                }
            } catch (error) {
                const message =
                    error instanceof Error
                        ? error.message
                        : String(error ?? "Unknown error");
                return {
                    success: false,
                    error: message,
                    message: `Custom validation failed: ${message}`,
                    rolledBack: false
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
            const rollbackStart = state.options.enablePerformanceTracking
                ? performance.now()
                : 0;

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
                    : String(error ?? "Unknown error");

            state.patchHistory.push({
                patch: { kind: patch.kind, id: patch.id },
                version: state.registry.version,
                timestamp: Date.now(),
                action: "rollback",
                error: message
            });

            if (state.options.enablePerformanceTracking) {
                const rollbackTime = performance.now() - rollbackStart;
                const totalTime = performance.now() - startTime;
                const patchTime =
                    totalTime - shadowValidationTime - rollbackTime;

                recordPerformance(patch, "rollback", {
                    patchApplicationTimeMs: patchTime,
                    shadowValidationTimeMs: shadowValidationTime,
                    rollbackTimeMs: rollbackTime,
                    totalTimeMs: totalTime
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
            scriptPatches: 0,
            eventPatches: 0,
            closurePatches: 0
        };

        const uniqueIds = new Set<string>();

        for (const entry of state.patchHistory) {
            if (entry.action === "apply") {
                stats.appliedPatches++;
            } else if (entry.action === "undo") {
                stats.undonePatches++;
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

    function getPerformanceHistory(): Array<PatchPerformanceEntry> {
        return [...state.performanceHistory];
    }

    function getPerformanceStats(): PerformanceStats {
        if (state.performanceHistory.length === 0) {
            return {
                totalOperations: 0,
                averagePatchTimeMs: 0,
                maxPatchTimeMs: 0,
                minPatchTimeMs: 0,
                totalTimeMs: 0,
                averageShadowValidationMs: 0,
                rollbackCount: 0,
                averageRollbackTimeMs: 0
            };
        }

        let totalPatchTime = 0;
        let maxPatchTime = 0;
        let minPatchTime = Number.POSITIVE_INFINITY;
        let totalTime = 0;
        let totalShadowValidation = 0;
        let shadowValidationCount = 0;
        let rollbackCount = 0;
        let totalRollbackTime = 0;

        for (const entry of state.performanceHistory) {
            const { metrics } = entry;
            totalPatchTime += metrics.patchApplicationTimeMs;
            totalTime += metrics.totalTimeMs;
            maxPatchTime = Math.max(
                maxPatchTime,
                metrics.patchApplicationTimeMs
            );
            minPatchTime = Math.min(
                minPatchTime,
                metrics.patchApplicationTimeMs
            );

            if (metrics.shadowValidationTimeMs !== undefined) {
                totalShadowValidation += metrics.shadowValidationTimeMs;
                shadowValidationCount++;
            }

            if (metrics.rollbackTimeMs !== undefined) {
                rollbackCount++;
                totalRollbackTime += metrics.rollbackTimeMs;
            }
        }

        return {
            totalOperations: state.performanceHistory.length,
            averagePatchTimeMs:
                totalPatchTime / state.performanceHistory.length,
            maxPatchTimeMs: maxPatchTime,
            minPatchTimeMs:
                minPatchTime === Number.POSITIVE_INFINITY ? 0 : minPatchTime,
            totalTimeMs: totalTime,
            averageShadowValidationMs:
                shadowValidationCount > 0
                    ? totalShadowValidation / shadowValidationCount
                    : 0,
            rollbackCount,
            averageRollbackTimeMs:
                rollbackCount > 0 ? totalRollbackTime / rollbackCount : 0
        };
    }

    function clearPerformanceHistory(): void {
        state.performanceHistory = [];
    }

    return {
        state,
        applyPatch,
        trySafeApply,
        undo,
        getPatchHistory,
        getRegistrySnapshot,
        getPatchStats,
        getPerformanceHistory,
        getPerformanceStats,
        clearPerformanceHistory,
        getVersion,
        getScript,
        getEvent,
        hasScript,
        hasEvent,
        getClosure,
        hasClosure
    };
}
