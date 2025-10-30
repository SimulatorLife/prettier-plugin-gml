import { assertFunction } from "../dependencies.js";
import { resolveCliPluginServiceDependencies } from "./cli-plugin-service-dependency-registry.js";

/**
 * The legacy `identifierCasePlanService` facade coupled plan preparation with
 * cache clearing behind one "service" surface. That wide contract forced CLI
 * collaborators that only needed to warm caches or only needed to clear them
 * to depend on both behaviours. The typedefs below capture the narrower
 * preparation and cache responsibilities so consumers can opt into the precise
 * collaborator they require. The shared factory previously returned both the
 * raw implementation functions and the service facades together, which still
 * coerced consumers that only needed the functions to depend on the facade
 * objects (and vice versa). The split contracts separate the implementations
 * from the facades so callers can import the exact collaborator family they
 * require.
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
 * @typedef {object} CliPluginServiceImplementations
 * @property {CliProjectIndexBuilder} projectIndexBuilder
 * @property {CliIdentifierCasePlanPreparationService["prepareIdentifierCasePlan"]} identifierCasePlanPreparer
 * @property {CliIdentifierCasePlanCacheService["clearIdentifierCaseCaches"]} identifierCaseCacheClearer
 */

/**
 * @typedef {object} CliPluginServiceFacades
 * @property {CliProjectIndexService} projectIndexService
 * @property {CliIdentifierCasePlanPreparationService} identifierCasePlanPreparationService
 * @property {CliIdentifierCasePlanCacheService} identifierCasePlanCacheService
 */

function assertDescriptorValue(value, description) {
    assertFunction(value, description, {
        errorMessage: `CLI plugin service descriptors must include a ${description} function.`
    });
}

export function createDefaultCliPluginServiceImplementations(
    descriptorOverrides
) {
    if (
        descriptorOverrides != null &&
        typeof descriptorOverrides !== "object"
    ) {
        throw new TypeError(
            "CLI plugin service descriptors must be provided as objects."
        );
    }

    const descriptors = descriptorOverrides ?? {};

    const {
        projectIndexBuilder: baseProjectIndexBuilder,
        identifierCasePlanPreparer: baseIdentifierCasePlanPreparer,
        identifierCaseCacheClearer: baseIdentifierCaseCacheClearer
    } = resolveCliPluginServiceDependencies();

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

    return {
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer
    };
}

export function createDefaultCliPluginServiceFacades(descriptorOverrides) {
    const {
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer
    } = createDefaultCliPluginServiceImplementations(descriptorOverrides);

    return {
        projectIndexService: Object.freeze({
            buildProjectIndex: projectIndexBuilder
        }),
        identifierCasePlanPreparationService: Object.freeze(
            /** @type {CliIdentifierCasePlanPreparationService} */ ({
                prepareIdentifierCasePlan: identifierCasePlanPreparer
            })
        ),
        identifierCasePlanCacheService: Object.freeze(
            /** @type {CliIdentifierCaseCacheService} */ ({
                clearIdentifierCaseCaches: identifierCaseCacheClearer
            })
        )
    };
}

const defaultImplementations = createDefaultCliPluginServiceImplementations();

const {
    projectIndexBuilder: defaultProjectIndexBuilder,
    identifierCasePlanPreparer: defaultIdentifierCasePlanPreparer,
    identifierCaseCacheClearer: defaultIdentifierCaseCacheClearer
} = defaultImplementations;

const defaultCliProjectIndexService = Object.freeze({
    buildProjectIndex: defaultProjectIndexBuilder
});

const defaultCliIdentifierCasePlanPreparationService = Object.freeze(
    /** @type {CliIdentifierCasePlanPreparationService} */ ({
        prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer
    })
);

const defaultCliIdentifierCaseCacheService = Object.freeze(
    /** @type {CliIdentifierCaseCacheService} */ ({
        clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer
    })
);

export {
    defaultProjectIndexBuilder,
    defaultIdentifierCasePlanPreparer,
    defaultIdentifierCaseCacheClearer,
    defaultCliProjectIndexService,
    defaultCliIdentifierCasePlanPreparationService,
    defaultCliIdentifierCaseCacheService
};
