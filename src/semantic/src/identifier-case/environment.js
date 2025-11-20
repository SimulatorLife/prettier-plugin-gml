import { Core } from "@gml-modules/core";
import { bootstrapIdentifierCaseProjectIndex } from "./project-index-gateway.js";
import {
    prepareIdentifierCasePlan,
    captureIdentifierCasePlanSnapshot
} from "./plan-service.js";
import {
    setIdentifierCaseOption,
    deleteIdentifierCaseOption
} from "./option-store.js";
import { warnWithReason } from "./logger.js";
// Use the canonical Core namespace for helpers per AGENTS.md
// (avoid destructuring from the package namespace)
// Helpers used from Core:
// - Core.Utils.isObjectLike
// - Core.Utils.isMapLike
// - Core.Utils.noop
// - Core.withObjectLike
const IDENTIFIER_CASE_LOGGER_NAMESPACE = "identifier-case";
const managedBootstraps = new WeakSet();
function clearOwnProperty(_target, propertyName, { value = null } = {}) {
    if (!Core.Utils.isObjectLike(_target)) {
        return;
    }
    if (!Object.hasOwn(_target, propertyName)) {
        return;
    }
    const nextValue =
        typeof value === "function" ? value(_target[propertyName]) : value;
    _target[propertyName] = nextValue;
}
function sanitizeBootstrapResult(bootstrap) {
    if (!Core.Utils.isObjectLike(bootstrap)) {
        return;
    }
    clearOwnProperty(bootstrap, "projectIndex");
    clearOwnProperty(bootstrap, "coordinator");
    if (typeof bootstrap.dispose === "function") {
        // The sanitized bootstrap stays attached to the Prettier options bag so
        // downstream diagnostics can report whether the index came from a cache
        // hit or a rebuild (see
        // docs/legacy-identifier-case-plan.md#bootstrap-configuration-and-caching).
        // Callers that probe this metadata still invoke `dispose()` inside
        // their own finally blocks—mirroring the rollout guidance in that doc—so
        // replacing the method with a noop keeps the teardown idempotent after
        // we have already released the underlying file watchers and caches.
        // Deleting the method or leaving the original callback in place would
        // cause those consumers to either crash (missing method) or double-free
        // resources that were never designed to be re-disposed.
        bootstrap.dispose = Core.Utils.noop;
    }
    const { cache } = bootstrap;
    clearOwnProperty(cache, "projectIndex");
    clearOwnProperty(cache?.payload, "projectIndex");
    clearOwnProperty(cache, "payload");
}
function registerBootstrapCleanup(bootstrapResult) {
    if (typeof bootstrapResult?.dispose !== "function") {
        return null;
    }
    managedBootstraps.add(bootstrapResult);
    return bootstrapResult;
}
function disposeBootstrap(bootstrapResult, logger = null) {
    if (!bootstrapResult || typeof bootstrapResult.dispose !== "function") {
        return;
    }
    if (!managedBootstraps.has(bootstrapResult)) {
        return;
    }
    managedBootstraps.delete(bootstrapResult);
    try {
        bootstrapResult.dispose();
    } catch (error) {
        warnWithReason(
            logger,
            IDENTIFIER_CASE_LOGGER_NAMESPACE,
            "Failed to dispose identifier case resources",
            error
        );
    }
}
export async function prepareIdentifierCaseEnvironment(options) {
    try {
        console.debug(
            `[DBG] prepareIdentifierCaseEnvironment: enter filepath=${options?.filepath ?? null}`
        );
    } catch {
        /* ignore */
    }
    return Core.withObjectLike(options, async (object) => {
        const bootstrapResult =
            await bootstrapIdentifierCaseProjectIndex(object);
        registerBootstrapCleanup(bootstrapResult);
        if (bootstrapResult?.status === "failed") {
            if (object.__identifierCaseProjectIndexFailureLogged !== true) {
                const logger = object?.logger ?? null;
                warnWithReason(
                    logger,
                    IDENTIFIER_CASE_LOGGER_NAMESPACE,
                    "Project index bootstrap failed. Identifier case renames will be skipped",
                    bootstrapResult.error,
                    bootstrapResult.reason
                );
                setIdentifierCaseOption(
                    object,
                    "__identifierCaseProjectIndexFailureLogged",
                    true
                );
            }
            return;
        }
        try {
            await prepareIdentifierCasePlan(object);
        } catch (error) {
            disposeBootstrap(bootstrapResult, object?.logger ?? null);
            throw error;
        }
    });
}
export function attachIdentifierCasePlanSnapshot(ast, options) {
    Core.withObjectLike(ast, (objectAst) => {
        const snapshot = captureIdentifierCasePlanSnapshot(options);
        // Only attach snapshots that carry meaningful planning state.
        // Empty snapshots (no renameMap and no planGenerated) are common
        // when callers omit a filepath and would otherwise overwrite a
        // previously-captured plan. Guarding here prevents attachment of
        // inert snapshots which strip rename data from downstream printers.
        if (
            !snapshot ||
            (snapshot.planGenerated !== true &&
                !Core.Utils.isMapLike(snapshot.renameMap))
        ) {
            return;
        }
        try {
            if (Core.Utils.isMapLike(snapshot.renameMap)) {
                const samples = [];
                let c = 0;
                for (const k of snapshot.renameMap.keys()) {
                    samples.push(String(k));
                    c += 1;
                    if (c >= 5) break;
                }
                console.debug(
                    `[DBG] attachIdentifierCasePlanSnapshot: attaching snapshot for filepath=${options?.filepath ?? null} planGenerated=${Boolean(snapshot.planGenerated)} renameMapSize=${snapshot.renameMap.size} renameMapId=${snapshot.renameMap.__dbgId ?? null} samples=${JSON.stringify(samples)}`
                );
            } else {
                console.debug(
                    `[DBG] attachIdentifierCasePlanSnapshot: attaching snapshot for filepath=${options?.filepath ?? null} planGenerated=${Boolean(snapshot.planGenerated)} renameMapSize=0 renameMapId=${null}`
                );
            }
        } catch {
            /* ignore */
        }
        Object.defineProperty(objectAst, "__identifierCasePlanSnapshot", {
            value: snapshot,
            enumerable: false,
            configurable: true
        });
    });
}
export function teardownIdentifierCaseEnvironment(options) {
    const bootstrap = options?.__identifierCaseProjectIndexBootstrap ?? null;
    disposeBootstrap(bootstrap, options?.logger ?? null);
    try {
        sanitizeBootstrapResult(bootstrap);
    } catch (error) {
        // Defensive: if sanitation throws for unexpected bootstrap shapes or
        // getters with side-effects, log and continue to avoid crashing the
        // caller (printer) during best-effort teardown.
        warnWithReason(
            options?.logger ?? null,
            IDENTIFIER_CASE_LOGGER_NAMESPACE,
            "Failed to sanitize identifier-case bootstrap during teardown",
            error
        );
    }
    deleteIdentifierCaseOption(options, "__identifierCaseProjectIndex");
    deleteIdentifierCaseOption(options, "__identifierCasePlanSnapshot");
    deleteIdentifierCaseOption(options, "__identifierCaseRenameMap");
}
//# sourceMappingURL=environment.js.map
