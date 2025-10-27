import { resolvePluginEntryPoint as resolveDefaultPluginEntryPoint } from "./entry-point.js";

export function resolveCliPluginEntryPoint(options = {}) {
    return resolveDefaultPluginEntryPoint(options);
}
