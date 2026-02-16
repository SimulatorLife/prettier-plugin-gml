import {
    configureIdentifierCaseIntegration,
    defaultOptions,
    languages,
    normalizeFormattedOutput,
    parsers,
    Plugin as PluginObject,
    pluginOptions,
    printers,
    setIdentifierCaseRuntime
} from "./plugin-entry.js";

// Export the Plugin namespace as a frozen object containing all plugin functionality
export const Plugin = Object.freeze({
    configureIdentifierCaseIntegration,
    defaultOptions,
    languages,
    normalizeFormattedOutput,
    options: pluginOptions,
    parsers,
    printers,
    setIdentifierCaseRuntime,
    // Include the Plugin object itself for Prettier integration
    ...PluginObject
});
