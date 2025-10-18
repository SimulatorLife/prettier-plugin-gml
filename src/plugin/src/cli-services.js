import { buildProjectIndex } from "./project-index/index.js";
import { prepareIdentifierCasePlan } from "./identifier-case/local-plan.js";

/**
 * Provides the services that the CLI consumes from the plugin without exposing
 * the plugin's internal module graph.
 */
export function createDefaultCliPluginServices() {
    return Object.freeze({
        buildProjectIndex,
        prepareIdentifierCasePlan
    });
}

export const defaultProjectIndexBuilder = buildProjectIndex;
export const defaultIdentifierCasePlanPreparer = prepareIdentifierCasePlan;
