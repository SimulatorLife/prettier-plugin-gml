import { resolveGmlPluginComponents as resolveRegisteredComponents } from "./component-providers/plugin-component-provider-registry.js";

export const gmlPluginComponents = resolveRegisteredComponents();

export function resolveGmlPluginComponents() {
    return gmlPluginComponents;
}
