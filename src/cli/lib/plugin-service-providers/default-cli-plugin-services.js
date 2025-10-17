import {
    createDefaultProjectIndexBuilder,
    createDefaultIdentifierCasePlanPreparer
} from "./default-plugin-services.js";

export function createDefaultCliPluginServices() {
    return {
        buildProjectIndex: createDefaultProjectIndexBuilder(),
        prepareIdentifierCasePlan: createDefaultIdentifierCasePlanPreparer()
    };
}
