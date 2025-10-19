import assert from "node:assert/strict";
import test from "node:test";

import {
    createDefaultCliPluginServices,
    defaultIdentifierCasePlanPreparer,
    defaultProjectIndexBuilder
} from "../src/cli-services.js";

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
        createDefaultCliPluginServices(),
        services,
        "resolver should reuse the same object reference"
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
});
