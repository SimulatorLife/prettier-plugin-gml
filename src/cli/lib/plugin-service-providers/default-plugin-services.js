import { buildProjectIndex } from "prettier-plugin-gamemaker/project-index";
import {
    prepareIdentifierCasePlan,
    clearIdentifierCaseOptionStore,
    clearIdentifierCaseDryRunContexts
} from "prettier-plugin-gamemaker/identifier-case";

function clearIdentifierCaseCaches() {
    clearIdentifierCaseOptionStore(null);
    clearIdentifierCaseDryRunContexts();
}

export const defaultProjectIndexBuilder = buildProjectIndex;
export const defaultIdentifierCasePlanPreparer = prepareIdentifierCasePlan;
export const defaultIdentifierCaseCacheClearer = clearIdentifierCaseCaches;

const projectIndexService = Object.freeze({
    buildProjectIndex: defaultProjectIndexBuilder
});

const identifierCasePlanPreparationService = Object.freeze({
    prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer
});

const identifierCasePlanCacheService = Object.freeze({
    clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer
});

const identifierCasePlanService = Object.freeze({
    ...identifierCasePlanPreparationService,
    ...identifierCasePlanCacheService
});

const defaultCliPluginServices = Object.freeze({
    buildProjectIndex: defaultProjectIndexBuilder,
    prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer,
    clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer,
    projectIndex: projectIndexService,
    identifierCasePlan: identifierCasePlanService,
    identifierCasePlanPreparation: identifierCasePlanPreparationService,
    identifierCasePlanCache: identifierCasePlanCacheService
});

export const createDefaultCliPluginServices = () => defaultCliPluginServices;
export const resolveCliPluginServices = createDefaultCliPluginServices;

export const resolveCliProjectIndexService = () => projectIndexService;
export const createDefaultCliProjectIndexService =
    resolveCliProjectIndexService;

export const resolveCliIdentifierCasePlanService = () =>
    identifierCasePlanService;
export const createDefaultCliIdentifierCasePlanService =
    resolveCliIdentifierCasePlanService;

export const resolveCliIdentifierCasePlanPreparationService = () =>
    identifierCasePlanPreparationService;
export const createDefaultCliIdentifierCasePlanPreparationService =
    resolveCliIdentifierCasePlanPreparationService;

export const resolveCliIdentifierCaseCacheService = () =>
    identifierCasePlanCacheService;
export const createDefaultCliIdentifierCaseCacheService =
    resolveCliIdentifierCaseCacheService;
