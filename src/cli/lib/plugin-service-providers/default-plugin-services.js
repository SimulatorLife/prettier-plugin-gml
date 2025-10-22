import { buildProjectIndex } from "prettier-plugin-gamemaker/project-index";
import {
    prepareIdentifierCasePlan,
    clearIdentifierCaseOptionStore,
    clearIdentifierCaseDryRunContexts
} from "prettier-plugin-gamemaker/identifier-case";

/**
 * @typedef {import("../plugin-services.js").CliProjectIndexBuilder} CliProjectIndexBuilder
 * @typedef {import("../plugin-services.js").CliIdentifierCasePlanPreparer} CliIdentifierCasePlanPreparer
 * @typedef {import("../plugin-services.js").CliIdentifierCaseCacheClearer} CliIdentifierCaseCacheClearer
 */

/**
 * Historically the CLI exposed a wide `identifierCasePlan` service surface that
 * mixed cache maintenance with plan preparation helpers. Downstream consumers
 * that only needed one capability still depended on both. The narrower
 * contracts below capture each responsibility so call sites can depend on the
 * precise collaborator they require.
 */

/**
 * @typedef {object} CliProjectIndexService
 * @property {CliProjectIndexBuilder} buildProjectIndex
 */

/**
 * @typedef {object} CliIdentifierCasePlanPreparationService
 * @property {CliIdentifierCasePlanPreparer} prepareIdentifierCasePlan
 */

/**
 * @typedef {object} CliIdentifierCasePlanCacheService
 * @property {CliIdentifierCaseCacheClearer} clearIdentifierCaseCaches
 */

/**
 * @typedef {object} CliIdentifierCasePlanServices
 * @property {CliIdentifierCasePlanPreparationService} preparation
 * @property {CliIdentifierCasePlanCacheService} cache
 */

function clearIdentifierCaseCaches() {
    clearIdentifierCaseOptionStore(null);
    clearIdentifierCaseDryRunContexts();
}

export const defaultProjectIndexBuilder = buildProjectIndex;
export const defaultIdentifierCasePlanPreparer = prepareIdentifierCasePlan;
export const defaultIdentifierCaseCacheClearer = clearIdentifierCaseCaches;

/** @type {CliProjectIndexService} */
const projectIndexService = Object.freeze({
    buildProjectIndex: defaultProjectIndexBuilder
});

/** @type {CliIdentifierCasePlanPreparationService} */
const identifierCasePlanPreparationService = Object.freeze({
    prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer
});

/** @type {CliIdentifierCasePlanCacheService} */
const identifierCasePlanCacheService = Object.freeze({
    clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer
});

/** @type {CliIdentifierCasePlanServices} */
const identifierCasePlanServices = Object.freeze({
    preparation: identifierCasePlanPreparationService,
    cache: identifierCasePlanCacheService
});

const defaultCliPluginServices = Object.freeze({
    buildProjectIndex: defaultProjectIndexBuilder,
    prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer,
    clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer,
    projectIndex: projectIndexService,
    identifierCasePlan: identifierCasePlanServices,
    identifierCasePlanPreparation: identifierCasePlanPreparationService,
    identifierCasePlanCache: identifierCasePlanCacheService
});

export const createDefaultCliPluginServices = () => defaultCliPluginServices;
export const resolveCliPluginServices = createDefaultCliPluginServices;

export const resolveCliProjectIndexService = () => projectIndexService;
export const createDefaultCliProjectIndexService =
    resolveCliProjectIndexService;

export const resolveCliIdentifierCasePlanService = () =>
    identifierCasePlanServices;
export const createDefaultCliIdentifierCasePlanService =
    resolveCliIdentifierCasePlanService;
export const resolveCliIdentifierCasePlanPreparationService = () =>
    identifierCasePlanPreparationService;
export const createDefaultCliIdentifierCasePlanPreparationService =
    resolveCliIdentifierCasePlanPreparationService;

export const resolveCliIdentifierCaseCacheService = () =>
    identifierCasePlanCacheService;
export const createDefaultCliIdentifierCaseCacheService =
    resolveCliIdentifierCaseCacheService;
