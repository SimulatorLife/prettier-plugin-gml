import assert from "node:assert/strict";
import test from "node:test";

import {
    createDefaultCliPluginServices,
    defaultCliIdentifierCasePlanPreparationService,
    defaultCliIdentifierCaseCacheService,
    defaultCliIdentifierCaseServices,
    defaultCliProjectIndexService,
    defaultIdentifierCaseCacheClearer,
    defaultIdentifierCasePlanPreparer,
    defaultProjectIndexBuilder
} from "../plugin/service-providers/default.js";

test("CLI plugin services expose validated defaults", () => {
    const services = createDefaultCliPluginServices();

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
    const identifierCaseServices = defaultCliIdentifierCaseServices;
    assert.ok(
        Object.isFrozen(identifierCaseServices),
        "identifier case service bundle should be frozen"
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
    assert.strictEqual(
        services.identifierCasePlanPreparationService.prepareIdentifierCasePlan,
        identifierCasePlanPreparationService.prepareIdentifierCasePlan,
        "service factory should expose the preparation function"
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
        services.identifierCasePlanCacheService.clearIdentifierCaseCaches,
        identifierCasePlanCacheService.clearIdentifierCaseCaches,
        "service factory should expose the cache function"
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
    assert.ok(
        Object.prototype.hasOwnProperty.call(
            services,
            "identifierCasePlanService"
        ) === false,
        "root registry should no longer expose the combined plan service"
    );
    assert.ok(
        Object.isFrozen(services.identifierCaseServices),
        "service factory should expose a frozen identifier case bundle"
    );
    assert.strictEqual(
        services.identifierCaseServices.preparation.prepareIdentifierCasePlan,
        identifierCaseServices.preparation.prepareIdentifierCasePlan,
        "identifier case bundle should expose the preparation function"
    );
    assert.strictEqual(
        services.identifierCaseServices.cache.clearIdentifierCaseCaches,
        identifierCaseServices.cache.clearIdentifierCaseCaches,
        "identifier case bundle should expose the cache function"
    );
    assert.strictEqual(
        projectIndexService.buildProjectIndex,
        defaultProjectIndexBuilder,
        "project index service should expose the default builder"
    );
    assert.ok(
        Object.isFrozen(services.projectIndexService),
        "service factory should expose a frozen project index service"
    );
    assert.strictEqual(
        services.projectIndexService.buildProjectIndex,
        projectIndexService.buildProjectIndex,
        "service factory should expose the project index builder"
    );
});

test("CLI plugin services cannot be mutated", () => {
    assert.throws(
        () => {
            defaultCliProjectIndexService.extra = {};
        },
        TypeError,
        "frozen project index service should reject new entries"
    );

    assert.throws(
        () => {
            defaultCliIdentifierCasePlanPreparationService.extra = {};
        },
        TypeError,
        "identifier case plan preparation service should be frozen"
    );

    assert.throws(
        () => {
            defaultCliIdentifierCaseCacheService.extra = {};
        },
        TypeError,
        "identifier case cache service should be frozen"
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
        services.identifierCasePlanPreparationService.prepareIdentifierCasePlan,
        identifierCasePlanPreparer,
        "preparation service should wrap override preparer"
    );
    assert.strictEqual(
        services.identifierCasePlanCacheService.clearIdentifierCaseCaches,
        identifierCaseCacheClearer,
        "cache service should wrap override clearer"
    );
    assert.ok(
        Object.isFrozen(services.identifierCaseServices),
        "identifier case service bundle should remain frozen"
    );
    assert.strictEqual(
        services.identifierCaseServices.preparation,
        services.identifierCasePlanPreparationService,
        "identifier case services should reuse the preparation bundle"
    );
    assert.strictEqual(
        services.identifierCaseServices.cache,
        services.identifierCasePlanCacheService,
        "identifier case services should reuse the cache bundle"
    );
});

test("invalid plugin service descriptor sources are rejected", () => {
    assert.throws(() => createDefaultCliPluginServices(42), {
        name: "TypeError",
        message: /descriptors must be provided as objects/
    });
});
