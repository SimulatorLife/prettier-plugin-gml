import {
    defaultCliProjectIndexService,
    defaultCliIdentifierCasePlanPreparationService,
    defaultCliIdentifierCaseCacheService
} from "./service-providers/default.js";
import { assertFunction } from "./dependencies.js";

/**
 * @typedef {(projectRoot: string, manifest?: unknown, options?: object) => Promise<object>} CliProjectIndexBuilder
 * @typedef {(options: object) => Promise<void>} CliIdentifierCasePlanPreparer
 * @typedef {() => void} CliIdentifierCaseCacheClearer
 */

let projectIndexBuilder = defaultCliProjectIndexService.buildProjectIndex;
let identifierCasePlanPreparer =
    defaultCliIdentifierCasePlanPreparationService.prepareIdentifierCasePlan;
let identifierCaseCacheClearer =
    defaultCliIdentifierCaseCacheService.clearIdentifierCaseCaches;

function assertService(candidate, description) {
    assertFunction(candidate, description, {
        errorMessage: `CLI plugin services must provide a ${description} function`
    });
}

export function resolveCliProjectIndexBuilder() {
    assertService(projectIndexBuilder, "buildProjectIndex");
    return projectIndexBuilder;
}

export function resolveCliIdentifierCasePlanPreparer() {
    assertService(identifierCasePlanPreparer, "prepareIdentifierCasePlan");
    return identifierCasePlanPreparer;
}

export function resolveCliIdentifierCaseCacheClearer() {
    assertService(identifierCaseCacheClearer, "clearIdentifierCaseCaches");
    return identifierCaseCacheClearer;
}

export function registerCliProjectIndexBuilder(builder) {
    assertService(builder, "buildProjectIndex");
    projectIndexBuilder = builder;
}

export function registerCliIdentifierCasePlanPreparer(preparer) {
    assertService(preparer, "prepareIdentifierCasePlan");
    identifierCasePlanPreparer = preparer;
}

export function registerCliIdentifierCaseCacheClearer(clearer) {
    assertService(clearer, "clearIdentifierCaseCaches");
    identifierCaseCacheClearer = clearer;
}

export function resetRegisteredCliPluginServices() {
    projectIndexBuilder = defaultCliProjectIndexService.buildProjectIndex;
    identifierCasePlanPreparer =
        defaultCliIdentifierCasePlanPreparationService.prepareIdentifierCasePlan;
    identifierCaseCacheClearer =
        defaultCliIdentifierCaseCacheService.clearIdentifierCaseCaches;
}
