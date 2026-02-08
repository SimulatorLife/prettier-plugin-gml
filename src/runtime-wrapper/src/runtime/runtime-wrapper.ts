import {
    applyPatchInternal,
    calculateTimingMetrics,
    captureSnapshot,
    collectPatchDurations,
    createRegistry,
    restoreSnapshot,
    testPatchInShadow,
    validatePatch,
    validatePatchDependencies
} from "./patch-utils.js";
import { cloneObjectEntries, isErrorLike } from "./runtime-core-helpers.js";
import { getHighResolutionTime, getWallClockTime } from "./timing-utils.js";
import type {
    ApplyPatchResult,
    BatchApplyResult,
    Patch,
    PatchDiagnostics,
    PatchErrorAnalytics,
    PatchErrorCategory,
    PatchErrorSummary,
    PatchHistoryEntry,
    PatchKind,
    PatchMetadata,
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
import { evaluateUndoStackTrimPolicy } from "./undo-stack-policy.js";

const UNKNOWN_ERROR_MESSAGE = "Unknown error";
const DEFAULT_MAX_UNDO_STACK_SIZE = 50;

export function createRuntimeWrapper(options: RuntimeWrapperOptions = {}): RuntimeWrapper {
    const baseRegistry = createRegistry(options.registry);

    const state: RuntimeWrapperState = {
        registry: baseRegistry,
        undoStack: [],
        patchHistory: [],
        errorHistory: [],
        options: {
            validateBeforeApply: options.validateBeforeApply ?? false,
            maxUndoStackSize: options.maxUndoStackSize ?? DEFAULT_MAX_UNDO_STACK_SIZE
        }
    };

    const onPatchApplied = options.onPatchApplied;
    const onChange = options.onChange;

    function recordError(patch: Patch, category: PatchErrorCategory, error: unknown): void {
        let errorMessage: string;
        if (isErrorLike(error)) {
            errorMessage = error.message;
        } else if (error === null || error === undefined) {
            errorMessage = UNKNOWN_ERROR_MESSAGE;
        } else if (typeof error === "string") {
            errorMessage = error;
        } else if (typeof error === "number" || typeof error === "boolean") {
            errorMessage = String(error);
        } else {
            errorMessage = "Non-Error object thrown";
        }
        const stackTrace = isErrorLike(error) && error.stack ? error.stack : undefined;

        state.errorHistory.push({
            patchId: patch.id,
            patchKind: patch.kind,
            category,
            error: errorMessage,
            timestamp: getWallClockTime(),
            stackTrace
        });
    }

    function trimUndoStack(): void {
        const decision = evaluateUndoStackTrimPolicy({
            maxSize: state.options.maxUndoStackSize,
            currentSize: state.undoStack.length
        });

        if (decision.shouldTrim) {
            state.undoStack.splice(0, decision.trimCount);
        }
    }

    /**
     * Records a successfully applied patch in the undo stack and history,
     * then notifies observers about the registry update.
     */
    function recordAppliedPatch(
        patch: Patch,
        snapshot: ReturnType<typeof captureSnapshot>,
        appliedAt: number,
        durationMs: number
    ): void {
        state.undoStack.push(snapshot);
        trimUndoStack();
        state.patchHistory.push({
            patch: { kind: patch.kind, id: patch.id, metadata: patch.metadata },
            version: state.registry.version,
            timestamp: appliedAt,
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
    }

    function applyPatchWithValidation(
        patch: Patch,
        snapshot: ReturnType<typeof captureSnapshot> | null,
        skipShadowValidation: boolean
    ): ApplyPatchResult {
        const depValidation = validatePatchDependencies(patch, state.registry);
        if (!depValidation.satisfied) {
            const missingDeps = depValidation.missingDependencies.join(", ");
            const errorMessage = `Patch ${patch.id} has unsatisfied dependencies: ${missingDeps}`;
            recordError(patch, "validation", errorMessage);
            throw new Error(errorMessage);
        }

        if (state.options.validateBeforeApply && !skipShadowValidation) {
            const testResult = testPatchInShadow(patch);
            if (!testResult.valid) {
                recordError(patch, "shadow", testResult.error ?? "Unknown shadow validation error");
                throw new Error(`Patch validation failed for ${patch.id}: ${testResult.error}`);
            }
        }

        const resolvedSnapshot = snapshot ?? captureSnapshot(state.registry, patch);
        const startTime = getHighResolutionTime();

        try {
            const { registry: nextRegistry, result } = applyPatchInternal(state.registry, patch);
            const durationMs = getHighResolutionTime() - startTime;

            state.registry = nextRegistry;
            recordAppliedPatch(patch, resolvedSnapshot, getWallClockTime(), durationMs);

            return result;
        } catch (error) {
            recordError(patch, "application", error);
            const message = isErrorLike(error) ? error.message : String(error ?? UNKNOWN_ERROR_MESSAGE);
            throw new Error(`Failed to apply patch ${patch.id}: ${message}`);
        }
    }

    function applyPatch(patchCandidate: unknown): ApplyPatchResult {
        validatePatch(patchCandidate);
        const patch = patchCandidate;

        return applyPatchWithValidation(patch, null, false);
    }

    function validateBatchPatches(patchCandidates: Array<unknown>): Array<Patch> | BatchApplyResult {
        const validatedPatches: Array<Patch> = [];
        for (const candidate of patchCandidates) {
            validatePatch(candidate);
            validatedPatches.push(candidate);
        }

        // Validate dependencies for each patch in the batch
        for (const [index, patch] of validatedPatches.entries()) {
            const depValidation = validatePatchDependencies(patch, state.registry);
            if (!depValidation.satisfied) {
                const missingDeps = depValidation.missingDependencies.join(", ");
                const errorMessage = `Patch ${patch.id} has unsatisfied dependencies: ${missingDeps}`;
                recordError(patch, "validation", errorMessage);
                return {
                    success: false,
                    appliedCount: 0,
                    failedIndex: index,
                    error: "dependency_validation_failed",
                    message: `Batch dependency validation failed at patch ${index} (${patch.id}): ${errorMessage}`,
                    rolledBack: false
                };
            }
        }

        if (state.options.validateBeforeApply) {
            for (const [index, patch] of validatedPatches.entries()) {
                const testResult = testPatchInShadow(patch);
                if (!testResult.valid) {
                    recordError(patch, "shadow", testResult.error ?? "Unknown shadow validation error");
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

    function applyPatchBatch(patchCandidates: Array<unknown>): BatchApplyResult {
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

        const startTime = getHighResolutionTime();
        const wallClockStartTime = getWallClockTime();
        let appliedCount = 0;

        try {
            for (const patch of validatedPatches) {
                const snapshot = captureSnapshot(state.registry, patch);
                const patchStartTime = getHighResolutionTime();

                const { registry: nextRegistry } = applyPatchInternal(state.registry, patch);
                const durationMs = getHighResolutionTime() - patchStartTime;

                state.registry = nextRegistry;
                recordAppliedPatch(patch, snapshot, getWallClockTime(), durationMs);
                appliedCount++;
            }

            const totalDuration = getHighResolutionTime() - startTime;
            state.patchHistory.push({
                patch: {
                    kind: "script",
                    id: `batch:${appliedCount}_patches`
                },
                version: state.registry.version,
                timestamp: wallClockStartTime,
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
            const failedPatch = validatedPatches[appliedCount];
            if (failedPatch) {
                recordError(failedPatch, "application", error);
            }

            state.registry = batchSnapshot.registry;
            state.undoStack.length = batchSnapshot.undoStackSize;
            state.patchHistory.length = batchSnapshot.historySize;

            const message = isErrorLike(error) ? error.message : String(error ?? UNKNOWN_ERROR_MESSAGE);

            state.patchHistory.push({
                patch: {
                    kind: "script",
                    id: `batch:${appliedCount}_of_${validatedPatches.length}`
                },
                version: state.registry.version,
                timestamp: getWallClockTime(),
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
            timestamp: getWallClockTime(),
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

    function trySafeApply(patchCandidate: unknown, onValidate?: (patch: Patch) => boolean | void): TrySafeApplyResult {
        validatePatch(patchCandidate);
        const patch = patchCandidate;

        const testResult = testPatchInShadow(patch);
        if (!testResult.valid) {
            recordError(patch, "shadow", testResult.error ?? "Unknown shadow validation error");
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
                    recordError(patch, "validation", "Custom validation rejected patch");
                    return {
                        success: false,
                        error: "Custom validation rejected patch",
                        message: "Custom validation callback returned false"
                    };
                }
            } catch (error) {
                recordError(patch, "validation", error);
                const message = isErrorLike(error) ? error.message : String(error ?? UNKNOWN_ERROR_MESSAGE);
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
            const result = applyPatchWithValidation(patch, snapshot, true);
            return {
                success: true,
                version: result.version,
                rolledBack: false
            };
        } catch (error) {
            recordError(patch, "rollback", error);

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

            const message = isErrorLike(error) ? error.message : String(error ?? UNKNOWN_ERROR_MESSAGE);

            state.patchHistory.push({
                patch: { kind: patch.kind, id: patch.id, metadata: patch.metadata },
                version: state.registry.version,
                timestamp: getWallClockTime(),
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

    function getPatchById(id: string): Array<PatchHistoryEntry> {
        return state.patchHistory.filter((entry) => entry.patch.id === id);
    }

    function getPatchesByKind(kind: PatchKind): Array<PatchHistoryEntry> {
        return state.patchHistory.filter((entry) => entry.patch.kind === kind);
    }

    function getRegistrySnapshot(): RuntimeRegistrySnapshot {
        const scripts = Object.keys(state.registry.scripts);
        const events = Object.keys(state.registry.events);
        const closures = Object.keys(state.registry.closures);

        return {
            version: state.registry.version,
            scriptCount: scripts.length,
            eventCount: events.length,
            closureCount: closures.length,
            scripts,
            events,
            closures
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

    function getPatchDiagnostics(id: string): PatchDiagnostics | null {
        const historyEntries: Array<PatchHistoryEntry> = [];
        let kind: PatchKind | null = null;
        let metadata: PatchMetadata | undefined;
        let applicationCount = 0;
        let undoCount = 0;
        let rollbackCount = 0;
        let firstAppliedAt: number | null = null;
        let lastAppliedAt: number | null = null;
        let durationSum = 0;
        let durationCount = 0;

        for (const entry of state.patchHistory) {
            if (entry.patch.id !== id) {
                continue;
            }

            historyEntries.push(entry);

            if (!kind) {
                kind = entry.patch.kind;
            }

            if (!metadata && entry.patch.metadata) {
                metadata = entry.patch.metadata;
            }

            switch (entry.action) {
                case "apply": {
                    applicationCount++;
                    if (firstAppliedAt === null) {
                        firstAppliedAt = entry.timestamp;
                    }
                    lastAppliedAt = entry.timestamp;
                    if (typeof entry.durationMs === "number") {
                        durationSum += entry.durationMs;
                        durationCount++;
                    }
                    break;
                }
                case "undo": {
                    undoCount++;
                    break;
                }
                case "rollback": {
                    rollbackCount++;
                    break;
                }
                // No default
            }
        }

        if (historyEntries.length === 0 || !kind) {
            return null;
        }

        const averageDurationMs = durationCount > 0 ? durationSum / durationCount : null;

        const currentlyApplied =
            (kind === "script" && hasScript(id)) ||
            (kind === "event" && hasEvent(id)) ||
            (kind === "closure" && hasClosure(id));

        return {
            id,
            kind,
            applicationCount,
            firstAppliedAt,
            lastAppliedAt,
            currentlyApplied,
            undoCount,
            rollbackCount,
            averageDurationMs,
            sourcePath: metadata?.sourcePath ?? null,
            sourceHash: metadata?.sourceHash ?? null,
            dependencies: metadata?.dependencies ?? [],
            historyEntries: [...historyEntries]
        };
    }

    function getErrorAnalytics(): PatchErrorAnalytics {
        const totalErrors = state.errorHistory.length;

        const errorsByCategory: Record<PatchErrorCategory, number> = {
            validation: 0,
            shadow: 0,
            application: 0,
            rollback: 0
        };

        const errorsByKind: Record<PatchKind, number> = {
            script: 0,
            event: 0,
            closure: 0
        };

        const patchErrorCounts = new Map<string, number>();

        for (const errorEntry of state.errorHistory) {
            errorsByCategory[errorEntry.category] = (errorsByCategory[errorEntry.category] ?? 0) + 1;
            errorsByKind[errorEntry.patchKind] = (errorsByKind[errorEntry.patchKind] ?? 0) + 1;

            const currentCount = patchErrorCounts.get(errorEntry.patchId) ?? 0;
            patchErrorCounts.set(errorEntry.patchId, currentCount + 1);
        }

        const uniquePatchesWithErrors = patchErrorCounts.size;

        const sortedEntries = Array.from(patchErrorCounts.entries())
            .map(([patchId, errorCount]) => ({ patchId, errorCount }))
            .toSorted((a, b) => b.errorCount - a.errorCount);

        const mostProblematicPatches = sortedEntries.slice(0, 10);

        const recentErrors = cloneObjectEntries(state.errorHistory.slice(-20));

        const totalPatches = state.patchHistory.filter((entry) => entry.action === "apply").length;
        const errorRate = totalPatches > 0 ? totalErrors / totalPatches : 0;

        return {
            totalErrors,
            errorsByCategory,
            errorsByKind,
            uniquePatchesWithErrors,
            mostProblematicPatches,
            recentErrors,
            errorRate
        };
    }

    function getErrorsForPatch(patchId: string): PatchErrorSummary | null {
        const errorsForPatch = state.errorHistory.filter((entry) => entry.patchId === patchId);

        if (errorsForPatch.length === 0) {
            return null;
        }

        const errorsByCategory: Record<PatchErrorCategory, number> = {
            validation: 0,
            shadow: 0,
            application: 0,
            rollback: 0
        };

        const uniqueErrors = new Set<string>();

        for (const errorEntry of errorsForPatch) {
            errorsByCategory[errorEntry.category] = (errorsByCategory[errorEntry.category] ?? 0) + 1;
            uniqueErrors.add(errorEntry.error);
        }

        const firstError = errorsForPatch[0];
        const lastError = errorsForPatch.at(-1);

        return {
            patchId,
            totalErrors: errorsForPatch.length,
            errorsByCategory,
            firstErrorAt: firstError.timestamp,
            lastErrorAt: lastError.timestamp,
            mostRecentError: lastError.error,
            uniqueErrorMessages: uniqueErrors.size
        };
    }

    function clearErrorHistory(): void {
        state.errorHistory = [];
    }

    return {
        state,
        applyPatch,
        applyPatchBatch,
        trySafeApply,
        undo,
        getPatchHistory,
        getUndoStackSize,
        getPatchById,
        getPatchesByKind,
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
        checkRegistryHealth,
        getPatchDiagnostics,
        getErrorAnalytics,
        getErrorsForPatch,
        clearErrorHistory
    };
}
