/**
 * Simplified plugin service access for CLI commands.
 *
 * This module provides direct access to the core plugin services needed by the
 * CLI without the complexity of a registry pattern. Services are lazily
 * initialized and cached on first use.
 */

import { createCliRunSkippedError, isCliRunSkipped } from "./dependencies.js";

const shouldSkipDefaultPluginServices = isCliRunSkipped();
const SKIP_PLUGIN_SERVICES_RESOLUTION_MESSAGE =
    "Clear the environment variable to restore CLI plugin services.";

function createSkippedServiceError(actionDescription) {
    return createCliRunSkippedError(actionDescription, {
        resolution: SKIP_PLUGIN_SERVICES_RESOLUTION_MESSAGE
    });
}

let cachedIdentifierCaseCacheClearer = null;

/**
 * Returns a function that clears the identifier case caches.
 *
 * @returns {() => void}
 */
export async function getIdentifierCaseCacheClearer() {
    if (cachedIdentifierCaseCacheClearer) {
        return cachedIdentifierCaseCacheClearer;
    }

    if (shouldSkipDefaultPluginServices) {
        cachedIdentifierCaseCacheClearer =
            function skippedIdentifierCaseCacheClearer() {};
        return cachedIdentifierCaseCacheClearer;
    }

    const identifierCaseModule = await import(
        "prettier-plugin-gamemaker/identifier-case"
    );

    const {
        clearIdentifierCaseOptionStore,
        clearIdentifierCaseDryRunContexts
    } = identifierCaseModule;

    cachedIdentifierCaseCacheClearer = function clearIdentifierCaseCaches() {
        clearIdentifierCaseOptionStore(null);
        clearIdentifierCaseDryRunContexts();
    };

    return cachedIdentifierCaseCacheClearer;
}

/**
 * Clears the cached service instances. Useful for testing.
 */
export function resetPluginServices() {
    cachedIdentifierCaseCacheClearer = null;
}
