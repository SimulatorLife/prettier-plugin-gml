import assert from "node:assert/strict";
import test from "node:test";

import {
    createDefaultCliPluginServices,
    defaultCliIdentifierCasePlanService,
    defaultCliIdentifierCasePlanPreparationService,
    defaultCliIdentifierCaseCacheService,
    defaultCliIdentifierCaseServices,
    defaultCliPluginServices,
    defaultCliProjectIndexService,
    defaultIdentifierCaseCacheClearer,
    defaultIdentifierCasePlanPreparer,
    defaultProjectIndexBuilder
} from "../lib/plugin-service-providers/default-plugin-services.js";

test("CLI plugin services expose validated defaults", () => {
    const services = defaultCliPluginServices;

    assert.ok(Object.isFrozen(services), "service registry should be frozen");

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

    const identifierCaseServices = defaultCliIdentifierCaseServices;
    assert.ok(
        Object.isFrozen(identifierCaseServices),
        "identifier case service bundle should be frozen"
    );
    assert.strictEqual(
        services.identifierCase,
        identifierCaseServices,
        "root registry should expose the identifier case bundle"
    );

    const identifierCasePlanService = defaultCliIdentifierCasePlanService;
    assert.ok(
        Object.isFrozen(identifierCasePlanService),
        "identifier case plan service should be frozen"
    );
    assert.strictEqual(
        identifierCasePlanService.prepareIdentifierCasePlan,
        defaultIdentifierCasePlanPreparer,
        "plan service should expose the default preparer"
    );
    assert.strictEqual(
        identifierCasePlanService.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "plan service should expose the default cache clearer"
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
        identifierCaseServices.preparation,
        identifierCasePlanPreparationService,
        "identifier case bundle should expose the preparation service"
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
        identifierCaseServices.cache,
        identifierCasePlanCacheService,
        "identifier case bundle should expose the cache service"
    );

    assert.strictEqual(
        identifierCaseServices.preparation.prepareIdentifierCasePlan,
        defaultIdentifierCasePlanPreparer,
        "preparation bundle should expose the default preparer"
    );
    assert.strictEqual(
        identifierCaseServices.cache.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "cache bundle should expose the default clearer"
    );
    assert.strictEqual(
        projectIndexService.buildProjectIndex,
        defaultProjectIndexBuilder,
        "project index service should expose the default builder"
    );
});

test("CLI plugin services cannot be mutated", () => {
    const services = defaultCliPluginServices;

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
            services.identifierCase.preparation.extra = {};
        },
        TypeError,
        "identifier case plan preparation service should be frozen"
    );

    assert.throws(
        () => {
            services.identifierCase.cache.extra = {};
        },
        TypeError,
        "identifier case plan cache service should be frozen"
    );
});

test("default plugin services can be customized with overrides", () => {
    const projectIndexBuilder = async () => ({ metrics: { custom: true } });
    const identifierCasePlanPreparer = async (options) => ({ options });
    const identifierCaseCacheClearer = () => {};

    const services = createDefaultCliPluginServices({
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer
    });

    assert.strictEqual(
        services.projectIndexBuilder,
        projectIndexBuilder,
        "override project index builder should be used"
    );
    assert.strictEqual(
        services.identifierCasePlanPreparer,
        identifierCasePlanPreparer,
        "override identifier case plan preparer should be used"
    );
    assert.strictEqual(
        services.identifierCaseCacheClearer,
        identifierCaseCacheClearer,
        "override identifier case cache clearer should be used"
    );

    assert.ok(
        Object.isFrozen(services.projectIndexService),
        "project index service should remain frozen"
    );
    assert.strictEqual(
        services.projectIndexService.buildProjectIndex,
        projectIndexBuilder,
        "project index service should wrap override builder"
    );
    assert.strictEqual(
        services.identifierCasePlanService.prepareIdentifierCasePlan,
        identifierCasePlanPreparer,
        "identifier case plan service should wrap override preparer"
    );
    assert.strictEqual(
        services.identifierCasePlanService.clearIdentifierCaseCaches,
        identifierCaseCacheClearer,
        "identifier case plan service should wrap override clearer"
    );
    assert.ok(
        Object.isFrozen(services.pluginServiceRegistry),
        "plugin service registry should remain frozen"
    );
    assert.deepStrictEqual(
        services.pluginServiceRegistry.identifierCase,
        services.identifierCaseServices,
        "nested identifier case bundle should be reused"
    );
});

test("invalid plugin service descriptor sources are rejected", () => {
    assert.throws(() => createDefaultCliPluginServices(42), {
        name: "TypeError",
        message: /descriptors must be provided as objects/
    });
});
