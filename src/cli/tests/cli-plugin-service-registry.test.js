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
        services.projectIndex.buildProjectIndex,
        defaultProjectIndexBuilder,
        "default project index builder should match exported helper"
    );
    assert.strictEqual(
        services.identifierCasePlan.preparation.prepareIdentifierCasePlan,
        defaultIdentifierCasePlanPreparer,
        "default identifier case planner should match exported helper"
    );
    assert.strictEqual(
        services.identifierCasePlan.cache.clearIdentifierCaseCaches,
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

    const identifierCasePlanServices = resolveCliIdentifierCasePlanService();
    assert.ok(
        Object.isFrozen(identifierCasePlanServices),
        "identifier case plan services should be frozen"
    );
    assert.strictEqual(
        identifierCasePlanServices.preparation,
        services.identifierCasePlanPreparation,
        "identifier case plan services should expose the preparation facade"
    );
    assert.strictEqual(
        identifierCasePlanServices.cache,
        services.identifierCasePlanCache,
        "identifier case plan services should expose the cache facade"
    );
    assert.strictEqual(
        identifierCasePlanServices.preparation.prepareIdentifierCasePlan,
        defaultIdentifierCasePlanPreparer,
        "preparation facade should expose the default preparer"
    );
    assert.strictEqual(
        identifierCasePlanServices.cache.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "cache facade should expose the default clearer"
    );
    assert.strictEqual(
        createDefaultCliIdentifierCasePlanService(),
        identifierCasePlanServices,
        "default identifier case plan services helper should reuse singleton"
    );
    assert.strictEqual(
        services.identifierCasePlan,
        identifierCasePlanServices,
        "root registry should expose the same identifier case plan services"
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
