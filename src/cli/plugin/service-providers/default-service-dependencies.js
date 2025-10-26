import {
    createCliRunSkippedError,
    isCliRunSkipped
} from "../shared/dependencies.js";

const shouldSkipDefaultPluginServices = isCliRunSkipped();
const SKIP_PLUGIN_SERVICES_RESOLUTION_MESSAGE =
    "Clear the environment variable to restore CLI plugin services.";

function createSkippedServiceError(actionDescription) {
    return createCliRunSkippedError(actionDescription, {
        resolution: SKIP_PLUGIN_SERVICES_RESOLUTION_MESSAGE
    });
}

function createSkippedProjectIndexBuilder() {
    return async function skippedProjectIndexBuilder() {
        throw createSkippedServiceError("build the project index");
    };
}

function createSkippedIdentifierCasePlanPreparer() {
    return async function skippedIdentifierCasePlanPreparer() {
        throw createSkippedServiceError("prepare the identifier case plan");
    };
}

function createSkippedIdentifierCaseCacheClearer() {
    return function skippedIdentifierCaseCacheClearer() {};
}

export async function createDefaultCliPluginServiceDependencies() {
    if (shouldSkipDefaultPluginServices) {
        return {
            projectIndexBuilder: createSkippedProjectIndexBuilder(),
            identifierCasePlanPreparer:
                createSkippedIdentifierCasePlanPreparer(),
            identifierCaseCacheClearer:
                createSkippedIdentifierCaseCacheClearer()
        };
    }

    const { buildProjectIndex } = await import(
        "prettier-plugin-gamemaker/project-index"
    );
    const identifierCaseModule = await import(
        "prettier-plugin-gamemaker/identifier-case"
    );

    function createIdentifierCaseCacheClearer() {
        const {
            clearIdentifierCaseOptionStore,
            clearIdentifierCaseDryRunContexts
        } = identifierCaseModule;

        return function clearIdentifierCaseCaches() {
            clearIdentifierCaseOptionStore(null);
            clearIdentifierCaseDryRunContexts();
        };
    }

    return {
        projectIndexBuilder: buildProjectIndex,
        identifierCasePlanPreparer:
            identifierCaseModule.prepareIdentifierCasePlan,
        identifierCaseCacheClearer: createIdentifierCaseCacheClearer()
    };
}

export const defaultCliPluginServiceDependencies = Object.freeze(
    await createDefaultCliPluginServiceDependencies()
);

export { shouldSkipDefaultPluginServices };
