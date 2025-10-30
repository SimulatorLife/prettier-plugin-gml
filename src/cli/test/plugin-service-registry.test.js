import assert from "node:assert/strict";
import test from "node:test";

import {
    createDefaultCliPluginServiceImplementations,
    defaultCliIdentifierCasePlanPreparationService,
    defaultCliIdentifierCaseCacheService,
    defaultCliProjectIndexService,
    defaultIdentifierCaseCacheClearer,
    defaultIdentifierCasePlanPreparer,
    defaultProjectIndexBuilder
} from "../src/plugin-runtime/service-providers/default.js";

async function overrideProjectIndexBuilder() {
    return { metrics: { custom: true } };
}

async function overrideIdentifierCasePlanPreparer(options) {
    return { options };
}

function overrideIdentifierCaseCacheClearer() {}

async function fallbackIdentifierCasePlanPreparer() {}

test("CLI plugin service implementations expose validated defaults", () => {
    const implementations = createDefaultCliPluginServiceImplementations();

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
    const identifierCasePlanImplementation = implementations.identifierCasePlan;
    assert.strictEqual(
        identifierCasePlanImplementation.prepareIdentifierCasePlan,
        identifierCasePlanPreparationService.prepareIdentifierCasePlan,
        "service implementations should expose the preparation function"
    );
    assert.ok(
        Object.isFrozen(identifierCasePlanImplementation),
        "service implementations should expose a frozen preparation helper"
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
    const identifierCaseCacheImplementation =
        implementations.identifierCaseCache;
    assert.strictEqual(
        identifierCaseCacheImplementation.clearIdentifierCaseCaches,
        identifierCasePlanCacheService.clearIdentifierCaseCaches,
        "service implementations should expose the cache function"
    );
    assert.ok(
        Object.isFrozen(identifierCaseCacheImplementation),
        "service implementations should expose a frozen cache helper"
    );

    assert.ok(
        Object.prototype.hasOwnProperty.call(
            implementations,
            "identifierCasePlanService"
        ) === false,
        "service implementations should not expose the combined plan service"
    );
    assert.ok(
        Object.prototype.hasOwnProperty.call(
            implementations,
            "identifierCaseServices"
        ) === false,
        "service implementations should not expose an identifier case services bundle"
    );
    assert.strictEqual(
        projectIndexService.buildProjectIndex,
        defaultProjectIndexBuilder,
        "project index service should expose the default builder"
    );
    assert.ok(
        Object.isFrozen(implementations.projectIndex),
        "service implementations should expose a frozen project index helper"
    );
    assert.strictEqual(
        implementations.projectIndex.buildProjectIndex,
        projectIndexService.buildProjectIndex,
        "service implementations should expose the project index builder"
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
    const implementations = createDefaultCliPluginServiceImplementations({
        projectIndexBuilder: overrideProjectIndexBuilder,
        identifierCasePlanPreparer: overrideIdentifierCasePlanPreparer,
        identifierCaseCacheClearer: overrideIdentifierCaseCacheClearer
    });

    assert.strictEqual(
        implementations.projectIndex.buildProjectIndex,
        overrideProjectIndexBuilder,
        "override project index builder should be used"
    );
    assert.strictEqual(
        implementations.identifierCasePlan.prepareIdentifierCasePlan,
        overrideIdentifierCasePlanPreparer,
        "override identifier case plan preparer should be used"
    );
    assert.strictEqual(
        implementations.identifierCaseCache.clearIdentifierCaseCaches,
        overrideIdentifierCaseCacheClearer,
        "override identifier case cache clearer should be used"
    );

    assert.ok(
        Object.isFrozen(implementations.projectIndex),
        "project index implementation should remain frozen"
    );
    assert.strictEqual(
        implementations.projectIndex.buildProjectIndex,
        overrideProjectIndexBuilder,
        "project index implementation should wrap override builder"
    );
    assert.strictEqual(
        implementations.identifierCasePlan.prepareIdentifierCasePlan,
        overrideIdentifierCasePlanPreparer,
        "preparation implementation should wrap override preparer"
    );
    assert.strictEqual(
        implementations.identifierCaseCache.clearIdentifierCaseCaches,
        overrideIdentifierCaseCacheClearer,
        "cache implementation should wrap override clearer"
    );
    assert.ok(
        Object.prototype.hasOwnProperty.call(
            implementations,
            "identifierCaseServices"
        ) === false,
        "service implementation overrides should not add an identifier case bundle"
    );
});

test("plugin service descriptor overrides fall back to defaults", () => {
    const implementations = createDefaultCliPluginServiceImplementations({
        identifierCasePlanPreparer: fallbackIdentifierCasePlanPreparer
    });

    assert.strictEqual(
        implementations.projectIndex.buildProjectIndex,
        defaultProjectIndexBuilder,
        "project index builder should fall back to the default"
    );
    assert.strictEqual(
        implementations.identifierCasePlan.prepareIdentifierCasePlan,
        fallbackIdentifierCasePlanPreparer,
        "overridden identifier case plan preparer should be used"
    );
    assert.strictEqual(
        implementations.identifierCaseCache.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "identifier case cache clearer should fall back to the default"
    );

    assert.ok(
        Object.isFrozen(implementations.projectIndex),
        "project index implementation should remain frozen"
    );
    assert.ok(
        Object.isFrozen(implementations.identifierCasePlan),
        "identifier case plan implementation should remain frozen"
    );
    assert.ok(
        Object.isFrozen(implementations.identifierCaseCache),
        "identifier case cache implementation should remain frozen"
    );
});

test("invalid plugin service descriptor sources are rejected", () => {
    assert.throws(() => createDefaultCliPluginServiceImplementations(42), {
        name: "TypeError",
        message: /descriptors must be provided as objects/
    });
});
