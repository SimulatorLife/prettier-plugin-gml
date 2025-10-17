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
    });

    await t.test("allows overriding the registered services", () => {
        const buildProjectIndex = async () => ({ metrics: {} });
        const prepareIdentifierCasePlan = async () => {};

        registerCliProjectIndexBuilder(() => buildProjectIndex);
        registerCliIdentifierCasePlanPreparer(() => prepareIdentifierCasePlan);

        assert.strictEqual(
            resolveCliProjectIndexBuilder(),
            buildProjectIndex,
            "overridden project index builder should be returned"
        );
        assert.strictEqual(
            resolveCliIdentifierCasePlanPreparer(),
            prepareIdentifierCasePlan,
            "overridden identifier case planner should be returned"
        );

        resetRegisteredCliPluginServices();
    });

    await t.test("reset restores the default services", () => {
        registerCliProjectIndexBuilder(() => () => {
            throw new Error("should not be called");
        });
        registerCliIdentifierCasePlanPreparer(() => async () => {
            throw new Error("should not be called");
        });

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
