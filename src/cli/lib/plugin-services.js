import {
    createDefaultProjectIndexBuilder,
    createDefaultIdentifierCasePlanPreparer
} from "./plugin-service-providers/default-plugin-services.js";

/**
 * @typedef {(projectRoot: string, manifest?: unknown, options?: object) => Promise<object>} CliProjectIndexBuilder
 * @typedef {(options: object) => Promise<void>} CliIdentifierCasePlanPreparer
 */

let projectIndexBuilderFactory = createDefaultProjectIndexBuilder;
let identifierCasePlanPreparerFactory = createDefaultIdentifierCasePlanPreparer;

/** @type {CliProjectIndexBuilder | null} */
let cachedProjectIndexBuilder = null;
/** @type {CliIdentifierCasePlanPreparer | null} */
let cachedIdentifierCasePlanPreparer = null;

function assertFactory(factory, name) {
    if (typeof factory !== "function") {
        throw new TypeError(`${name} must be a function`);
    }
}

function assertService(candidate, description) {
    if (typeof candidate !== "function") {
        throw new TypeError(
            `CLI plugin services must provide a ${description} function`
        );
    }
}

export function registerCliProjectIndexBuilder(factory) {
    assertFactory(factory, "project index builder factory");
    projectIndexBuilderFactory = factory;
    cachedProjectIndexBuilder = null;
}

export function registerCliIdentifierCasePlanPreparer(factory) {
    assertFactory(factory, "identifier case plan preparer factory");
    identifierCasePlanPreparerFactory = factory;
    cachedIdentifierCasePlanPreparer = null;
}

export function resetRegisteredCliPluginServices() {
    projectIndexBuilderFactory = createDefaultProjectIndexBuilder;
    identifierCasePlanPreparerFactory = createDefaultIdentifierCasePlanPreparer;
    cachedProjectIndexBuilder = null;
    cachedIdentifierCasePlanPreparer = null;
}

export function resolveCliProjectIndexBuilder() {
    if (!cachedProjectIndexBuilder) {
        const builder = projectIndexBuilderFactory();
        assertService(builder, "buildProjectIndex");
        cachedProjectIndexBuilder = builder;
    }

    return cachedProjectIndexBuilder;
}

export function resolveCliIdentifierCasePlanPreparer() {
    if (!cachedIdentifierCasePlanPreparer) {
        const preparer = identifierCasePlanPreparerFactory();
        assertService(preparer, "prepareIdentifierCasePlan");
        cachedIdentifierCasePlanPreparer = preparer;
    }

    return cachedIdentifierCasePlanPreparer;
}
