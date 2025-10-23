import { resolveDefaultCliPluginServiceDescriptors } from "./default-plugin-service-descriptors.js";

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

function normalizeDescriptorSource(descriptorSource) {
    const resolved =
        descriptorSource ?? resolveDefaultCliPluginServiceDescriptors;

    if (typeof resolved === "function") {
        return resolved();
    }

    return resolved;
}

function assertDescriptorValue(value, description) {
    if (typeof value !== "function") {
        throw new TypeError(
            `CLI plugin service descriptors must include a ${description} function.`
        );
    }
}

export function createDefaultCliPluginServices(descriptorSource) {
    const descriptors = normalizeDescriptorSource(descriptorSource);

    if (!descriptors || typeof descriptors !== "object") {
        throw new TypeError(
            "CLI plugin service descriptors must be provided as objects."
        );
    }

    const {
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer
    } = descriptors;

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

    const identifierCasePlanService = Object.freeze({
        ...identifierCasePlanPreparationService,
        ...identifierCasePlanCacheService
    });

    return {
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer,
        projectIndexService,
        identifierCasePlanService,
        identifierCasePlanPreparationService,
        identifierCasePlanCacheService
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
    identifierCasePlanCacheService: defaultCliIdentifierCaseCacheService
} = createDefaultCliPluginServices();

export { defaultProjectIndexBuilder };
export { defaultIdentifierCasePlanPreparer };
export { defaultIdentifierCaseCacheClearer };

export { defaultCliProjectIndexService };
export { defaultCliIdentifierCasePlanPreparationService };
export { defaultCliIdentifierCaseCacheService };
export { defaultCliIdentifierCasePlanService };

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
