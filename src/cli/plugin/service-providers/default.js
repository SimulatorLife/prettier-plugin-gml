import { buildProjectIndex } from "prettier-plugin-gamemaker/project-index";
import {
    prepareIdentifierCasePlan,
    clearIdentifierCaseOptionStore,
    clearIdentifierCaseDryRunContexts
} from "prettier-plugin-gamemaker/identifier-case";
import { assertFunction } from "../shared/dependencies.js";

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
 * Earlier iterations shipped a `defaultCliPluginServices` registry that
 * coupled the project index helpers with identifier case collaborators. That
 * umbrella forced consumers that only needed one family to depend on the other
 * as well. We now expose the specialised bundles separately so callers can
 * wire the exact behaviour they require.
 */

/**
 * @typedef {object} CliIdentifierCaseServices
 * @property {CliIdentifierCasePlanPreparationService} preparation
 * @property {CliIdentifierCasePlanCacheService} cache
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

    const identifierCaseServices = Object.freeze(
        /** @type {CliIdentifierCaseServices} */ ({
            preparation: identifierCasePlanPreparationService,
            cache: identifierCasePlanCacheService
        })
    );

    return {
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer,
        projectIndexService,
        identifierCasePlanPreparationService,
        identifierCasePlanCacheService,
        identifierCaseServices
    };
}

const {
    projectIndexBuilder: defaultProjectIndexBuilder,
    identifierCasePlanPreparer: defaultIdentifierCasePlanPreparer,
    identifierCaseCacheClearer: defaultIdentifierCaseCacheClearer,
    projectIndexService: defaultCliProjectIndexService,
    identifierCasePlanPreparationService:
        defaultCliIdentifierCasePlanPreparationService,
    identifierCasePlanCacheService: defaultCliIdentifierCaseCacheService,
    identifierCaseServices: defaultCliIdentifierCaseServices
} = createDefaultCliPluginServices();

export { defaultProjectIndexBuilder };
export { defaultIdentifierCasePlanPreparer };
export { defaultIdentifierCaseCacheClearer };

export { defaultCliProjectIndexService };
export { defaultCliIdentifierCasePlanPreparationService };
export { defaultCliIdentifierCaseCacheService };
export { defaultCliIdentifierCaseServices };
