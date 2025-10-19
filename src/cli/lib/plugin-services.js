import { createDefaultCliPluginServices } from "./plugin-service-providers/default-plugin-services.js";

/**
 * @typedef {(projectRoot: string, manifest?: unknown, options?: object) => Promise<object>} CliProjectIndexBuilder
 * @typedef {(options: object) => Promise<void>} CliIdentifierCasePlanPreparer
 */

let projectIndexBuilder;
let identifierCasePlanPreparer;

const resolvedDefaultCliPluginServices = createDefaultCliPluginServices();

export const defaultCliPluginServices = Object.freeze({
    projectIndex: resolvedDefaultCliPluginServices.projectIndex,
    identifierCasePlan: resolvedDefaultCliPluginServices.identifierCasePlan
});

resetRegisteredCliPluginServices();

function assertService(candidate, description) {
    if (typeof candidate !== "function") {
        throw new TypeError(
            `CLI plugin services must provide a ${description} function`
        );
    }
}

export function resolveCliProjectIndexBuilder() {
    assertService(projectIndexBuilder, "buildProjectIndex");
    return projectIndexBuilder;
}

export function resolveCliIdentifierCasePlanPreparer() {
    assertService(identifierCasePlanPreparer, "prepareIdentifierCasePlan");
    return identifierCasePlanPreparer;
}

export function registerCliProjectIndexBuilder(builder) {
    assertService(builder, "buildProjectIndex");
    projectIndexBuilder = builder;
}

export function registerCliIdentifierCasePlanPreparer(preparer) {
    assertService(preparer, "prepareIdentifierCasePlan");
    identifierCasePlanPreparer = preparer;
}

export function resetRegisteredCliPluginServices() {
    ({
        projectIndex: { buildProjectIndex: projectIndexBuilder },
        identifierCasePlan: {
            prepareIdentifierCasePlan: identifierCasePlanPreparer
        }
    } = defaultCliPluginServices);
}
