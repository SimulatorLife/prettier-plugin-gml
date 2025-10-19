import { createDefaultCliPluginServiceImplementations } from "./providers/default-cli-plugin-services.js";

let serviceProviderFactory = createDefaultCliPluginServiceImplementations;
let cachedServices = null;

function assertServiceProviderFactory(candidate) {
    if (typeof candidate !== "function") {
        throw new TypeError(
            "CLI plugin service provider must be a function that returns service implementations"
        );
    }
}

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

    return Object.freeze({
        buildProjectIndex,
        prepareIdentifierCasePlan
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

export function resolveCliPluginServices() {
    if (!hasRegisteredCliPluginServiceProvider()) {
        throw new Error("No CLI plugin service provider has been registered");
    }

    if (!cachedServices) {
        cachedServices = normalizeCliPluginServices(serviceProviderFactory());
    }

    return cachedServices;
}

export function createDefaultCliPluginServices() {
    return resolveCliPluginServices();
}

const defaultCliPluginServices = createDefaultCliPluginServices();

export const defaultProjectIndexBuilder =
    defaultCliPluginServices.buildProjectIndex;
export const defaultIdentifierCasePlanPreparer =
    defaultCliPluginServices.prepareIdentifierCasePlan;
