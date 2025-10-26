import { assertFunction } from "../shared/dependencies.js";
import { defaultCliPluginServiceDependencies } from "./default-service-dependencies.js";

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

    const {
        projectIndexBuilder: baseProjectIndexBuilder,
        identifierCasePlanPreparer: baseIdentifierCasePlanPreparer,
        identifierCaseCacheClearer: baseIdentifierCaseCacheClearer
    } = defaultCliPluginServiceDependencies;

    const projectIndexBuilder =
        descriptors.projectIndexBuilder ?? baseProjectIndexBuilder;
    const identifierCasePlanPreparer =
        descriptors.identifierCasePlanPreparer ??
        baseIdentifierCasePlanPreparer;
    const identifierCaseCacheClearer =
        descriptors.identifierCaseCacheClearer ??
        baseIdentifierCaseCacheClearer;

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

    /**
     * Earlier iterations exposed a `CliIdentifierCaseServices` bundle that
     * coupled the preparation and cache collaborators behind one "services"
     * contract. That umbrella forced consumers that only needed one helper to
     * depend on both. We now return only the focused services so call sites can
     * opt into the precise collaborator they require.
     */

    return {
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer,
        projectIndexService,
        identifierCasePlanPreparationService,
        identifierCasePlanCacheService
    };
}

const {
    projectIndexBuilder: defaultProjectIndexBuilder,
    identifierCasePlanPreparer: defaultIdentifierCasePlanPreparer,
    identifierCaseCacheClearer: defaultIdentifierCaseCacheClearer,
    projectIndexService: defaultCliProjectIndexService,
    identifierCasePlanPreparationService:
        defaultCliIdentifierCasePlanPreparationService,
    identifierCasePlanCacheService: defaultCliIdentifierCaseCacheService
} = createDefaultCliPluginServices();

export { defaultProjectIndexBuilder };
export { defaultIdentifierCasePlanPreparer };
export { defaultIdentifierCaseCacheClearer };

export { defaultCliProjectIndexService };
export { defaultCliIdentifierCasePlanPreparationService };
export { defaultCliIdentifierCaseCacheService };
