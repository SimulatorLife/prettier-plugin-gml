import { createDefaultGmlPluginComponents } from "./component-providers/default-plugin-components.js";
import { normalizeGmlPluginComponents } from "./component-providers/plugin-component-normalizer.js";

export const gmlPluginComponents = normalizeGmlPluginComponents(
    createDefaultGmlPluginComponents()
);

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

export function resolveGmlPluginComponents() {
    return resolvedComponents;
}
