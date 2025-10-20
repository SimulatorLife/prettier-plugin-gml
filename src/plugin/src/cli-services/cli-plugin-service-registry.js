import { createDefaultCliPluginServiceImplementations } from "./providers/default-cli-plugin-services.js";

const {
    buildProjectIndex,
    prepareIdentifierCasePlan,
    clearIdentifierCaseCaches
} = createDefaultCliPluginServiceImplementations();

const projectIndexService = Object.freeze({
    buildProjectIndex
});

const identifierCasePlanService = Object.freeze({
    prepareIdentifierCasePlan,
    clearIdentifierCaseCaches
});

const defaultCliPluginServices = Object.freeze({
    buildProjectIndex,
    prepareIdentifierCasePlan,
    clearIdentifierCaseCaches,
    projectIndex: projectIndexService,
    identifierCasePlan: identifierCasePlanService
});

const getDefaultCliPluginServices = () => defaultCliPluginServices;
const getProjectIndexService = () => projectIndexService;
const getIdentifierCasePlanService = () => identifierCasePlanService;

export const createDefaultCliPluginServices = getDefaultCliPluginServices;
export const resolveCliPluginServices = getDefaultCliPluginServices;

export const resolveCliProjectIndexService = getProjectIndexService;
export const createDefaultCliProjectIndexService = getProjectIndexService;

export const resolveCliIdentifierCasePlanService = getIdentifierCasePlanService;
export const createDefaultCliIdentifierCasePlanService =
    getIdentifierCasePlanService;

export const defaultProjectIndexBuilder = buildProjectIndex;
export const defaultIdentifierCasePlanPreparer = prepareIdentifierCasePlan;
export const defaultIdentifierCaseCacheClearer = clearIdentifierCaseCaches;
