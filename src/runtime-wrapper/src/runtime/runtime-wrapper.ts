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
    PatchStats,
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
        options: {
            validateBeforeApply: options.validateBeforeApply ?? false
        }
    };

    const onPatchApplied = options.onPatchApplied;

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
                        : String(error ?? "Unknown error");
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
                    : String(error ?? "Unknown error");

            state.patchHistory.push({
                patch: { kind: patch.kind, id: patch.id },
                version: state.registry.version,
                timestamp: Date.now(),
                action: "rollback",
                error: message
            });

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
        const durations: Array<number> = [];

        for (const entry of state.patchHistory) {
            if (entry.action === "apply") {
                stats.appliedPatches++;
                if (entry.durationMs !== undefined) {
                    durations.push(entry.durationMs);
                }
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

        if (durations.length > 0) {
            const totalDurationMs = durations.reduce(
                (sum, duration) => sum + duration,
                0
            );
            stats.totalDurationMs = totalDurationMs;
            stats.averagePatchDurationMs = totalDurationMs / durations.length;
            stats.fastestPatchMs = Math.min(...durations);
            stats.slowestPatchMs = Math.max(...durations);
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
        state.patchHistory.push({
            patch: { kind: "script", id: "__clear__" },
            version: state.registry.version,
            timestamp: Date.now(),
            action: "apply"
        });
    }

    return {
        state,
        applyPatch,
        trySafeApply,
        undo,
        getPatchHistory,
        getRegistrySnapshot,
        getPatchStats,
        getVersion,
        getScript,
        getEvent,
        hasScript,
        hasEvent,
        getClosure,
        hasClosure,
        clearRegistry
    };
}
