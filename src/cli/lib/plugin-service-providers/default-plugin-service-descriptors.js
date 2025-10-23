import { buildProjectIndex } from "prettier-plugin-gamemaker/project-index";
import {
    prepareIdentifierCasePlan,
    clearIdentifierCaseOptionStore,
    clearIdentifierCaseDryRunContexts
} from "prettier-plugin-gamemaker/identifier-case";

function clearIdentifierCaseCaches() {
    clearIdentifierCaseOptionStore(null);
    clearIdentifierCaseDryRunContexts();
}

export function resolveDefaultCliPluginServiceDescriptors() {
    return {
        projectIndexBuilder: buildProjectIndex,
        identifierCasePlanPreparer: prepareIdentifierCasePlan,
        identifierCaseCacheClearer: clearIdentifierCaseCaches
    };
}
