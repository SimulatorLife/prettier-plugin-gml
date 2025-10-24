import { buildProjectIndex } from "prettier-plugin-gamemaker/project-index";
import {
    prepareIdentifierCasePlan,
    clearIdentifierCaseOptionStore,
    clearIdentifierCaseDryRunContexts
} from "prettier-plugin-gamemaker/identifier-case";
import { assertFunction } from "../shared-deps.js";

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
 * @typedef {object} CliIdentifierCasePlanService
 * @property {(options: object) => Promise<void>} prepareIdentifierCasePlan
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

function resolveDescriptorSource(descriptorSource) {
    if (descriptorSource == null) {
        return {};
    }

    if (typeof descriptorSource === "function") {
        return resolveDescriptorSource(descriptorSource());
    }

    if (typeof descriptorSource === "object") {
        return descriptorSource;
    }

    throw new TypeError(
        "CLI plugin service descriptors must be provided as objects."
    );
}

function assertDescriptorValue(value, description) {
    assertFunction(value, description, {
        errorMessage: `CLI plugin service descriptors must include a ${description} function.`
    });
}

export function createDefaultCliPluginServices(descriptorSource) {
    const descriptors = resolveDescriptorSource(descriptorSource);

    const projectIndexBuilder =
        descriptors.projectIndexBuilder ?? buildProjectIndex;
    const identifierCasePlanPreparer =
        descriptors.identifierCasePlanPreparer ?? prepareIdentifierCasePlan;
    const identifierCaseCacheClearer =
        descriptors.identifierCaseCacheClearer ?? clearIdentifierCaseCaches;

    assertDescriptorValue(projectIndexBuilder, "project index builder");
    assertDescriptorValue(
        identifierCasePlanPreparer,
        "prepareIdentifierCasePlan"
    );
    assertDescriptorValue(
        identifierCaseCacheClearer,
        "clearIdentifierCaseCaches"
    );

    const projectIndexService = Object.freeze({
        buildProjectIndex: projectIndexBuilder
    });

    const identifierCasePlanPreparationService = Object.freeze(
        /** @type {CliIdentifierCasePlanPreparationService} */ ({
            prepareIdentifierCasePlan: identifierCasePlanPreparer
        })
    );

    const identifierCasePlanCacheService = Object.freeze(
        /** @type {CliIdentifierCasePlanCacheService} */ ({
            clearIdentifierCaseCaches: identifierCaseCacheClearer
        })
    );

    const identifierCasePlanService = Object.freeze(
        /** @type {CliIdentifierCasePlanService} */ ({
            ...identifierCasePlanPreparationService,
            ...identifierCasePlanCacheService
        })
    );

    const identifierCaseServices = Object.freeze(
        /** @type {CliIdentifierCaseServices} */ ({
            preparation: identifierCasePlanPreparationService,
            cache: identifierCasePlanCacheService
        })
    );

    const pluginServiceRegistry = Object.freeze(
        /** @type {CliPluginServiceRegistry} */ ({
            projectIndex: projectIndexService,
            identifierCase: identifierCaseServices
        })
    );

    return {
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer,
        projectIndexService,
        identifierCasePlanService,
        identifierCasePlanPreparationService,
        identifierCasePlanCacheService,
        identifierCaseServices,
        pluginServiceRegistry
    };
}

const {
    projectIndexBuilder: defaultProjectIndexBuilder,
    identifierCasePlanPreparer: defaultIdentifierCasePlanPreparer,
    identifierCaseCacheClearer: defaultIdentifierCaseCacheClearer,
    projectIndexService: defaultCliProjectIndexService,
    identifierCasePlanService: defaultCliIdentifierCasePlanService,
    identifierCasePlanPreparationService:
        defaultCliIdentifierCasePlanPreparationService,
    identifierCasePlanCacheService: defaultCliIdentifierCaseCacheService,
    identifierCaseServices: defaultCliIdentifierCaseServices,
    pluginServiceRegistry: defaultCliPluginServices
} = createDefaultCliPluginServices();

export { defaultProjectIndexBuilder };
export { defaultIdentifierCasePlanPreparer };
export { defaultIdentifierCaseCacheClearer };

export { defaultCliProjectIndexService };
export { defaultCliIdentifierCasePlanService };
export { defaultCliIdentifierCasePlanPreparationService };
export { defaultCliIdentifierCaseCacheService };
export { defaultCliIdentifierCaseServices };
export { defaultCliPluginServices };
