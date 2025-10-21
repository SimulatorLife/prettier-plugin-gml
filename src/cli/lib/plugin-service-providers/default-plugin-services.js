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

const createFrozenService = (methods) => Object.freeze({ ...methods });

const nestedServices = Object.freeze({
    projectIndex: createFrozenService({
        buildProjectIndex: defaultProjectIndexBuilder
    }),
    identifierCasePlanPreparation: createFrozenService({
        prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer
    }),
    identifierCasePlanCache: createFrozenService({
        clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer
    })
});

const identifierCasePlanService = createFrozenService({
    ...nestedServices.identifierCasePlanPreparation,
    ...nestedServices.identifierCasePlanCache
});

const defaultCliPluginServices = createFrozenService({
    buildProjectIndex: defaultProjectIndexBuilder,
    prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer,
    clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer,
    projectIndex: nestedServices.projectIndex,
    identifierCasePlan: identifierCasePlanService,
    identifierCasePlanPreparation: nestedServices.identifierCasePlanPreparation,
    identifierCasePlanCache: nestedServices.identifierCasePlanCache
});

const createSingletonResolver = (value) => () => value;

export const createDefaultCliPluginServices = createSingletonResolver(
    defaultCliPluginServices
);
export const resolveCliPluginServices = createDefaultCliPluginServices;

const resolveProjectIndexService = createSingletonResolver(
    nestedServices.projectIndex
);
export const resolveCliProjectIndexService = resolveProjectIndexService;
export const createDefaultCliProjectIndexService =
    resolveCliProjectIndexService;

const resolveIdentifierCasePlanService = createSingletonResolver(
    identifierCasePlanService
);
export const resolveCliIdentifierCasePlanService =
    resolveIdentifierCasePlanService;
export const createDefaultCliIdentifierCasePlanService =
    resolveCliIdentifierCasePlanService;

const resolveIdentifierCasePlanPreparationService = createSingletonResolver(
    nestedServices.identifierCasePlanPreparation
);
export const resolveCliIdentifierCasePlanPreparationService =
    resolveIdentifierCasePlanPreparationService;
export const createDefaultCliIdentifierCasePlanPreparationService =
    resolveCliIdentifierCasePlanPreparationService;

const resolveIdentifierCaseCacheService = createSingletonResolver(
    nestedServices.identifierCasePlanCache
);
export const resolveCliIdentifierCaseCacheService =
    resolveIdentifierCaseCacheService;
export const createDefaultCliIdentifierCaseCacheService =
    resolveCliIdentifierCaseCacheService;
