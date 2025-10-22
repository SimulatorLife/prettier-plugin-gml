import { resolveDefaultGmlPluginComponentDefinitions } from "./default-plugin-component-definitions.js";

export function createDefaultGmlPluginComponents({
    resolveComponentDefinitions = resolveDefaultGmlPluginComponentDefinitions
} = {}) {
    const components = resolveComponentDefinitions();

    return components;
}
