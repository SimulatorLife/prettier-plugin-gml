import { prepareIdentifierCasePlan as defaultPrepareIdentifierCasePlan } from "./local-plan.js";
import {
    getIdentifierCaseRenameForNode as defaultGetIdentifierCaseRenameForNode,
    captureIdentifierCasePlanSnapshot as defaultCaptureIdentifierCasePlanSnapshot,
    applyIdentifierCasePlanSnapshot as defaultApplyIdentifierCasePlanSnapshot
} from "./plan-state.js";

/**
 * @typedef {object} IdentifierCasePlanService
 * @property {(options: object | null | undefined) => Promise<void>} prepareIdentifierCasePlan
 * @property {(node: import("../../../shared/ast.js").GameMakerAstNode | null, options: Record<string, unknown> | null | undefined) => string | null} getIdentifierCaseRenameForNode
 * @property {(options: unknown) => ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>} captureIdentifierCasePlanSnapshot
 * @property {(snapshot: ReturnType<typeof defaultCaptureIdentifierCasePlanSnapshot>, options: Record<string, unknown> | null | undefined) => void} applyIdentifierCasePlanSnapshot
 */

/**
 * @typedef {() => IdentifierCasePlanService} IdentifierCasePlanServiceProvider
 */

let serviceProvider = createDefaultIdentifierCasePlanServiceProvider();
let cachedService = null;

function createDefaultIdentifierCasePlanServiceProvider() {
    return () =>
        normalizeIdentifierCasePlanService({
            prepareIdentifierCasePlan: defaultPrepareIdentifierCasePlan,
            getIdentifierCaseRenameForNode:
                defaultGetIdentifierCaseRenameForNode,
            captureIdentifierCasePlanSnapshot:
                defaultCaptureIdentifierCasePlanSnapshot,
            applyIdentifierCasePlanSnapshot:
                defaultApplyIdentifierCasePlanSnapshot
        });
}

function normalizeIdentifierCasePlanService(service) {
    if (!service || typeof service !== "object") {
        throw new TypeError(
            "Identifier case plan service must be provided as an object"
        );
    }

    const {
        prepareIdentifierCasePlan,
        getIdentifierCaseRenameForNode,
        captureIdentifierCasePlanSnapshot,
        applyIdentifierCasePlanSnapshot
    } = service;

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

export function registerIdentifierCasePlanServiceProvider(provider) {
    if (typeof provider !== "function") {
        throw new TypeError(
            "Identifier case plan service provider must be a function"
        );
    }

    serviceProvider = () => normalizeIdentifierCasePlanService(provider());
    cachedService = null;
}

export function resetIdentifierCasePlanServiceProvider() {
    serviceProvider = createDefaultIdentifierCasePlanServiceProvider();
    cachedService = null;
}

export function resolveIdentifierCasePlanService() {
    return resolveIdentifierCasePlanServiceInternal();
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
