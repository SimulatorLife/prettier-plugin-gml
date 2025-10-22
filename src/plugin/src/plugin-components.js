import { createDefaultGmlPluginComponents } from "./component-providers/default-plugin-components.js";
import { normalizeGmlPluginComponents } from "./component-providers/plugin-component-normalizer.js";

const DEFAULT_COMPONENTS = normalizeGmlPluginComponents(
    createDefaultGmlPluginComponents()
);

let currentProvider = () => DEFAULT_COMPONENTS;
let activeGmlPluginComponents = DEFAULT_COMPONENTS;

export const gmlPluginComponents = DEFAULT_COMPONENTS;

const componentObservers = new Set();

function notifyComponentObservers() {
    if (componentObservers.size === 0) {
        return;
    }

    const snapshot = Array.from(componentObservers);

    for (const observer of snapshot) {
        observer(activeGmlPluginComponents);
    }
}

function assignComponents(components) {
    activeGmlPluginComponents = normalizeGmlPluginComponents(components);
    notifyComponentObservers();
    return activeGmlPluginComponents;
}

export function resolveGmlPluginComponents() {
    return activeGmlPluginComponents;
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

export function restoreDefaultGmlPluginComponents() {
    currentProvider = () => DEFAULT_COMPONENTS;
    activeGmlPluginComponents = DEFAULT_COMPONENTS;
    notifyComponentObservers();
    return activeGmlPluginComponents;
}

export function resetGmlPluginComponentProvider() {
    return restoreDefaultGmlPluginComponents();
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
