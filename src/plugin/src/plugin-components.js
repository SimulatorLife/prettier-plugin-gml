import { createDefaultGmlPluginComponents } from "./component-providers/default-plugin-components.js";
import { normalizeGmlPluginComponents } from "./component-providers/plugin-component-normalizer.js";

export const gmlPluginComponents = normalizeGmlPluginComponents(
    createDefaultGmlPluginComponents()
);

export function resolveGmlPluginComponents() {
    return gmlPluginComponents;
}
