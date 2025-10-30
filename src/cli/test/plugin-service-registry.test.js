import assert from "node:assert/strict";
import test from "node:test";

import {
    createCliProjectIndexImplementation,
    createCliIdentifierCasePlanImplementation,
    createCliIdentifierCaseCacheImplementation,
    createCliProjectIndexService,
    createCliIdentifierCasePlanPreparationService,
    createCliIdentifierCaseCacheService,
    defaultCliIdentifierCasePlanPreparationService,
    defaultCliIdentifierCaseCacheService,
    defaultCliProjectIndexService,
    defaultIdentifierCaseCacheClearer,
    defaultIdentifierCasePlanPreparer,
    defaultProjectIndexBuilder
} from "../src/plugin-runtime/service-providers/default.js";

test("CLI plugin service factories expose validated defaults", () => {
    const projectIndexImplementation = createCliProjectIndexImplementation();
    const identifierCasePlanImplementation =
        createCliIdentifierCasePlanImplementation();
    const identifierCaseCacheImplementation =
        createCliIdentifierCaseCacheImplementation();

    const projectIndexService = createCliProjectIndexService();
    const identifierCasePlanPreparationService =
        createCliIdentifierCasePlanPreparationService();
    const identifierCaseCacheService = createCliIdentifierCaseCacheService();

    assert.ok(
        Object.isFrozen(projectIndexImplementation),
        "project index implementation should be frozen"
    );
    assert.ok(
        Object.isFrozen(projectIndexService),
        "project index service should be frozen"
    );
    assert.strictEqual(
        projectIndexImplementation.buildProjectIndex,
        defaultProjectIndexBuilder,
        "project index implementation should expose the default builder"
    );
    assert.strictEqual(
        projectIndexService.buildProjectIndex,
        projectIndexImplementation.buildProjectIndex,
        "project index service should mirror the implementation builder"
    );
    assert.notStrictEqual(
        projectIndexService,
        projectIndexImplementation,
        "project index service should be a distinct facade"
    );

    assert.ok(
        Object.isFrozen(identifierCasePlanImplementation),
        "identifier case plan implementation should be frozen"
    );
    assert.ok(
        Object.isFrozen(identifierCasePlanPreparationService),
        "identifier case plan preparation service should be frozen"
    );
    assert.strictEqual(
        identifierCasePlanImplementation.prepareIdentifierCasePlan,
        defaultIdentifierCasePlanPreparer,
        "preparation implementation should expose the default preparer"
    );
    assert.strictEqual(
        identifierCasePlanPreparationService.prepareIdentifierCasePlan,
        identifierCasePlanImplementation.prepareIdentifierCasePlan,
        "preparation service should mirror the implementation"
    );
    assert.notStrictEqual(
        identifierCasePlanPreparationService,
        identifierCasePlanImplementation,
        "preparation service should be a distinct facade"
    );

    assert.ok(
        Object.isFrozen(identifierCaseCacheImplementation),
        "identifier case cache implementation should be frozen"
    );
    assert.ok(
        Object.isFrozen(identifierCaseCacheService),
        "identifier case cache service should be frozen"
    );
    assert.strictEqual(
        identifierCaseCacheImplementation.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "cache implementation should expose the default clearer"
    );
    assert.strictEqual(
        identifierCaseCacheService.clearIdentifierCaseCaches,
        identifierCaseCacheImplementation.clearIdentifierCaseCaches,
        "cache service should mirror the implementation"
    );
    assert.notStrictEqual(
        identifierCaseCacheService,
        identifierCaseCacheImplementation,
        "cache service should be a distinct facade"
    );

    assert.strictEqual(
        defaultCliProjectIndexService.buildProjectIndex,
        defaultProjectIndexBuilder,
        "default project index service should expose the default builder"
    );
    assert.strictEqual(
        defaultCliIdentifierCasePlanPreparationService.prepareIdentifierCasePlan,
        defaultIdentifierCasePlanPreparer,
        "default preparation service should expose the default preparer"
    );
    assert.strictEqual(
        defaultCliIdentifierCaseCacheService.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "default cache service should expose the default clearer"
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
    const overrides = {
        projectIndexBuilder,
        identifierCasePlanPreparer,
        identifierCaseCacheClearer
    };

    const projectIndexImplementation =
        createCliProjectIndexImplementation(overrides);
    const identifierCasePlanImplementation =
        createCliIdentifierCasePlanImplementation(overrides);
    const identifierCaseCacheImplementation =
        createCliIdentifierCaseCacheImplementation(overrides);

    const projectIndexService = createCliProjectIndexService(overrides);
    const identifierCasePlanService =
        createCliIdentifierCasePlanPreparationService(overrides);
    const identifierCaseCacheService =
        createCliIdentifierCaseCacheService(overrides);

    assert.strictEqual(
        projectIndexImplementation.buildProjectIndex,
        projectIndexBuilder,
        "override project index builder should be used"
    );
    assert.strictEqual(
        identifierCasePlanImplementation.prepareIdentifierCasePlan,
        identifierCasePlanPreparer,
        "override identifier case plan preparer should be used"
    );
    assert.strictEqual(
        identifierCaseCacheImplementation.clearIdentifierCaseCaches,
        identifierCaseCacheClearer,
        "override identifier case cache clearer should be used"
    );

    assert.ok(
        Object.isFrozen(projectIndexService),
        "project index service should remain frozen"
    );
    assert.strictEqual(
        projectIndexService.buildProjectIndex,
        projectIndexBuilder,
        "project index service should wrap override builder"
    );
    assert.strictEqual(
        identifierCasePlanService.prepareIdentifierCasePlan,
        identifierCasePlanPreparer,
        "preparation service should wrap override preparer"
    );
    assert.strictEqual(
        identifierCaseCacheService.clearIdentifierCaseCaches,
        identifierCaseCacheClearer,
        "cache service should wrap override clearer"
    );
});

test("plugin service descriptor overrides fall back to defaults", () => {
    const identifierCasePlanPreparer = async () => {};
    const overrides = { identifierCasePlanPreparer };

    const projectIndexImplementation =
        createCliProjectIndexImplementation(overrides);
    const identifierCasePlanImplementation =
        createCliIdentifierCasePlanImplementation(overrides);
    const identifierCaseCacheImplementation =
        createCliIdentifierCaseCacheImplementation(overrides);

    const projectIndexService = createCliProjectIndexService(overrides);
    const identifierCasePlanService =
        createCliIdentifierCasePlanPreparationService(overrides);
    const identifierCaseCacheService =
        createCliIdentifierCaseCacheService(overrides);

    assert.strictEqual(
        projectIndexImplementation.buildProjectIndex,
        defaultProjectIndexBuilder,
        "project index builder should fall back to the default"
    );
    assert.strictEqual(
        identifierCasePlanImplementation.prepareIdentifierCasePlan,
        identifierCasePlanPreparer,
        "overridden identifier case plan preparer should be used"
    );
    assert.strictEqual(
        identifierCaseCacheImplementation.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "identifier case cache clearer should fall back to the default"
    );

    assert.strictEqual(
        projectIndexService.buildProjectIndex,
        defaultProjectIndexBuilder,
        "project index service should expose the default builder"
    );
    assert.strictEqual(
        identifierCasePlanService.prepareIdentifierCasePlan,
        identifierCasePlanPreparer,
        "identifier case plan preparation service should expose the override"
    );
    assert.strictEqual(
        identifierCaseCacheService.clearIdentifierCaseCaches,
        defaultIdentifierCaseCacheClearer,
        "identifier case cache service should expose the default clearer"
    );
});

test("invalid plugin service descriptor sources are rejected", () => {
    assert.throws(() => createCliProjectIndexImplementation(42), {
        name: "TypeError",
        message: /descriptors must be provided as objects/
    });
    assert.throws(() => createCliProjectIndexService(() => ({})), {
        name: "TypeError",
        message: /descriptors must be provided as objects/
    });
    assert.throws(() => createCliIdentifierCasePlanImplementation(42), {
        name: "TypeError",
        message: /descriptors must be provided as objects/
    });
    assert.throws(
        () => createCliIdentifierCasePlanPreparationService(() => ({})),
        {
            name: "TypeError",
            message: /descriptors must be provided as objects/
        }
    );
});
