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

const {
    buildProjectIndex,
    prepareIdentifierCasePlan,
    clearIdentifierCaseCaches
} = createDefaultCliPluginServiceImplementations();

const projectIndexService = Object.freeze({ buildProjectIndex });

const identifierCasePlanPreparationService = Object.freeze({
    prepareIdentifierCasePlan
});

const identifierCasePlanCacheService = Object.freeze({
    clearIdentifierCaseCaches
});

const identifierCasePlanService = Object.freeze({
    ...identifierCasePlanPreparationService,
    ...identifierCasePlanCacheService
});

const defaultCliPluginServices = Object.freeze({
    buildProjectIndex,
    prepareIdentifierCasePlan,
    clearIdentifierCaseCaches,
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

export const defaultProjectIndexBuilder = buildProjectIndex;
export const defaultIdentifierCasePlanPreparer = prepareIdentifierCasePlan;
export const defaultIdentifierCaseCacheClearer = clearIdentifierCaseCaches;
