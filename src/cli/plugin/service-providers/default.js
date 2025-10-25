import { assertFunction } from "../shared/dependencies.js";

const shouldSkipDefaultPluginServices =
    process.env.PRETTIER_PLUGIN_GML_SKIP_CLI_RUN === "1";

function createSkippedServiceError(actionDescription) {
    return new Error(
        `Cannot ${actionDescription} while PRETTIER_PLUGIN_GML_SKIP_CLI_RUN=1. ` +
            "Clear the environment variable to restore CLI plugin services."
    );
}

function createSkippedProjectIndexBuilder() {
    return async function skippedProjectIndexBuilder() {
        throw createSkippedServiceError("build the project index");
    };
}

function createSkippedIdentifierCasePlanPreparer() {
    return async function skippedIdentifierCasePlanPreparer() {
        throw createSkippedServiceError("prepare the identifier case plan");
    };
}

function createSkippedIdentifierCaseCacheClearer() {
    return function skippedIdentifierCaseCacheClearer() {};
}

let baseProjectIndexBuilder;
let baseIdentifierCasePlanPreparer;
let baseIdentifierCaseCacheClearer;

if (shouldSkipDefaultPluginServices) {
    baseProjectIndexBuilder = createSkippedProjectIndexBuilder();
    baseIdentifierCasePlanPreparer = createSkippedIdentifierCasePlanPreparer();
    baseIdentifierCaseCacheClearer = createSkippedIdentifierCaseCacheClearer();
} else {
    const { buildProjectIndex } = await import(
        "prettier-plugin-gamemaker/project-index"
    );
    const {
        prepareIdentifierCasePlan,
        clearIdentifierCaseOptionStore,
        clearIdentifierCaseDryRunContexts
    } = await import("prettier-plugin-gamemaker/identifier-case");

    function clearIdentifierCaseCaches() {
        clearIdentifierCaseOptionStore(null);
        clearIdentifierCaseDryRunContexts();
    }

    baseProjectIndexBuilder = buildProjectIndex;
    baseIdentifierCasePlanPreparer = prepareIdentifierCasePlan;
    baseIdentifierCaseCacheClearer = clearIdentifierCaseCaches;
}

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
