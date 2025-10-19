import { createDefaultGmlPluginComponents } from "./default-plugin-components.js";
import { normalizeGmlPluginComponents } from "./plugin-component-normalizer.js";

let providerFactory = createDefaultGmlPluginComponents;
let cachedComponents = null;

function assertProviderFactory(candidate) {
    if (typeof candidate !== "function") {
        throw new TypeError(
            "GML plugin component provider must be a function that returns components"
        );
    }
}

export function hasRegisteredGmlPluginComponentProvider() {
    return typeof providerFactory === "function";
}

export function registerGmlPluginComponentProvider(factory) {
    assertProviderFactory(factory);
    providerFactory = factory;
    cachedComponents = null;
}

export function resetGmlPluginComponentProvider() {
    providerFactory = createDefaultGmlPluginComponents;
    cachedComponents = null;
}

export function resolveGmlPluginComponents() {
    if (!hasRegisteredGmlPluginComponentProvider()) {
        throw new Error("No GML plugin component provider has been registered");
    }

    if (!cachedComponents) {
        cachedComponents = normalizeGmlPluginComponents(providerFactory());
    }

    return cachedComponents;
}
