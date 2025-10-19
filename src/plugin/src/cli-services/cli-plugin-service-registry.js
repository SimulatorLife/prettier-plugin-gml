import { createDefaultCliPluginServiceImplementations } from "./providers/default-cli-plugin-services.js";

/**
 * @typedef {(projectRoot: string, manifest?: unknown, options?: object) => Promise<object>} CliProjectIndexBuilder
 * @typedef {(options: object) => Promise<void>} CliIdentifierCasePlanPreparer
 */

/**
 * @typedef {object} CliProjectIndexService
 * @property {CliProjectIndexBuilder} buildProjectIndex
 */

/**
 * @typedef {object} CliIdentifierCasePlanService
 * @property {CliIdentifierCasePlanPreparer} prepareIdentifierCasePlan
 */

/**
 * @typedef {object} CliPluginServiceSuite
 * @property {CliProjectIndexService} projectIndex
 * @property {CliIdentifierCasePlanService} identifierCasePlan
 */

let serviceProviderFactory = createDefaultCliPluginServiceImplementations;
let cachedServices = null;

function assertServiceProviderFactory(candidate) {
    if (typeof candidate !== "function") {
        throw new TypeError(
            "CLI plugin service provider must be a function that returns service implementations"
        );
    }
}

function normalizeProjectIndexService(service) {
    if (!service || typeof service !== "object") {
        throw new TypeError(
            "CLI project index service must be provided as an object"
        );
    }

    const { buildProjectIndex } = service;

    if (typeof buildProjectIndex !== "function") {
        throw new TypeError(
            "CLI project index service must provide a buildProjectIndex function"
        );
    }

    return Object.freeze({ buildProjectIndex });
}

function normalizeIdentifierCasePlanService(service) {
    if (!service || typeof service !== "object") {
        throw new TypeError(
            "CLI identifier case plan service must be provided as an object"
        );
    }

    const { prepareIdentifierCasePlan } = service;

    if (typeof prepareIdentifierCasePlan !== "function") {
        throw new TypeError(
            "CLI identifier case plan service must provide a prepareIdentifierCasePlan function"
        );
    }

    return Object.freeze({ prepareIdentifierCasePlan });
}

/**
 * @param {object} services
 * @returns {CliPluginServiceSuite}
 */
function normalizeCliPluginServices(services) {
    if (!services || typeof services !== "object") {
        throw new TypeError(
            "CLI plugin services must be provided as an object"
        );
    }

    const { buildProjectIndex, prepareIdentifierCasePlan } = services;

    if (typeof buildProjectIndex !== "function") {
        throw new TypeError(
            "CLI plugin services must provide a buildProjectIndex function"
        );
    }

    if (typeof prepareIdentifierCasePlan !== "function") {
        throw new TypeError(
            "CLI plugin services must provide a prepareIdentifierCasePlan function"
        );
    }

    const projectIndexService = normalizeProjectIndexService({
        buildProjectIndex
    });
    const identifierCasePlanService = normalizeIdentifierCasePlanService({
        prepareIdentifierCasePlan
    });

    return Object.freeze({
        projectIndex: projectIndexService,
        identifierCasePlan: identifierCasePlanService
    });
}

export function hasRegisteredCliPluginServiceProvider() {
    return typeof serviceProviderFactory === "function";
}

export function registerCliPluginServiceProvider(provider) {
    assertServiceProviderFactory(provider);
    serviceProviderFactory = provider;
    cachedServices = null;
}

export function resetCliPluginServiceProvider() {
    serviceProviderFactory = createDefaultCliPluginServiceImplementations;
    cachedServices = null;
}

/**
 * @returns {CliPluginServiceSuite}
 */
export function resolveCliPluginServices() {
    if (!hasRegisteredCliPluginServiceProvider()) {
        throw new Error("No CLI plugin service provider has been registered");
    }

    if (!cachedServices) {
        cachedServices = normalizeCliPluginServices(serviceProviderFactory());
    }

    return cachedServices;
}

/**
 * @returns {CliProjectIndexService}
 */
export function resolveCliProjectIndexService() {
    return resolveCliPluginServices().projectIndex;
}

/**
 * @returns {CliIdentifierCasePlanService}
 */
export function resolveCliIdentifierCasePlanService() {
    return resolveCliPluginServices().identifierCasePlan;
}

/**
 * @returns {CliPluginServiceSuite}
 */
export function createDefaultCliPluginServices() {
    return resolveCliPluginServices();
}

/**
 * @returns {CliProjectIndexService}
 */
export function createDefaultCliProjectIndexService() {
    return resolveCliProjectIndexService();
}

/**
 * @returns {CliIdentifierCasePlanService}
 */
export function createDefaultCliIdentifierCasePlanService() {
    return resolveCliIdentifierCasePlanService();
}

const defaultCliPluginServices = createDefaultCliPluginServices();

export const defaultProjectIndexBuilder =
    defaultCliPluginServices.projectIndex.buildProjectIndex;
export const defaultIdentifierCasePlanPreparer =
    defaultCliPluginServices.identifierCasePlan.prepareIdentifierCasePlan;
