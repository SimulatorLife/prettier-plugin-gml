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
 * require. Earlier iterations still exposed a catch-all
 * `CliPluginServiceImplementations` bundle that grouped the project index,
 * identifier case preparation, and cache collaborators together. Consumers that
 * only needed one role had to depend on the entire bundle. Dedicated factories
 * now expose each collaborator independently so call sites can opt into the
 * specific implementation or facade they require.
 */

/**
 * @typedef {(projectRoot: string, manifest?: unknown, options?: object) => Promise<object>} CliProjectIndexBuilder
 */

/**
 * @typedef {object} CliProjectIndexService
 * @property {CliProjectIndexBuilder} buildProjectIndex
 */

/**
 * @typedef {object} CliProjectIndexImplementation
 * @property {CliProjectIndexBuilder} buildProjectIndex
 */

/**
 * @typedef {object} CliIdentifierCasePlanPreparationService
 * @property {(options: object) => Promise<void>} prepareIdentifierCasePlan
 */

/**
 * @typedef {object} CliIdentifierCasePlanImplementation
 * @property {CliIdentifierCasePlanPreparationService["prepareIdentifierCasePlan"]} prepareIdentifierCasePlan
 */

/**
 * @typedef {object} CliIdentifierCasePlanCacheService
 * @property {() => void} clearIdentifierCaseCaches
 */

/**
 * @typedef {object} CliIdentifierCaseCacheImplementation
 * @property {CliIdentifierCasePlanCacheService["clearIdentifierCaseCaches"]} clearIdentifierCaseCaches
 */

function assertDescriptorValue(value, description) {
    assertFunction(value, description, {
        errorMessage: `CLI plugin service descriptors must include a ${description} function.`
    });
}

function resolveCliPluginServiceDescriptors(descriptorOverrides) {
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

function freezeProjectIndexImplementation(projectIndexBuilder) {
    return Object.freeze({
        buildProjectIndex: projectIndexBuilder
    });
}

function freezeIdentifierCasePlanImplementation(identifierCasePlanPreparer) {
    return Object.freeze({
        prepareIdentifierCasePlan: identifierCasePlanPreparer
    });
}

function freezeIdentifierCaseCacheImplementation(identifierCaseCacheClearer) {
    return Object.freeze({
        clearIdentifierCaseCaches: identifierCaseCacheClearer
    });
}

function cloneProjectIndexService(implementation) {
    return Object.freeze({
        buildProjectIndex: implementation.buildProjectIndex
    });
}

function cloneIdentifierCasePlanPreparationService(implementation) {
    return Object.freeze({
        prepareIdentifierCasePlan: implementation.prepareIdentifierCasePlan
    });
}

function cloneIdentifierCaseCacheService(implementation) {
    return Object.freeze({
        clearIdentifierCaseCaches: implementation.clearIdentifierCaseCaches
    });
}

export function createCliProjectIndexImplementation(descriptorOverrides) {
    const { projectIndexBuilder } =
        resolveCliPluginServiceDescriptors(descriptorOverrides);
    return freezeProjectIndexImplementation(projectIndexBuilder);
}

export function createCliIdentifierCasePlanImplementation(descriptorOverrides) {
    const { identifierCasePlanPreparer } =
        resolveCliPluginServiceDescriptors(descriptorOverrides);
    return freezeIdentifierCasePlanImplementation(identifierCasePlanPreparer);
}

export function createCliIdentifierCaseCacheImplementation(
    descriptorOverrides
) {
    const { identifierCaseCacheClearer } =
        resolveCliPluginServiceDescriptors(descriptorOverrides);
    return freezeIdentifierCaseCacheImplementation(identifierCaseCacheClearer);
}

export function createCliProjectIndexService(descriptorOverrides) {
    const implementation =
        createCliProjectIndexImplementation(descriptorOverrides);
    return cloneProjectIndexService(implementation);
}

export function createCliIdentifierCasePlanPreparationService(
    descriptorOverrides
) {
    const implementation =
        createCliIdentifierCasePlanImplementation(descriptorOverrides);
    return cloneIdentifierCasePlanPreparationService(implementation);
}

export function createCliIdentifierCaseCacheService(descriptorOverrides) {
    const implementation =
        createCliIdentifierCaseCacheImplementation(descriptorOverrides);
    return cloneIdentifierCaseCacheService(implementation);
}

const defaultProjectIndexImplementation = createCliProjectIndexImplementation();
const defaultIdentifierCasePlanImplementation =
    createCliIdentifierCasePlanImplementation();
const defaultIdentifierCaseCacheImplementation =
    createCliIdentifierCaseCacheImplementation();

const defaultProjectIndexBuilder =
    defaultProjectIndexImplementation.buildProjectIndex;
const defaultIdentifierCasePlanPreparer =
    defaultIdentifierCasePlanImplementation.prepareIdentifierCasePlan;
const defaultIdentifierCaseCacheClearer =
    defaultIdentifierCaseCacheImplementation.clearIdentifierCaseCaches;

const defaultCliProjectIndexService = createCliProjectIndexService();
const defaultCliIdentifierCasePlanPreparationService =
    createCliIdentifierCasePlanPreparationService();
const defaultCliIdentifierCaseCacheService =
    createCliIdentifierCaseCacheService();

export {
    defaultProjectIndexBuilder,
    defaultIdentifierCasePlanPreparer,
    defaultIdentifierCaseCacheClearer,
    defaultCliProjectIndexService,
    defaultCliIdentifierCasePlanPreparationService,
    defaultCliIdentifierCaseCacheService
};
