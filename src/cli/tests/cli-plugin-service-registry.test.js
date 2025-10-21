import assert from "node:assert/strict";
import test from "node:test";

import {
    createDefaultCliIdentifierCasePlanService,
    createDefaultCliIdentifierCasePlanPreparationService,
    createDefaultCliIdentifierCaseCacheService,
    createDefaultCliPluginServices,
    createDefaultCliProjectIndexService,
    defaultIdentifierCaseCacheClearer,
    defaultIdentifierCasePlanPreparer,
    defaultProjectIndexBuilder,
    resolveCliIdentifierCasePlanService,
    resolveCliIdentifierCasePlanPreparationService,
    resolveCliIdentifierCaseCacheService,
    resolveCliPluginServices,
    resolveCliProjectIndexService
} from "../lib/plugin-service-providers/default-plugin-services.js";

test("CLI plugin services expose validated defaults", () => {
    const services = createDefaultCliPluginServices();

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
    assert.strictEqual(
        createDefaultCliPluginServices(),
        services,
        "resolver should reuse the same object reference"
    );
    assert.strictEqual(
        resolveCliPluginServices(),
        services,
        "resolver helper should return the default services"
    );

    const projectIndexService = resolveCliProjectIndexService();
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
        createDefaultCliProjectIndexService(),
        projectIndexService,
        "default project index service helper should reuse singleton"
    );
    assert.strictEqual(
        services.projectIndex,
        projectIndexService,
        "root registry should expose the same project index service"
    );

    const identifierCasePlanService = resolveCliIdentifierCasePlanService();
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
        createDefaultCliIdentifierCasePlanService(),
        identifierCasePlanService,
        "default identifier case plan service helper should reuse singleton"
    );
    assert.strictEqual(
        services.identifierCasePlan,
        identifierCasePlanService,
        "root registry should expose the same identifier case plan service"
    );

    const identifierCasePlanPreparationService =
        resolveCliIdentifierCasePlanPreparationService();
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
        createDefaultCliIdentifierCasePlanPreparationService(),
        identifierCasePlanPreparationService,
        "default identifier case plan preparation helper should reuse singleton"
    );
    assert.strictEqual(
        services.identifierCasePlanPreparation,
        identifierCasePlanPreparationService,
        "root registry should expose the preparation service"
    );

    const identifierCasePlanCacheService =
        resolveCliIdentifierCaseCacheService();
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
        createDefaultCliIdentifierCaseCacheService(),
        identifierCasePlanCacheService,
        "default identifier case cache service helper should reuse singleton"
    );
    assert.strictEqual(
        services.identifierCasePlanCache,
        identifierCasePlanCacheService,
        "root registry should expose the cache service"
    );
});

test("CLI plugin services cannot be mutated", () => {
    const services = createDefaultCliPluginServices();

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
