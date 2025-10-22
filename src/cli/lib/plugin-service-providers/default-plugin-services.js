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
 * @typedef {(projectRoot: string, manifest?: unknown, options?: object) => Promise<object>} CliProjectIndexBuilder
 */

/**
 * @typedef {object} CliProjectIndexService
 * @property {CliProjectIndexBuilder} buildProjectIndex
 */

/**
 * @typedef {object} CliIdentifierCasePlanPreparationService
 * @property {(options: object) => Promise<void>} prepareIdentifierCasePlan
 */

/**
 * @typedef {object} CliIdentifierCasePlanCacheService
 * @property {() => void} clearIdentifierCaseCaches
 */

/**
 * The previous default CLI plugin services registry combined the raw builder
 * functions with their scoped service facades under a single
 * `defaultCliPluginServices` object. That catch-all contract forced callers
 * that only needed the identifier case cache helpers, for example, to depend
 * on the project index builder as well. The bundles below keep the surfaces
 * cohesive so collaborators can choose just the family they require.
 */

/**
 * @typedef {object} CliIdentifierCaseServices
 * @property {CliIdentifierCasePlanPreparationService} preparation
 * @property {CliIdentifierCasePlanCacheService} cache
 */

/**
 * @typedef {object} CliPluginServiceRegistry
 * @property {CliProjectIndexService} projectIndex
 * @property {CliIdentifierCaseServices} identifierCase
 */

function clearIdentifierCaseCaches() {
    clearIdentifierCaseOptionStore(null);
    clearIdentifierCaseDryRunContexts();
}

export const defaultProjectIndexBuilder = buildProjectIndex;
export const defaultIdentifierCasePlanPreparer = prepareIdentifierCasePlan;
export const defaultIdentifierCaseCacheClearer = clearIdentifierCaseCaches;

export const defaultCliProjectIndexService = Object.freeze(
    /** @type {CliProjectIndexService} */ ({
        buildProjectIndex: defaultProjectIndexBuilder
    })
);

export const defaultCliIdentifierCasePlanPreparationService = Object.freeze(
    /** @type {CliIdentifierCasePlanPreparationService} */ ({
        prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer
    })
);

export const defaultCliIdentifierCaseCacheService = Object.freeze(
    /** @type {CliIdentifierCasePlanCacheService} */ ({
        clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer
    })
);

export const defaultCliIdentifierCaseServices = Object.freeze(
    /** @type {CliIdentifierCaseServices} */ ({
        preparation: defaultCliIdentifierCasePlanPreparationService,
        cache: defaultCliIdentifierCaseCacheService
    })
);

export const defaultCliPluginServices = Object.freeze(
    /** @type {CliPluginServiceRegistry} */ ({
        projectIndex: defaultCliProjectIndexService,
        identifierCase: defaultCliIdentifierCaseServices
    })
);
