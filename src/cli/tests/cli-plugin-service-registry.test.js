import assert from "node:assert/strict";
import test from "node:test";

import {
    defaultCliIdentifierCasePlanService,
    defaultCliIdentifierCasePlanPreparationService,
    defaultCliIdentifierCaseCacheService,
    defaultCliPluginServices as defaultProviderServices,
    defaultCliProjectIndexService,
    defaultIdentifierCaseCacheClearer,
    defaultIdentifierCasePlanPreparer,
    defaultProjectIndexBuilder
} from "../lib/plugin-service-providers/default-plugin-services.js";

test("CLI plugin services expose validated defaults", () => {
    const services = defaultProviderServices;

    assert.ok(Object.isFrozen(services), "service registry should be frozen");
    assert.strictEqual(
        typeof services.buildProjectIndex,
        "function",
        "default project index builder should be provided"
    );
    assert.strictEqual(
        typeof services.prepareIdentifierCasePlan,
        "function",
        "default identifier case planner should be provided"
    );
    assert.strictEqual(
        services.buildProjectIndex,
        defaultProjectIndexBuilder,
        "default project index builder should match exported helper"
    );
    assert.strictEqual(
        services.prepareIdentifierCasePlan,
        defaultIdentifierCasePlanPreparer,
        "default identifier case planner should match exported helper"
    );
    assert.strictEqual(
        services.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "default identifier case cache clearer should match exported helper"
    );

    const projectIndexService = defaultCliProjectIndexService;
    assert.ok(
        Object.isFrozen(projectIndexService),
        "project index service should be frozen"
    );
    assert.strictEqual(
        projectIndexService.buildProjectIndex,
        defaultProjectIndexBuilder,
        "project index service should expose the default builder"
    );
    assert.strictEqual(
        services.projectIndex,
        projectIndexService,
        "root registry should expose the same project index service"
    );

    const identifierCasePlanService = defaultCliIdentifierCasePlanService;
    assert.ok(
        Object.isFrozen(identifierCasePlanService),
        "identifier case plan service should be frozen"
    );
    assert.strictEqual(
        identifierCasePlanService.prepareIdentifierCasePlan,
        defaultIdentifierCasePlanPreparer,
        "identifier case plan service should expose the default preparer"
    );
    assert.strictEqual(
        identifierCasePlanService.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "identifier case plan service should expose the default cache clearer"
    );
    assert.strictEqual(
        services.identifierCasePlan,
        identifierCasePlanService,
        "root registry should expose the same identifier case plan service"
    );

    const identifierCasePlanPreparationService =
        defaultCliIdentifierCasePlanPreparationService;
    assert.ok(
        Object.isFrozen(identifierCasePlanPreparationService),
        "identifier case plan preparation service should be frozen"
    );
    assert.strictEqual(
        identifierCasePlanPreparationService.prepareIdentifierCasePlan,
        defaultIdentifierCasePlanPreparer,
        "preparation service should expose the default preparer"
    );
    assert.strictEqual(
        services.identifierCasePlanPreparation,
        identifierCasePlanPreparationService,
        "root registry should expose the preparation service"
    );

    const identifierCasePlanCacheService = defaultCliIdentifierCaseCacheService;
    assert.ok(
        Object.isFrozen(identifierCasePlanCacheService),
        "identifier case plan cache service should be frozen"
    );
    assert.strictEqual(
        identifierCasePlanCacheService.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "cache service should expose the default cache clearer"
    );
    assert.strictEqual(
        services.identifierCasePlanCache,
        identifierCasePlanCacheService,
        "root registry should expose the cache service"
    );
});

test("CLI plugin services cannot be mutated", () => {
    const services = defaultProviderServices;

    assert.throws(
        () => {
            services.extra = {};
        },
        TypeError,
        "frozen registry should reject new entries"
    );

    assert.throws(
        () => {
            services.projectIndex.extra = {};
        },
        TypeError,
        "nested project index service should be frozen"
    );

    assert.throws(
        () => {
            services.identifierCasePlan.extra = {};
        },
        TypeError,
        "nested identifier case plan service should be frozen"
    );
});
