import { createDefaultCliPluginServiceImplementations } from "./cli-services/providers/default-cli-plugin-services.js";

const defaultCliPluginServices = Object.freeze(
    createDefaultCliPluginServiceImplementations()
);

const {
    buildProjectIndex: defaultProjectIndexBuilder,
    prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer
} = defaultCliPluginServices;

export function createDefaultCliPluginServices() {
    return defaultCliPluginServices;
}

export { defaultProjectIndexBuilder, defaultIdentifierCasePlanPreparer };
