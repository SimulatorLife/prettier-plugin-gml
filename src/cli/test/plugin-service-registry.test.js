import assert from "node:assert/strict";
import test from "node:test";

import {
    createDefaultCliPluginServiceFacades,
    createDefaultCliPluginServiceImplementations,
    defaultCliIdentifierCasePlanPreparationService,
    defaultCliIdentifierCaseCacheService,
    defaultCliProjectIndexService,
    defaultIdentifierCaseCacheClearer,
    defaultIdentifierCasePlanPreparer,
    defaultProjectIndexBuilder
} from "../src/plugin-runtime/service-providers/default.js";

test("CLI plugin service facades expose validated defaults", () => {
    const services = createDefaultCliPluginServiceFacades();

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
        services.identifierCasePlanPreparationService.prepareIdentifierCasePlan,
        identifierCasePlanPreparationService.prepareIdentifierCasePlan,
        "service factory should expose the preparation function"
    );
    assert.ok(
        Object.isFrozen(services.identifierCasePlanPreparationService),
        "service factory should expose a frozen preparation service"
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
        services.identifierCasePlanCacheService.clearIdentifierCaseCaches,
        identifierCasePlanCacheService.clearIdentifierCaseCaches,
        "service factory should expose the cache function"
    );
    assert.ok(
        Object.isFrozen(services.identifierCasePlanCacheService),
        "service factory should expose a frozen cache service"
    );

    assert.ok(
        Object.prototype.hasOwnProperty.call(
            services,
            "identifierCasePlanService"
        ) === false,
        "facade factory should not expose the combined plan service"
    );
    assert.ok(
        Object.prototype.hasOwnProperty.call(
            services,
            "identifierCaseServices"
        ) === false,
        "facade factory should not expose an identifier case services bundle"
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

test("default plugin service contracts can be customized with overrides", () => {
    const projectIndexBuilder = async () => ({ metrics: { custom: true } });
    const identifierCasePlanPreparer = async (options) => ({ options });
    const identifierCaseCacheClearer = () => {};

    const implementations = createDefaultCliPluginServiceImplementations({
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer
    });

    const services = createDefaultCliPluginServiceFacades({
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer
    });

    assert.strictEqual(
        implementations.projectIndex.buildProjectIndex,
        projectIndexBuilder,
        "override project index builder should be used"
    );
    assert.strictEqual(
        implementations.identifierCasePlan.prepareIdentifierCasePlan,
        identifierCasePlanPreparer,
        "override identifier case plan preparer should be used"
    );
    assert.strictEqual(
        implementations.identifierCaseCache.clearIdentifierCaseCaches,
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
        Object.prototype.hasOwnProperty.call(
            services,
            "identifierCaseServices"
        ) === false,
        "service factory overrides should not add an identifier case bundle"
    );
});

test("plugin service descriptor overrides fall back to defaults", () => {
    const identifierCasePlanPreparer = async () => {};

    const implementations = createDefaultCliPluginServiceImplementations({
        identifierCasePlanPreparer
    });
    const services = createDefaultCliPluginServiceFacades({
        identifierCasePlanPreparer
    });

    assert.strictEqual(
        implementations.projectIndex.buildProjectIndex,
        defaultProjectIndexBuilder,
        "project index builder should fall back to the default"
    );
    assert.strictEqual(
        implementations.identifierCasePlan.prepareIdentifierCasePlan,
        identifierCasePlanPreparer,
        "overridden identifier case plan preparer should be used"
    );
    assert.strictEqual(
        implementations.identifierCaseCache.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "identifier case cache clearer should fall back to the default"
    );

    assert.strictEqual(
        services.projectIndexService.buildProjectIndex,
        defaultProjectIndexBuilder,
        "project index service should expose the default builder"
    );
    assert.strictEqual(
        services.identifierCasePlanPreparationService.prepareIdentifierCasePlan,
        identifierCasePlanPreparer,
        "identifier case plan preparation service should expose the override"
    );
    assert.strictEqual(
        services.identifierCasePlanCacheService.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "identifier case cache service should expose the default clearer"
    );
});

test("invalid plugin service descriptor sources are rejected", () => {
    assert.throws(() => createDefaultCliPluginServiceImplementations(42), {
        name: "TypeError",
        message: /descriptors must be provided as objects/
    });
    assert.throws(() => createDefaultCliPluginServiceFacades(() => ({})), {
        name: "TypeError",
        message: /descriptors must be provided as objects/
    });
});
