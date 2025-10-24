import {
    assertFunction,
    assertPlainObject
} from "../../../shared/object-utils.js";
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
 * only the behaviour they require.
 */

/**
 * @typedef {object} IdentifierCasePlanPreparationService
 * @property {(options: object | null | undefined) => Promise<void>} prepareIdentifierCasePlan
 */

/**
 * @typedef {object} IdentifierCaseRenameLookupService
 * @property {(node: import("../../../shared/ast.js").GameMakerAstNode | null, options: Record<string, unknown> | null | undefined) => string | null} getIdentifierCaseRenameForNode
 */

/**
 * @typedef {object} IdentifierCasePlanSnapshotService
 * @property {(options: unknown) => ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>} captureIdentifierCasePlanSnapshot
 * @property {(snapshot: ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>, options: Record<string, unknown> | null | undefined) => void} applyIdentifierCasePlanSnapshot
 */

/**
 * @typedef {() => IdentifierCasePlanPreparationService} IdentifierCasePlanPreparationProvider
 */

/**
 * @typedef {() => IdentifierCaseRenameLookupService} IdentifierCaseRenameLookupProvider
 */

/**
 * @typedef {() => IdentifierCasePlanSnapshotService} IdentifierCasePlanSnapshotProvider
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
 * assertions) which obscured the differences between each service. Centralising
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

function normalizeIdentifierCasePlanSnapshotService(service) {
    return normalizeIdentifierCaseServiceFunctions(service, {
        serviceErrorMessage:
            "Identifier case plan snapshot service must be provided as an object",
        functionDescriptors: [
            {
                property: "captureIdentifierCasePlanSnapshot",
                errorMessage:
                    "Identifier case plan snapshot service must provide a captureIdentifierCasePlanSnapshot function"
            },
            {
                property: "applyIdentifierCasePlanSnapshot",
                errorMessage:
                    "Identifier case plan snapshot service must provide an applyIdentifierCasePlanSnapshot function"
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
    normalize: normalizeIdentifierCasePlanSnapshotService,
    providerTypeErrorMessage:
        "Identifier case plan snapshot provider must be a function",
    missingProviderMessage:
        "No identifier case plan snapshot provider has been registered"
});

export function registerIdentifierCasePlanPreparationProvider(provider) {
    preparationRegistry.register(provider);
}

export function registerIdentifierCaseRenameLookupProvider(provider) {
    renameLookupRegistry.register(provider);
}

export function registerIdentifierCasePlanSnapshotProvider(provider) {
    snapshotRegistry.register(provider);
}

export function resetIdentifierCasePlanServiceProvider() {
    preparationRegistry.reset();
    renameLookupRegistry.reset();
    snapshotRegistry.reset();
}

export function resolveIdentifierCasePlanPreparationService() {
    return preparationRegistry.resolve();
}

export function resolveIdentifierCaseRenameLookupService() {
    return renameLookupRegistry.resolve();
}

export function resolveIdentifierCasePlanSnapshotService() {
    return snapshotRegistry.resolve();
}

export function prepareIdentifierCasePlan(options) {
    return resolveIdentifierCasePlanPreparationService().prepareIdentifierCasePlan(
        options
    );
}

export function getIdentifierCaseRenameForNode(node, options) {
    return resolveIdentifierCaseRenameLookupService().getIdentifierCaseRenameForNode(
        node,
        options
    );
}

export function captureIdentifierCasePlanSnapshot(options) {
    return resolveIdentifierCasePlanSnapshotService().captureIdentifierCasePlanSnapshot(
        options
    );
}

export function applyIdentifierCasePlanSnapshot(snapshot, options) {
    return resolveIdentifierCasePlanSnapshotService().applyIdentifierCasePlanSnapshot(
        snapshot,
        options
    );
}
