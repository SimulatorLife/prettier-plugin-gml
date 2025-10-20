import { createDefaultCliPluginServiceImplementations } from "./providers/default-cli-plugin-services.js";

const defaultImplementations = createDefaultCliPluginServiceImplementations();

const projectIndexService = Object.freeze({
    buildProjectIndex: defaultImplementations.buildProjectIndex
});

const identifierCasePlanService = Object.freeze({
    prepareIdentifierCasePlan: defaultImplementations.prepareIdentifierCasePlan,
    clearIdentifierCaseCaches: defaultImplementations.clearIdentifierCaseCaches
});

const defaultCliPluginServices = Object.freeze({
    buildProjectIndex: projectIndexService.buildProjectIndex,
    prepareIdentifierCasePlan:
        identifierCasePlanService.prepareIdentifierCasePlan,
    clearIdentifierCaseCaches:
        identifierCasePlanService.clearIdentifierCaseCaches,
    projectIndex: projectIndexService,
    identifierCasePlan: identifierCasePlanService
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

export function createDefaultCliProjectIndexService() {
    return projectIndexService;
}

export function createDefaultCliIdentifierCasePlanService() {
    return identifierCasePlanService;
}

export const defaultProjectIndexBuilder = projectIndexService.buildProjectIndex;
export const defaultIdentifierCasePlanPreparer =
    identifierCasePlanService.prepareIdentifierCasePlan;
export const defaultIdentifierCaseCacheClearer =
    identifierCasePlanService.clearIdentifierCaseCaches;
