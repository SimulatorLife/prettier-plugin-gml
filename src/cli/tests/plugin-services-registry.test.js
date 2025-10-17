import assert from "node:assert/strict";
import test from "node:test";

import {
    registerCliProjectIndexBuilder,
    registerCliIdentifierCasePlanPreparer,
    resetRegisteredCliPluginServices,
    resolveCliProjectIndexBuilder,
    resolveCliIdentifierCasePlanPreparer
} from "../lib/plugin-services.js";
import {
    createDefaultProjectIndexBuilder,
    createDefaultIdentifierCasePlanPreparer
} from "../lib/plugin-service-providers/default-plugin-services.js";
import { createDefaultCliPluginServices } from "../lib/plugin-service-providers/default-cli-plugin-services.js";

async function metricsOnlyProjectIndexBuilder() {
    return { metrics: {} };
}

async function noopIdentifierCasePlanPreparer() {}

function throwingProjectIndexBuilder() {
    throw new Error("should not be called");
}

async function throwingIdentifierCasePlanPreparer() {
    throw new Error("should not be called");
}

test("CLI plugin service registration", async (t) => {
    t.after(() => {
        resetRegisteredCliPluginServices();
        resolveCliProjectIndexBuilder();
        resolveCliIdentifierCasePlanPreparer();
    });

    await t.test("exposes the default plugin services", () => {
        resetRegisteredCliPluginServices();

        const buildProjectIndex = resolveCliProjectIndexBuilder();
        const prepareIdentifierCasePlan =
            resolveCliIdentifierCasePlanPreparer();
        const defaultBuildProjectIndex = createDefaultProjectIndexBuilder();
        const defaultPrepareIdentifierCasePlan =
            createDefaultIdentifierCasePlanPreparer();
        const defaultCliServices = createDefaultCliPluginServices();

        assert.strictEqual(
            buildProjectIndex,
            defaultBuildProjectIndex,
            "default project index builder should be registered"
        );
        assert.strictEqual(
            prepareIdentifierCasePlan,
            defaultPrepareIdentifierCasePlan,
            "default identifier case planner should be registered"
        );
        assert.deepStrictEqual(
            defaultCliServices,
            {
                buildProjectIndex: defaultBuildProjectIndex,
                prepareIdentifierCasePlan: defaultPrepareIdentifierCasePlan
            },
            "aggregated default CLI services should match individual defaults"
        );
    });

    await t.test("allows overriding the registered services", () => {
        registerCliProjectIndexBuilder(metricsOnlyProjectIndexBuilder);
        registerCliIdentifierCasePlanPreparer(noopIdentifierCasePlanPreparer);

        assert.strictEqual(
            resolveCliProjectIndexBuilder(),
            metricsOnlyProjectIndexBuilder,
            "overridden project index builder should be returned"
        );
        assert.strictEqual(
            resolveCliIdentifierCasePlanPreparer(),
            noopIdentifierCasePlanPreparer,
            "overridden identifier case planner should be returned"
        );

        resetRegisteredCliPluginServices();
    });

    await t.test("rejects invalid service registrations", () => {
        assert.throws(() => registerCliProjectIndexBuilder(null), {
            name: "TypeError",
            message: /buildProjectIndex/
        });
        assert.throws(() => registerCliIdentifierCasePlanPreparer(), {
            name: "TypeError",
            message: /prepareIdentifierCasePlan/
        });
    });

    await t.test("reset restores the default services", () => {
        registerCliProjectIndexBuilder(throwingProjectIndexBuilder);
        registerCliIdentifierCasePlanPreparer(
            throwingIdentifierCasePlanPreparer
        );

        resolveCliProjectIndexBuilder();
        resolveCliIdentifierCasePlanPreparer();
        resetRegisteredCliPluginServices();

        const buildProjectIndex = resolveCliProjectIndexBuilder();
        const prepareIdentifierCasePlan =
            resolveCliIdentifierCasePlanPreparer();
        const defaultBuildProjectIndex = createDefaultProjectIndexBuilder();
        const defaultPrepareIdentifierCasePlan =
            createDefaultIdentifierCasePlanPreparer();

        assert.strictEqual(
            buildProjectIndex,
            defaultBuildProjectIndex,
            "default project index builder should be restored"
        );
        assert.strictEqual(
            prepareIdentifierCasePlan,
            defaultPrepareIdentifierCasePlan,
            "default identifier case planner should be restored"
        );
    });
});
