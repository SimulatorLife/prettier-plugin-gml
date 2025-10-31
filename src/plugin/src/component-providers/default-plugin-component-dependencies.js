import { selectPluginComponentContractEntries } from "./plugin-component-contract.js";
import { defaultGmlPluginComponentImplementations } from "./default-plugin-component-implementations.js";

export function createDefaultGmlPluginComponentDependencies() {
    return selectPluginComponentContractEntries(
        defaultGmlPluginComponentImplementations
    );
}

export const defaultGmlPluginComponentDependencies =
    createDefaultGmlPluginComponentDependencies();
