import path from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PLUGIN_ENTRY_POINT = path.resolve(
    MODULE_DIRECTORY,
    "..",
    "plugin",
    "src",
    "gml.js"
);

let pluginEntryPointResolver = () => DEFAULT_PLUGIN_ENTRY_POINT;

export function registerPluginEntryPointResolver(resolver) {
    if (typeof resolver !== "function") {
        throw new TypeError("resolver must be a function");
    }

    pluginEntryPointResolver = resolver;
}

export function resolvePluginEntryPoint() {
    return pluginEntryPointResolver();
}
