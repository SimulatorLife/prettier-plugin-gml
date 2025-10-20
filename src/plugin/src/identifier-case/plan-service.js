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
 * We preserve the legacy facade for compatibility while also exposing narrow
 * preparation, rename, and snapshot views to honour interface segregation.
 */

/**
 * @typedef {object} IdentifierCasePlanService
 * @property {(options: object | null | undefined) => Promise<void>} prepareIdentifierCasePlan
 * @property {(node: import("../../../shared/ast.js").GameMakerAstNode | null, options: Record<string, unknown> | null | undefined) => string | null} getIdentifierCaseRenameForNode
 * @property {(options: unknown) => ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>} captureIdentifierCasePlanSnapshot
 * @property {(snapshot: ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>, options: Record<string, unknown> | null | undefined) => void} applyIdentifierCasePlanSnapshot
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
 * @typedef {() => IdentifierCasePlanService} IdentifierCasePlanServiceProvider
 */

let serviceProvider = createDefaultIdentifierCasePlanServiceProvider();
let cachedService = null;
let cachedPreparationService = null;
let cachedRenameLookupService = null;
let cachedSnapshotService = null;

function createDefaultIdentifierCasePlanServiceProvider() {
    return () => ({
        prepareIdentifierCasePlan: defaultPrepareIdentifierCasePlan,
        getIdentifierCaseRenameForNode: defaultGetIdentifierCaseRenameForNode,
        captureIdentifierCasePlanSnapshot:
            defaultCaptureIdentifierCasePlanSnapshot,
        applyIdentifierCasePlanSnapshot: defaultApplyIdentifierCasePlanSnapshot
    });
}

function normalizeIdentifierCasePlanService(service) {
    const {
        prepareIdentifierCasePlan,
        getIdentifierCaseRenameForNode,
        captureIdentifierCasePlanSnapshot,
        applyIdentifierCasePlanSnapshot
    } = assertPlainObject(service, {
        errorMessage:
            "Identifier case plan service must be provided as an object"
    });

    if (typeof prepareIdentifierCasePlan !== "function") {
        throw new TypeError(
            "Identifier case plan service must provide a prepareIdentifierCasePlan function"
        );
    }

    if (typeof getIdentifierCaseRenameForNode !== "function") {
        throw new TypeError(
            "Identifier case plan service must provide a getIdentifierCaseRenameForNode function"
        );
    }

    if (typeof captureIdentifierCasePlanSnapshot !== "function") {
        throw new TypeError(
            "Identifier case plan service must provide a captureIdentifierCasePlanSnapshot function"
        );
    }

    if (typeof applyIdentifierCasePlanSnapshot !== "function") {
        throw new TypeError(
            "Identifier case plan service must provide an applyIdentifierCasePlanSnapshot function"
        );
    }

    return Object.freeze({
        prepareIdentifierCasePlan,
        getIdentifierCaseRenameForNode,
        captureIdentifierCasePlanSnapshot,
        applyIdentifierCasePlanSnapshot
    });
}

function resolveIdentifierCasePlanServiceInternal() {
    if (!serviceProvider) {
        throw new Error(
            "No identifier case plan service provider has been registered"
        );
    }

    if (!cachedService) {
        cachedService = normalizeIdentifierCasePlanService(serviceProvider());
    }

    return cachedService;
}

function invalidateCachedViews() {
    cachedService = null;
    cachedPreparationService = null;
    cachedRenameLookupService = null;
    cachedSnapshotService = null;
}

function refreshCachedServiceView(cache, service, propertyNames) {
    const keys = Array.isArray(propertyNames) ? propertyNames : [propertyNames];

    if (
        cache &&
        keys.every(
            (propertyName) => cache[propertyName] === service[propertyName]
        )
    ) {
        return cache;
    }

    const nextView = {};
    for (const propertyName of keys) {
        nextView[propertyName] = service[propertyName];
    }

    return Object.freeze(nextView);
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
    const service = resolveIdentifierCasePlanServiceInternal();
    cachedPreparationService = refreshCachedServiceView(
        cachedPreparationService,
        service,
        "prepareIdentifierCasePlan"
    );
    return cachedPreparationService;
}

export function resolveIdentifierCaseRenameLookupService() {
    const service = resolveIdentifierCasePlanServiceInternal();
    cachedRenameLookupService = refreshCachedServiceView(
        cachedRenameLookupService,
        service,
        "getIdentifierCaseRenameForNode"
    );
    return cachedRenameLookupService;
}

export function resolveIdentifierCasePlanSnapshotService() {
    const service = resolveIdentifierCasePlanServiceInternal();
    cachedSnapshotService = refreshCachedServiceView(
        cachedSnapshotService,
        service,
        ["captureIdentifierCasePlanSnapshot", "applyIdentifierCasePlanSnapshot"]
    );
    return cachedSnapshotService;
}

export function prepareIdentifierCasePlan(options) {
    return resolveIdentifierCasePlanServiceInternal().prepareIdentifierCasePlan(
        options
    );
}

export function getIdentifierCaseRenameForNode(node, options) {
    return resolveIdentifierCasePlanServiceInternal().getIdentifierCaseRenameForNode(
        node,
        options
    );
}

export function captureIdentifierCasePlanSnapshot(options) {
    return resolveIdentifierCasePlanServiceInternal().captureIdentifierCasePlanSnapshot(
        options
    );
}

export function applyIdentifierCasePlanSnapshot(snapshot, options) {
    return resolveIdentifierCasePlanServiceInternal().applyIdentifierCasePlanSnapshot(
        snapshot,
        options
    );
}
