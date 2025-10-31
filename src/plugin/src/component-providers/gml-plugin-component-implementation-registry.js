import { assertProviderFunction } from "../shared/index.js";
import { createPluginComponentContractNormalizer } from "./plugin-component-contract.js";
import { defaultGmlPluginComponentImplementations } from "./default-plugin-component-implementations.js";

const normalizeImplementationMap =
    createPluginComponentContractNormalizer("implementations");

const DEFAULT_IMPLEMENTATIONS = normalizeImplementationMap(
    defaultGmlPluginComponentImplementations
);

let currentProvider = () => DEFAULT_IMPLEMENTATIONS;
let activeImplementations = DEFAULT_IMPLEMENTATIONS;

export const gmlPluginComponentImplementations = DEFAULT_IMPLEMENTATIONS;

export function resolveGmlPluginComponentImplementations() {
    return activeImplementations;
}

export function setGmlPluginComponentImplementationProvider(provider) {
    const normalizedProvider = assertProviderFunction(provider, {
        context: "GML plugin component implementation providers",
        expectation: "return implementation maps"
    });

    currentProvider = normalizedProvider;
    activeImplementations = normalizeImplementationMap(normalizedProvider());
    return activeImplementations;
}

export function restoreDefaultGmlPluginComponentImplementations() {
    currentProvider = () => DEFAULT_IMPLEMENTATIONS;
    activeImplementations = DEFAULT_IMPLEMENTATIONS;
    return activeImplementations;
}

export function resetGmlPluginComponentImplementationProvider() {
    return restoreDefaultGmlPluginComponentImplementations();
}

export function getGmlPluginComponentImplementationProvider() {
    return currentProvider;
}
