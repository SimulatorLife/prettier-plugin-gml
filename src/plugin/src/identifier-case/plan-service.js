import { assertFunction, assertPlainObject } from "../shared/index.js";
import { prepareIdentifierCasePlan as defaultPrepareIdentifierCasePlan } from "./local-plan.js";
import {
    getIdentifierCaseRenameForNode as defaultGetIdentifierCaseRenameForNode,
    captureIdentifierCasePlanSnapshot as defaultCaptureIdentifierCasePlanSnapshot,
    applyIdentifierCasePlanSnapshot as defaultApplyIdentifierCasePlanSnapshot
} from "./plan-state.js";

/**
 * The original IdentifierCasePlanService bundled plan preparation, rename
 * lookups, and snapshot orchestration behind one "service" facade. That wide
 * surface made collaborators depend on behaviours they did not always need.
 * Providers now register role-specific collaborators so consumers can opt into
 * only the behaviour they require. Snapshot capture/apply helpers previously
 * leaked through a single "snapshot service" contract as well, so the helpers
 * below expose them via focused capture/apply facades.
 */

/**
 * @typedef {object} IdentifierCasePlanPreparationService
 * @property {(options: object | null | undefined) => Promise<void>} prepareIdentifierCasePlan
 */

/**
 * @typedef {object} IdentifierCaseRenameLookupService
 * @property {(node: import("../shared/index.js").GameMakerAstNode | null, options: Record<string, unknown> | null | undefined) => string | null} getIdentifierCaseRenameForNode
 */

/**
 * @typedef {object} IdentifierCasePlanSnapshotCaptureService
 * @property {(options: unknown) => ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>} captureIdentifierCasePlanSnapshot
 */

/**
 * @typedef {object} IdentifierCasePlanSnapshotApplyService
 * @property {(snapshot: ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>, options: Record<string, unknown> | null | undefined) => void} applyIdentifierCasePlanSnapshot
 */

/**
 * @typedef {object} IdentifierCasePlanSnapshotCollaborators
 * @property {IdentifierCasePlanSnapshotCaptureService["captureIdentifierCasePlanSnapshot"]} captureIdentifierCasePlanSnapshot
 * @property {IdentifierCasePlanSnapshotApplyService["applyIdentifierCasePlanSnapshot"]} applyIdentifierCasePlanSnapshot
 */

/**
 * @typedef {() => IdentifierCasePlanPreparationService} IdentifierCasePlanPreparationProvider
 */

/**
 * @typedef {() => IdentifierCaseRenameLookupService} IdentifierCaseRenameLookupProvider
 */

/**
 * @typedef {() => IdentifierCasePlanSnapshotCollaborators} IdentifierCasePlanSnapshotProvider
 */

const defaultPreparationService = Object.freeze({
    prepareIdentifierCasePlan: defaultPrepareIdentifierCasePlan
});

const defaultRenameLookupService = Object.freeze({
    getIdentifierCaseRenameForNode: defaultGetIdentifierCaseRenameForNode
});

const defaultSnapshotService = Object.freeze({
    captureIdentifierCasePlanSnapshot: defaultCaptureIdentifierCasePlanSnapshot,
    applyIdentifierCasePlanSnapshot: defaultApplyIdentifierCasePlanSnapshot
});

function createIdentifierCaseServiceRegistry({
    defaultService,
    normalize,
    providerTypeErrorMessage,
    missingProviderMessage
}) {
    let provider = () => defaultService;
    let cachedService = null;

    function resolve() {
        if (!provider) {
            throw new Error(missingProviderMessage);
        }

        if (!cachedService) {
            cachedService = normalize(provider());
        }

        return cachedService;
    }

    function register(nextProvider) {
        provider = assertFunction(nextProvider, "provider", {
            errorMessage: providerTypeErrorMessage
        });

        cachedService = null;
    }

    function reset() {
        provider = () => defaultService;
        cachedService = null;
    }

    return { resolve, register, reset };
}

/**
 * Normalize a service object to ensure it exposes the expected function
 * collaborators. The identifier case plan services previously repeated the
 * same validation scaffolding (plain-object guard followed by function
 * assertions) which obscured the differences between each service. Centralizing
 * the logic keeps error messaging consistent and makes future service additions
 * trivial—callers simply describe the required function names.
 */
function normalizeIdentifierCaseServiceFunctions(
    service,
    { serviceErrorMessage, functionDescriptors }
) {
    const normalized = assertPlainObject(service, {
        errorMessage: serviceErrorMessage
    });

    return Object.freeze(
        Object.fromEntries(
            functionDescriptors.map(({ property, errorMessage }) => [
                property,
                assertFunction(normalized[property], property, {
                    errorMessage
                })
            ])
        )
    );
}

function normalizeIdentifierCasePlanPreparationService(service) {
    return normalizeIdentifierCaseServiceFunctions(service, {
        serviceErrorMessage:
            "Identifier case plan preparation service must be provided as an object",
        functionDescriptors: [
            {
                property: "prepareIdentifierCasePlan",
                errorMessage:
                    "Identifier case plan preparation service must provide a prepareIdentifierCasePlan function"
            }
        ]
    });
}

function normalizeIdentifierCaseRenameLookupService(service) {
    return normalizeIdentifierCaseServiceFunctions(service, {
        serviceErrorMessage:
            "Identifier case rename lookup service must be provided as an object",
        functionDescriptors: [
            {
                property: "getIdentifierCaseRenameForNode",
                errorMessage:
                    "Identifier case rename lookup service must provide a getIdentifierCaseRenameForNode function"
            }
        ]
    });
}

function normalizeIdentifierCasePlanSnapshotCollaborators(service) {
    return normalizeIdentifierCaseServiceFunctions(service, {
        serviceErrorMessage:
            "Identifier case plan snapshot collaborators must be provided as an object",
        functionDescriptors: [
            {
                property: "captureIdentifierCasePlanSnapshot",
                errorMessage:
                    "Identifier case plan snapshot collaborators must provide a captureIdentifierCasePlanSnapshot function"
            },
            {
                property: "applyIdentifierCasePlanSnapshot",
                errorMessage:
                    "Identifier case plan snapshot collaborators must provide an applyIdentifierCasePlanSnapshot function"
            }
        ]
    });
}

const preparationRegistry = createIdentifierCaseServiceRegistry({
    defaultService: defaultPreparationService,
    normalize: normalizeIdentifierCasePlanPreparationService,
    providerTypeErrorMessage:
        "Identifier case plan preparation provider must be a function",
    missingProviderMessage:
        "No identifier case plan preparation provider has been registered"
});

const renameLookupRegistry = createIdentifierCaseServiceRegistry({
    defaultService: defaultRenameLookupService,
    normalize: normalizeIdentifierCaseRenameLookupService,
    providerTypeErrorMessage:
        "Identifier case rename lookup provider must be a function",
    missingProviderMessage:
        "No identifier case rename lookup provider has been registered"
});

const snapshotRegistry = createIdentifierCaseServiceRegistry({
    defaultService: defaultSnapshotService,
    normalize: normalizeIdentifierCasePlanSnapshotCollaborators,
    providerTypeErrorMessage:
        "Identifier case plan snapshot provider must be a function",
    missingProviderMessage:
        "No identifier case plan snapshot provider has been registered"
});

const SNAPSHOT_CAPTURE_SERVICES = new WeakMap();
const SNAPSHOT_APPLY_SERVICES = new WeakMap();

function mapSnapshotCaptureService(collaborators) {
    let captureService = SNAPSHOT_CAPTURE_SERVICES.get(collaborators);
    if (!captureService) {
        captureService = Object.freeze({
            captureIdentifierCasePlanSnapshot:
                collaborators.captureIdentifierCasePlanSnapshot
        });
        SNAPSHOT_CAPTURE_SERVICES.set(collaborators, captureService);
    }

    return captureService;
}

function mapSnapshotApplyService(collaborators) {
    let applyService = SNAPSHOT_APPLY_SERVICES.get(collaborators);
    if (!applyService) {
        applyService = Object.freeze({
            applyIdentifierCasePlanSnapshot:
                collaborators.applyIdentifierCasePlanSnapshot
        });
        SNAPSHOT_APPLY_SERVICES.set(collaborators, applyService);
    }

    return applyService;
}

/**
 * Inject a custom preparation provider so embedders can override how the
 * identifier-case plan bootstraps itself. Passing `null` or a non-function will
 * surface a descriptive `TypeError` via the shared assertion helpers.
 *
 * @param {IdentifierCasePlanPreparationProvider} provider Factory returning the
 *        preparation service to use for subsequent calls.
 */
export function registerIdentifierCasePlanPreparationProvider(provider) {
    preparationRegistry.register(provider);
}

/**
 * Register a lookup provider responsible for mapping AST nodes to their case
 * corrections. Consumers typically install this when they need project-aware
 * rename logic during tests or bespoke integrations.
 *
 * @param {IdentifierCaseRenameLookupProvider} provider Function returning the
 *        lookup service implementation.
 */
export function registerIdentifierCaseRenameLookupProvider(provider) {
    renameLookupRegistry.register(provider);
}

/**
 * Register snapshot orchestration hooks so hosts can persist and restore
 * identifier-case state between formatter runs. Used primarily by long-lived
 * processes that cache rename plans across files.
 *
 * @param {IdentifierCasePlanSnapshotProvider} provider Function producing the
 *        snapshot collaborators implementation.
 */
export function registerIdentifierCasePlanSnapshotProvider(provider) {
    snapshotRegistry.register(provider);
}

/**
 * Restore the default provider trio. Useful for tests that temporarily swap in
 * bespoke collaborators and need a predictable baseline afterwards.
 */
export function resetIdentifierCasePlanServiceProvider() {
    preparationRegistry.reset();
    renameLookupRegistry.reset();
    snapshotRegistry.reset();
}

/**
 * Resolve the active preparation service.
 *
 * @returns {IdentifierCasePlanPreparationService}
 */
export function resolveIdentifierCasePlanPreparationService() {
    return preparationRegistry.resolve();
}

/**
 * Resolve the registered rename lookup service.
 *
 * @returns {IdentifierCaseRenameLookupService}
 */
export function resolveIdentifierCaseRenameLookupService() {
    return renameLookupRegistry.resolve();
}

/**
 * Resolve the active snapshot collaborators shared by the capture/apply views.
 *
 * @returns {IdentifierCasePlanSnapshotCollaborators}
 */
function resolveIdentifierCasePlanSnapshotCollaborators() {
    return snapshotRegistry.resolve();
}

/**
 * Resolve the snapshot capture service exposing only the capture helper.
 *
 * @returns {IdentifierCasePlanSnapshotCaptureService}
 */
export function resolveIdentifierCasePlanSnapshotCaptureService() {
    return mapSnapshotCaptureService(
        resolveIdentifierCasePlanSnapshotCollaborators()
    );
}

/**
 * Resolve the snapshot apply service exposing only the rehydration helper.
 *
 * @returns {IdentifierCasePlanSnapshotApplyService}
 */
export function resolveIdentifierCasePlanSnapshotApplyService() {
    return mapSnapshotApplyService(
        resolveIdentifierCasePlanSnapshotCollaborators()
    );
}

/**
 * Prepare the identifier-case plan using the active preparation service.
 *
 * @param {object | null | undefined} options Caller-provided configuration.
 * @returns {Promise<void>}
 */
export function prepareIdentifierCasePlan(options) {
    return resolveIdentifierCasePlanPreparationService().prepareIdentifierCasePlan(
        options
    );
}

/**
 * Look up the rename to apply for a given AST node using the registered
 * lookup service.
 *
 * @param {import("../shared/index.js").GameMakerAstNode | null} node
 * @param {Record<string, unknown> | null | undefined} options
 * @returns {string | null}
 */
export function getIdentifierCaseRenameForNode(node, options) {
    return resolveIdentifierCaseRenameLookupService().getIdentifierCaseRenameForNode(
        node,
        options
    );
}

/**
 * Capture the identifier-case plan snapshot for later reuse.
 *
 * @param {unknown} options Snapshot configuration passed through to the
 *        provider.
 * @returns {ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>}
 */
export function captureIdentifierCasePlanSnapshot(options) {
    return resolveIdentifierCasePlanSnapshotCaptureService().captureIdentifierCasePlanSnapshot(
        options
    );
}

/**
 * Rehydrate identifier-case plan state from a previously captured snapshot.
 *
 * @param {ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>} snapshot
 * @param {Record<string, unknown> | null | undefined} options
 * @returns {void}
 */
export function applyIdentifierCasePlanSnapshot(snapshot, options) {
    return resolveIdentifierCasePlanSnapshotApplyService().applyIdentifierCasePlanSnapshot(
        snapshot,
        options
    );
}
