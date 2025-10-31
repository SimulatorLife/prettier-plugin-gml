import { selectPluginComponentContractEntries } from "./plugin-component-contract.js";
import { resolveGmlPluginComponentImplementations } from "./gml-plugin-component-implementation-registry.js";

function selectDefaultImplementations() {
    return resolveGmlPluginComponentImplementations();
}

export function createDefaultGmlPluginComponentDependencies() {
    return selectPluginComponentContractEntries(selectDefaultImplementations());
}

export const defaultGmlPluginComponentDependencies =
    createDefaultGmlPluginComponentDependencies();
