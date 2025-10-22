import { buildProjectIndex } from "prettier-plugin-gamemaker/project-index";
import {
    prepareIdentifierCasePlan,
    clearIdentifierCaseOptionStore,
    clearIdentifierCaseDryRunContexts
} from "prettier-plugin-gamemaker/identifier-case";

/**
 * The legacy `identifierCasePlanService` facade coupled plan preparation with
 * cache clearing behind one "service" surface. That wide contract forced CLI
 * collaborators that only needed to warm caches or only needed to clear them
 * to depend on both behaviours. The typedefs below capture the narrower
 * preparation and cache responsibilities so consumers can opt into the precise
 * collaborator they require.
 */

/**
 * @typedef {object} CliIdentifierCasePlanPreparationService
 * @property {(options: object) => Promise<void>} prepareIdentifierCasePlan
 */

/**
 * @typedef {object} CliIdentifierCasePlanCacheService
 * @property {() => void} clearIdentifierCaseCaches
 */

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

const identifierCasePlanPreparationService = Object.freeze(
    /** @type {CliIdentifierCasePlanPreparationService} */ ({
        prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer
    })
);

const identifierCasePlanCacheService = Object.freeze(
    /** @type {CliIdentifierCasePlanCacheService} */ ({
        clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer
    })
);

const defaultCliPluginServices = Object.freeze({
    buildProjectIndex: defaultProjectIndexBuilder,
    prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer,
    clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer,
    projectIndex: projectIndexService,
    identifierCasePlanPreparation: identifierCasePlanPreparationService,
    identifierCasePlanCache: identifierCasePlanCacheService
});

export const createDefaultCliPluginServices = () => defaultCliPluginServices;
export const resolveCliPluginServices = createDefaultCliPluginServices;

export const resolveCliProjectIndexService = () => projectIndexService;
export const createDefaultCliProjectIndexService =
    resolveCliProjectIndexService;

export const resolveCliIdentifierCasePlanPreparationService = () =>
    identifierCasePlanPreparationService;
export const createDefaultCliIdentifierCasePlanPreparationService =
    resolveCliIdentifierCasePlanPreparationService;

export const resolveCliIdentifierCaseCacheService = () =>
    identifierCasePlanCacheService;
export const createDefaultCliIdentifierCaseCacheService =
    resolveCliIdentifierCaseCacheService;
