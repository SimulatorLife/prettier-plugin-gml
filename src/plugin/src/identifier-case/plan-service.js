import { assertPlainObject } from "../../../shared/object-utils.js";
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
 * Providers must now return segregated service views so that consumers only
 * depend on the behaviours they exercise.
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
 * @typedef {object} IdentifierCasePlanServiceBundle
 * @property {IdentifierCasePlanPreparationService} preparation
 * @property {IdentifierCaseRenameLookupService} renameLookup
 * @property {IdentifierCasePlanSnapshotService} snapshot
 */

/**
 * @typedef {() => IdentifierCasePlanServiceBundle} IdentifierCasePlanServiceProvider
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

let serviceProvider = createDefaultIdentifierCasePlanServiceProvider();
let cachedServices = null;

function createDefaultIdentifierCasePlanServiceProvider() {
    return () => ({
        preparation: defaultPreparationService,
        renameLookup: defaultRenameLookupService,
        snapshot: defaultSnapshotService
    });
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

function resolveIdentifierCasePlanServiceInternal() {
    if (!serviceProvider) {
        throw new Error(
            "No identifier case plan service provider has been registered"
        );
    }

    if (!cachedServices) {
        cachedServices = normalizeIdentifierCasePlanServices(serviceProvider());
    }

    return cachedServices;
}

function invalidateCachedViews() {
    cachedServices = null;
}

export function registerIdentifierCasePlanServiceProvider(provider) {
    if (typeof provider !== "function") {
        throw new TypeError(
            "Identifier case plan service provider must be a function"
        );
    }

    serviceProvider = () => provider();
    invalidateCachedViews();
}

export function resetIdentifierCasePlanServiceProvider() {
    serviceProvider = createDefaultIdentifierCasePlanServiceProvider();
    invalidateCachedViews();
}

export function resolveIdentifierCasePlanService() {
    return resolveIdentifierCasePlanServiceInternal();
}

export function resolveIdentifierCasePlanPreparationService() {
    return resolveIdentifierCasePlanServiceInternal().preparation;
}

export function resolveIdentifierCaseRenameLookupService() {
    return resolveIdentifierCasePlanServiceInternal().renameLookup;
}

export function resolveIdentifierCasePlanSnapshotService() {
    return resolveIdentifierCasePlanServiceInternal().snapshot;
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
