import { AsyncLocalStorage } from "node:async_hooks";

import { createDefaultGmlPluginComponents } from "./component-providers/default-plugin-components.js";
import { normalizeGmlPluginComponents } from "./component-providers/plugin-component-normalizer.js";

export const gmlPluginComponents = normalizeGmlPluginComponents(
    createDefaultGmlPluginComponents()
);

const providerContextStorage = new AsyncLocalStorage();

let componentProviderFactory = null;
let resolvedComponents = gmlPluginComponents;

function assertComponentProviderFactory(candidate) {
    if (typeof candidate !== "function") {
        throw new TypeError(
            "GML plugin component provider must be a factory function"
        );
    }
}

function normalizeFromProvider(provider) {
    const providedComponents = provider();

    if (providedComponents === gmlPluginComponents) {
        return gmlPluginComponents;
    }

    return normalizeGmlPluginComponents(providedComponents);
}

function getContextComponents(context) {
    if (!context || typeof context !== "object") {
        return null;
    }

    if (!context.components) {
        if (typeof context.provider !== "function") {
            return null;
        }

        context.components = normalizeFromProvider(context.provider);
    }

    return context.components;
}

export function hasRegisteredGmlPluginComponentProvider() {
    return typeof componentProviderFactory === "function";
}

export function registerGmlPluginComponentProvider(provider) {
    assertComponentProviderFactory(provider);
    componentProviderFactory = provider;
    resolvedComponents = normalizeFromProvider(componentProviderFactory);
    return resolvedComponents;
}

export function resetGmlPluginComponentProvider() {
    componentProviderFactory = null;
    resolvedComponents = gmlPluginComponents;
    return resolvedComponents;
}

export function withGmlPluginComponentProvider(provider, callback) {
    assertComponentProviderFactory(provider);

    if (typeof callback !== "function") {
        throw new TypeError(
            "withGmlPluginComponentProvider requires a callback function"
        );
    }

    const context = { provider, components: null };
    return providerContextStorage.run(context, callback);
}

export function resolveGmlPluginComponents() {
    const contextComponents = getContextComponents(
        providerContextStorage.getStore()
    );

    if (contextComponents) {
        return contextComponents;
    }

    if (
        componentProviderFactory &&
        resolvedComponents === gmlPluginComponents
    ) {
        resolvedComponents = normalizeFromProvider(componentProviderFactory);
    }

    return resolvedComponents;
}
