import { createDefaultGmlPluginComponents } from "./component-providers/default-plugin-components.js";
import { normalizeGmlPluginComponents } from "./component-providers/plugin-component-normalizer.js";

const DEFAULT_COMPONENTS = normalizeGmlPluginComponents(
    createDefaultGmlPluginComponents()
);

let currentProvider = () => DEFAULT_COMPONENTS;

export let gmlPluginComponents = DEFAULT_COMPONENTS;

const componentObservers = new Set();

function notifyComponentObservers() {
    if (componentObservers.size === 0) {
        return;
    }

    const snapshot = Array.from(componentObservers);

    for (const observer of snapshot) {
        observer(gmlPluginComponents);
    }
}

function assignComponents(components) {
    gmlPluginComponents = normalizeGmlPluginComponents(components);
    notifyComponentObservers();
    return gmlPluginComponents;
}

export function resolveGmlPluginComponents() {
    return gmlPluginComponents;
}

export function setGmlPluginComponentProvider(provider) {
    if (typeof provider !== "function") {
        throw new TypeError(
            "GML plugin component providers must be functions that return component maps"
        );
    }

    currentProvider = provider;
    return assignComponents(provider());
}

export function resetGmlPluginComponentProvider() {
    currentProvider = () => DEFAULT_COMPONENTS;
    gmlPluginComponents = DEFAULT_COMPONENTS;
    notifyComponentObservers();
    return gmlPluginComponents;
}

export function getGmlPluginComponentProvider() {
    return currentProvider;
}

export function addGmlPluginComponentObserver(observer) {
    if (typeof observer !== "function") {
        throw new TypeError("GML plugin component observers must be functions");
    }

    componentObservers.add(observer);

    return () => {
        componentObservers.delete(observer);
    };
}
