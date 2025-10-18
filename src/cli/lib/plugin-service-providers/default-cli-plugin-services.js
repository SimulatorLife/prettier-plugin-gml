import {
    defaultProjectIndexBuilder,
    defaultIdentifierCasePlanPreparer
} from "./default-plugin-services.js";

export const defaultCliPluginServices = Object.freeze({
    buildProjectIndex: defaultProjectIndexBuilder,
    prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer
});
