import {
    defaultCliProjectIndexService,
    defaultCliIdentifierCasePlanService,
    defaultCliIdentifierCasePlanPreparationService,
    defaultCliIdentifierCaseCacheService
} from "./plugin-service-providers/default-plugin-services.js";

/**
 * @typedef {(projectRoot: string, manifest?: unknown, options?: object) => Promise<object>} CliProjectIndexBuilder
 * @typedef {(options: object) => Promise<void>} CliIdentifierCasePlanPreparer
 * @typedef {() => void} CliIdentifierCaseCacheClearer
 */

let projectIndexBuilder;
let identifierCasePlanPreparer;
let identifierCaseCacheClearer;

export const defaultCliPluginServices = Object.freeze({
    projectIndex: defaultCliProjectIndexService,
    identifierCasePlan: defaultCliIdentifierCasePlanService,
    identifierCasePlanPreparation:
        defaultCliIdentifierCasePlanPreparationService,
    identifierCasePlanCache: defaultCliIdentifierCaseCacheService
});

resetRegisteredCliPluginServices();

function assertService(candidate, description) {
    if (typeof candidate !== "function") {
        throw new TypeError(
            `CLI plugin services must provide a ${description} function`
        );
    }
}

export function resolveCliProjectIndexBuilder() {
    assertService(projectIndexBuilder, "buildProjectIndex");
    return projectIndexBuilder;
}

export function resolveCliIdentifierCasePlanPreparer() {
    assertService(identifierCasePlanPreparer, "prepareIdentifierCasePlan");
    return identifierCasePlanPreparer;
}

export function resolveCliIdentifierCaseCacheClearer() {
    assertService(identifierCaseCacheClearer, "clearIdentifierCaseCaches");
    return identifierCaseCacheClearer;
}

export function registerCliProjectIndexBuilder(builder) {
    assertService(builder, "buildProjectIndex");
    projectIndexBuilder = builder;
}

export function registerCliIdentifierCasePlanPreparer(preparer) {
    assertService(preparer, "prepareIdentifierCasePlan");
    identifierCasePlanPreparer = preparer;
}

export function registerCliIdentifierCaseCacheClearer(clearer) {
    assertService(clearer, "clearIdentifierCaseCaches");
    identifierCaseCacheClearer = clearer;
}

export function resetRegisteredCliPluginServices() {
    const {
        projectIndex,
        identifierCasePlanPreparation,
        identifierCasePlanCache
    } = defaultCliPluginServices;

    projectIndexBuilder = projectIndex.buildProjectIndex;
    identifierCasePlanPreparer =
        identifierCasePlanPreparation.prepareIdentifierCasePlan;
    identifierCaseCacheClearer =
        identifierCasePlanCache.clearIdentifierCaseCaches;
}
