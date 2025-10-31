import { assertFunction } from "../shared/index.js";
import { createPluginComponentContractNormalizer } from "./plugin-component-contract.js";
import { defaultGmlPluginComponentDependencies } from "./default-plugin-component-dependencies.js";

const normalizeDependencyMap =
    createPluginComponentContractNormalizer("dependencies");

const DEFAULT_DEPENDENCIES = normalizeDependencyMap(
    defaultGmlPluginComponentDependencies
);

let currentProvider = () => DEFAULT_DEPENDENCIES;
let activeDependencies = DEFAULT_DEPENDENCIES;

export const gmlPluginComponentDependencies = DEFAULT_DEPENDENCIES;

export function resolveGmlPluginComponentDependencies() {
    return activeDependencies;
}

export function setGmlPluginComponentDependencyProvider(provider) {
    const normalizedProvider = assertFunction(provider, "provider", {
        errorMessage:
            "GML plugin component dependency providers must be functions that return dependency maps."
    });

    currentProvider = normalizedProvider;
    activeDependencies = normalizeDependencyMap(normalizedProvider());
    return activeDependencies;
}

export function restoreDefaultGmlPluginComponentDependencies() {
    currentProvider = () => DEFAULT_DEPENDENCIES;
    activeDependencies = DEFAULT_DEPENDENCIES;
    return activeDependencies;
}

export function getGmlPluginComponentDependencyProvider() {
    return currentProvider;
}
