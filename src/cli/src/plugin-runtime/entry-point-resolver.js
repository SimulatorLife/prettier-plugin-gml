import { assertFunction } from "../dependencies.js";
import { resolvePluginEntryPoint as resolveDefaultPluginEntryPoint } from "./entry-point.js";

let pluginEntryPointResolver = resolveDefaultPluginEntryPoint;

export function resolveCliPluginEntryPoint(options = {}) {
    return pluginEntryPointResolver(options);
}

export function setCliPluginEntryPointResolver(resolver) {
    pluginEntryPointResolver = assertFunction(resolver, "resolver", {
        errorMessage:
            "CLI plugin entry point resolvers must be functions returning entry point paths"
    });

    return pluginEntryPointResolver;
}

export function resetCliPluginEntryPointResolver() {
    pluginEntryPointResolver = resolveDefaultPluginEntryPoint;
    return pluginEntryPointResolver;
}

export function getCliPluginEntryPointResolver() {
    return pluginEntryPointResolver;
}
