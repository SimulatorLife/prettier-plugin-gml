import { createDefaultCliPluginServiceImplementations } from "./providers/default-cli-plugin-services.js";

/**
 * The historical identifier case plan "service" bundled the preparation flow
 * with cache clearing hooks. That wide facade forced callers to depend on both
 * behaviours even when they only needed one. Narrower contracts let each client
 * request just the capability it exercises.
 */

/**
 * @typedef {object} CliIdentifierCasePlanPreparationService
 * @property {(options: object | null | undefined) => Promise<void>} prepareIdentifierCasePlan
 */

/**
 * @typedef {object} CliIdentifierCasePlanCacheService
 * @property {() => void} clearIdentifierCaseCaches
 */

const defaultImplementations = createDefaultCliPluginServiceImplementations();

const projectIndexService = Object.freeze({
    buildProjectIndex: defaultImplementations.buildProjectIndex
});

const identifierCasePlanPreparationService = Object.freeze({
    prepareIdentifierCasePlan: defaultImplementations.prepareIdentifierCasePlan
});

const identifierCasePlanCacheService = Object.freeze({
    clearIdentifierCaseCaches: defaultImplementations.clearIdentifierCaseCaches
});

const identifierCasePlanService = Object.freeze({
    prepareIdentifierCasePlan:
        identifierCasePlanPreparationService.prepareIdentifierCasePlan,
    clearIdentifierCaseCaches:
        identifierCasePlanCacheService.clearIdentifierCaseCaches
});

const defaultCliPluginServices = Object.freeze({
    buildProjectIndex: projectIndexService.buildProjectIndex,
    prepareIdentifierCasePlan:
        identifierCasePlanPreparationService.prepareIdentifierCasePlan,
    clearIdentifierCaseCaches:
        identifierCasePlanCacheService.clearIdentifierCaseCaches,
    projectIndex: projectIndexService,
    identifierCasePlan: identifierCasePlanService,
    identifierCasePlanPreparation: identifierCasePlanPreparationService,
    identifierCasePlanCache: identifierCasePlanCacheService
});

export function createDefaultCliPluginServices() {
    return defaultCliPluginServices;
}

export function resolveCliPluginServices() {
    return defaultCliPluginServices;
}

export function resolveCliProjectIndexService() {
    return projectIndexService;
}

export function resolveCliIdentifierCasePlanService() {
    return identifierCasePlanService;
}

export function resolveCliIdentifierCasePlanPreparationService() {
    return identifierCasePlanPreparationService;
}

export function resolveCliIdentifierCaseCacheService() {
    return identifierCasePlanCacheService;
}

export function createDefaultCliProjectIndexService() {
    return projectIndexService;
}

export function createDefaultCliIdentifierCasePlanService() {
    return identifierCasePlanService;
}

export function createDefaultCliIdentifierCasePlanPreparationService() {
    return identifierCasePlanPreparationService;
}

export function createDefaultCliIdentifierCaseCacheService() {
    return identifierCasePlanCacheService;
}

export const defaultProjectIndexBuilder = projectIndexService.buildProjectIndex;
export const defaultIdentifierCasePlanPreparer =
    identifierCasePlanPreparationService.prepareIdentifierCasePlan;
export const defaultIdentifierCaseCacheClearer =
    identifierCasePlanCacheService.clearIdentifierCaseCaches;
