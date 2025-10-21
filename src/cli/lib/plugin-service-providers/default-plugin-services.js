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

export const defaultCliProjectIndexService = Object.freeze({
    buildProjectIndex: defaultProjectIndexBuilder
});

export const defaultCliIdentifierCasePlanPreparationService = Object.freeze({
    prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer
});

export const defaultCliIdentifierCaseCacheService = Object.freeze({
    clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer
});

export const defaultCliIdentifierCasePlanService = Object.freeze({
    ...defaultCliIdentifierCasePlanPreparationService,
    ...defaultCliIdentifierCaseCacheService
});

export const defaultCliPluginServices = Object.freeze({
    buildProjectIndex: defaultProjectIndexBuilder,
    prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer,
    clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer,
    projectIndex: defaultCliProjectIndexService,
    identifierCasePlan: defaultCliIdentifierCasePlanService,
    identifierCasePlanPreparation:
        defaultCliIdentifierCasePlanPreparationService,
    identifierCasePlanCache: defaultCliIdentifierCaseCacheService
});
