const shouldSkipDefaultPluginServices =
    process.env.PRETTIER_PLUGIN_GML_SKIP_CLI_RUN === "1";

function createSkippedServiceError(actionDescription) {
    return new Error(
        `Cannot ${actionDescription} while PRETTIER_PLUGIN_GML_SKIP_CLI_RUN=1. ` +
            "Clear the environment variable to restore CLI plugin services."
    );
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
