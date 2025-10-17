import { createDefaultCliPluginServices } from "./plugin-service-providers/default-plugin-services.js";

let serviceFactory = createDefaultCliPluginServices;
let cachedServices = null;

export function registerCliPluginServices(factory) {
    if (typeof factory !== "function") {
        throw new TypeError("factory must be a function");
    }

    serviceFactory = factory;
    cachedServices = null;
}

export function resetRegisteredCliPluginServices() {
    serviceFactory = createDefaultCliPluginServices;
    cachedServices = null;
}

export function resolveCliPluginServices() {
    if (!cachedServices) {
        const services = serviceFactory();
        if (!services || typeof services !== "object") {
            throw new TypeError("CLI plugin services must be an object");
        }

        const { buildProjectIndex, prepareIdentifierCasePlan } = services;
        if (typeof buildProjectIndex !== "function") {
            throw new TypeError(
                "CLI plugin services must include a buildProjectIndex function"
            );
        }
        if (typeof prepareIdentifierCasePlan !== "function") {
            throw new TypeError(
                "CLI plugin services must include a prepareIdentifierCasePlan function"
            );
        }

        cachedServices = { buildProjectIndex, prepareIdentifierCasePlan };
    }

    return cachedServices;
}
