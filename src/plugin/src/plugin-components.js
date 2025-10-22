import { createDefaultGmlPluginComponents } from "./component-providers/default-plugin-components.js";
import { normalizeGmlPluginComponents } from "./component-providers/plugin-component-normalizer.js";

const defaultGmlPluginComponents = normalizeGmlPluginComponents(
    createDefaultGmlPluginComponents()
);

let activeGmlPluginComponents = defaultGmlPluginComponents;

export const gmlPluginComponents = defaultGmlPluginComponents;

export function resolveGmlPluginComponents() {
    return activeGmlPluginComponents;
}

export function setGmlPluginComponentProvider(provider) {
    if (typeof provider !== "function") {
        throw new TypeError("GML plugin component provider must be a function");
    }

    const providedComponents = normalizeGmlPluginComponents(provider());
    activeGmlPluginComponents = providedComponents;
    return activeGmlPluginComponents;
}

export function restoreDefaultGmlPluginComponents() {
    activeGmlPluginComponents = defaultGmlPluginComponents;
    return activeGmlPluginComponents;
}
