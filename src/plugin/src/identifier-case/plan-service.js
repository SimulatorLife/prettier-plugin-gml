import { assertPlainObject } from "../shared/object-utils.js";
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
 * @property {(node: import("../shared/ast.js").GameMakerAstNode | null, options: Record<string, unknown> | null | undefined) => string | null} getIdentifierCaseRenameForNode
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

/**
 * @typedef {object} IdentifierCasePlanServices
 * @property {IdentifierCasePlanPreparationService} preparation
 * @property {IdentifierCaseRenameLookupService} renameLookup
 * @property {IdentifierCasePlanSnapshotService} snapshot
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

let preparationProvider = createDefaultIdentifierCasePlanPreparationProvider();
let renameLookupProvider = createDefaultIdentifierCaseRenameLookupProvider();
let snapshotProvider = createDefaultIdentifierCasePlanSnapshotProvider();

let cachedPreparationService = null;
let cachedRenameLookupService = null;
let cachedSnapshotService = null;
let cachedServiceBundle = null;

function createDefaultIdentifierCasePlanPreparationProvider() {
    return () => defaultPreparationService;
}

function createDefaultIdentifierCaseRenameLookupProvider() {
    return () => defaultRenameLookupService;
}

function createDefaultIdentifierCasePlanSnapshotProvider() {
    return () => defaultSnapshotService;
}

function normalizeIdentifierCasePlanPreparationService(service) {
    const { prepareIdentifierCasePlan } = assertPlainObject(service, {
        errorMessage:
            "Identifier case plan preparation service must be provided as an object"
    });

    if (typeof prepareIdentifierCasePlan !== "function") {
        throw new TypeError(
            "Identifier case plan preparation service must provide a prepareIdentifierCasePlan function"
        );
    }

    return Object.freeze({ prepareIdentifierCasePlan });
}

function normalizeIdentifierCaseRenameLookupService(service) {
    const { getIdentifierCaseRenameForNode } = assertPlainObject(service, {
        errorMessage:
            "Identifier case rename lookup service must be provided as an object"
    });

    if (typeof getIdentifierCaseRenameForNode !== "function") {
        throw new TypeError(
            "Identifier case rename lookup service must provide a getIdentifierCaseRenameForNode function"
        );
    }

    return Object.freeze({ getIdentifierCaseRenameForNode });
}

function normalizeIdentifierCasePlanSnapshotService(service) {
    const {
        captureIdentifierCasePlanSnapshot,
        applyIdentifierCasePlanSnapshot
    } = assertPlainObject(service, {
        errorMessage:
            "Identifier case plan snapshot service must be provided as an object"
    });

    if (typeof captureIdentifierCasePlanSnapshot !== "function") {
        throw new TypeError(
            "Identifier case plan snapshot service must provide a captureIdentifierCasePlanSnapshot function"
        );
    }

    if (typeof applyIdentifierCasePlanSnapshot !== "function") {
        throw new TypeError(
            "Identifier case plan snapshot service must provide an applyIdentifierCasePlanSnapshot function"
        );
    }

    return Object.freeze({
        captureIdentifierCasePlanSnapshot,
        applyIdentifierCasePlanSnapshot
    });
}

function normalizeIdentifierCasePlanServices(services) {
    const { preparation, renameLookup, snapshot } = assertPlainObject(
        services,
        {
            errorMessage:
                "Identifier case plan service provider must return an object containing segregated services"
        }
    );

    return Object.freeze({
        preparation: normalizeIdentifierCasePlanPreparationService(preparation),
        renameLookup: normalizeIdentifierCaseRenameLookupService(renameLookup),
        snapshot: normalizeIdentifierCasePlanSnapshotService(snapshot)
    });
}

function resolveIdentifierCasePlanPreparationServiceInternal() {
    if (!preparationProvider) {
        throw new Error(
            "No identifier case plan preparation provider has been registered"
        );
    }

    if (!cachedPreparationService) {
        cachedPreparationService =
            normalizeIdentifierCasePlanPreparationService(
                preparationProvider()
            );
    }

    return cachedPreparationService;
}

function resolveIdentifierCaseRenameLookupServiceInternal() {
    if (!renameLookupProvider) {
        throw new Error(
            "No identifier case rename lookup provider has been registered"
        );
    }

    if (!cachedRenameLookupService) {
        cachedRenameLookupService = normalizeIdentifierCaseRenameLookupService(
            renameLookupProvider()
        );
    }

    return cachedRenameLookupService;
}

function resolveIdentifierCasePlanSnapshotServiceInternal() {
    if (!snapshotProvider) {
        throw new Error(
            "No identifier case plan snapshot provider has been registered"
        );
    }

    if (!cachedSnapshotService) {
        cachedSnapshotService =
            normalizeIdentifierCasePlanSnapshotService(snapshotProvider());
    }

    return cachedSnapshotService;
}

function resolveIdentifierCasePlanServiceInternal() {
    if (!cachedServiceBundle) {
        cachedServiceBundle = Object.freeze({
            preparation: resolveIdentifierCasePlanPreparationServiceInternal(),
            renameLookup: resolveIdentifierCaseRenameLookupServiceInternal(),
            snapshot: resolveIdentifierCasePlanSnapshotServiceInternal()
        });
    }

    return cachedServiceBundle;
}

function invalidateCachedViews() {
    cachedPreparationService = null;
    cachedRenameLookupService = null;
    cachedSnapshotService = null;
    cachedServiceBundle = null;
}

export function registerIdentifierCasePlanPreparationProvider(provider) {
    if (typeof provider !== "function") {
        throw new TypeError(
            "Identifier case plan preparation provider must be a function"
        );
    }

    preparationProvider = () => provider();
    invalidateCachedViews();
}

export function registerIdentifierCaseRenameLookupProvider(provider) {
    if (typeof provider !== "function") {
        throw new TypeError(
            "Identifier case rename lookup provider must be a function"
        );
    }

    renameLookupProvider = () => provider();
    invalidateCachedViews();
}

export function registerIdentifierCasePlanSnapshotProvider(provider) {
    if (typeof provider !== "function") {
        throw new TypeError(
            "Identifier case plan snapshot provider must be a function"
        );
    }

    snapshotProvider = () => provider();
    invalidateCachedViews();
}

export function registerIdentifierCasePlanServiceProvider(provider) {
    if (typeof provider !== "function") {
        throw new TypeError(
            "Identifier case plan service provider must be a function"
        );
    }

    const resolveBundle = (() => {
        let bundle = null;
        return () => {
            if (!bundle) {
                bundle = normalizeIdentifierCasePlanServices(provider());
            }
            return bundle;
        };
    })();

    registerIdentifierCasePlanPreparationProvider(() => {
        return resolveBundle().preparation;
    });
    registerIdentifierCaseRenameLookupProvider(() => {
        return resolveBundle().renameLookup;
    });
    registerIdentifierCasePlanSnapshotProvider(() => {
        return resolveBundle().snapshot;
    });
}

export function resetIdentifierCasePlanServiceProvider() {
    preparationProvider = createDefaultIdentifierCasePlanPreparationProvider();
    renameLookupProvider = createDefaultIdentifierCaseRenameLookupProvider();
    snapshotProvider = createDefaultIdentifierCasePlanSnapshotProvider();
    invalidateCachedViews();
}

/**
 * @returns {IdentifierCasePlanServices}
 */
export function resolveIdentifierCasePlanService() {
    return resolveIdentifierCasePlanServiceInternal();
}

export function resolveIdentifierCasePlanPreparationService() {
    return resolveIdentifierCasePlanPreparationServiceInternal();
}

export function resolveIdentifierCaseRenameLookupService() {
    return resolveIdentifierCaseRenameLookupServiceInternal();
}

export function resolveIdentifierCasePlanSnapshotService() {
    return resolveIdentifierCasePlanSnapshotServiceInternal();
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
