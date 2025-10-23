import { buildProjectIndex } from "prettier-plugin-gamemaker/project-index";
import {
    prepareIdentifierCasePlan,
    clearIdentifierCaseOptionStore,
    clearIdentifierCaseDryRunContexts
} from "prettier-plugin-gamemaker/identifier-case";
import { assertFunction } from "../shared-deps.js";

/**
 * @typedef {object} CliIdentifierCasePlanPreparationService
 * @property {(options: object) => Promise<void>} prepareIdentifierCasePlan
 */

/**
 * @typedef {object} CliIdentifierCasePlanCacheService
 * @property {() => void} clearIdentifierCaseCaches
 */

function clearIdentifierCaseCaches() {
    clearIdentifierCaseOptionStore(null);
    clearIdentifierCaseDryRunContexts();
}

function resolveDescriptorSource(descriptorSource) {
    if (descriptorSource == null) {
        return {};
    }

    if (typeof descriptorSource === "function") {
        return resolveDescriptorSource(descriptorSource());
    }

    if (typeof descriptorSource === "object") {
        return descriptorSource;
    }

    throw new TypeError(
        "CLI plugin service descriptors must be provided as objects."
    );
}

function assertDescriptorValue(value, description) {
    assertFunction(value, description, {
        errorMessage: `CLI plugin service descriptors must include a ${description} function.`
    });
}

export function createDefaultCliPluginServices(descriptorSource) {
    const descriptors = resolveDescriptorSource(descriptorSource);

    const projectIndexBuilder =
        descriptors.projectIndexBuilder ?? buildProjectIndex;
    const identifierCasePlanPreparer =
        descriptors.identifierCasePlanPreparer ?? prepareIdentifierCasePlan;
    const identifierCaseCacheClearer =
        descriptors.identifierCaseCacheClearer ?? clearIdentifierCaseCaches;

    assertDescriptorValue(projectIndexBuilder, "project index builder");
    assertDescriptorValue(
        identifierCasePlanPreparer,
        "prepareIdentifierCasePlan"
    );
    assertDescriptorValue(
        identifierCaseCacheClearer,
        "clearIdentifierCaseCaches"
    );

    const projectIndexService = Object.freeze({
        buildProjectIndex: projectIndexBuilder
    });

    const identifierCasePlanPreparationService = Object.freeze(
        /** @type {CliIdentifierCasePlanPreparationService} */ ({
            prepareIdentifierCasePlan: identifierCasePlanPreparer
        })
    );

    const identifierCasePlanCacheService = Object.freeze(
        /** @type {CliIdentifierCasePlanCacheService} */ ({
            clearIdentifierCaseCaches: identifierCaseCacheClearer
        })
    );

    const identifierCasePlanService = Object.freeze({
        ...identifierCasePlanPreparationService,
        ...identifierCasePlanCacheService
    });

    return {
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer,
        projectIndexService,
        identifierCasePlanService,
        identifierCasePlanPreparationService,
        identifierCasePlanCacheService
    };
}

const {
    projectIndexBuilder: defaultProjectIndexBuilder,
    identifierCasePlanPreparer: defaultIdentifierCasePlanPreparer,
    identifierCaseCacheClearer: defaultIdentifierCaseCacheClearer,
    projectIndexService: defaultCliProjectIndexService,
    identifierCasePlanService: defaultCliIdentifierCasePlanService,
    identifierCasePlanPreparationService:
        defaultCliIdentifierCasePlanPreparationService,
    identifierCasePlanCacheService: defaultCliIdentifierCaseCacheService
} = createDefaultCliPluginServices();

export { defaultProjectIndexBuilder };
export { defaultIdentifierCasePlanPreparer };
export { defaultIdentifierCaseCacheClearer };

export { defaultCliProjectIndexService };
export { defaultCliIdentifierCasePlanPreparationService };
export { defaultCliIdentifierCaseCacheService };
export { defaultCliIdentifierCasePlanService };

export const defaultCliPluginServices = Object.freeze({
    buildProjectIndex: defaultProjectIndexBuilder,
    prepareIdentifierCasePlan: defaultIdentifierCasePlanPreparer,
    clearIdentifierCaseCaches: defaultIdentifierCaseCacheClearer,
    projectIndex: defaultCliProjectIndexService,
    identifierCasePlan: defaultCliIdentifierCasePlanService,
    identifierCasePlanPreparation:
        defaultCliIdentifierCasePlanPreparationService,
    identifierCasePlanCache: defaultCliIdentifierCaseCacheService
});
