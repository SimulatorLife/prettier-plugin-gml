import assert from "node:assert/strict";
import test from "node:test";

import {
    registerCliPluginServices,
    resetRegisteredCliPluginServices,
    resolveCliPluginServices
} from "../lib/plugin-services.js";
import { createDefaultCliPluginServices } from "../lib/plugin-service-providers/default-plugin-services.js";

test("CLI plugin service registration", async (t) => {
    t.after(() => {
        resetRegisteredCliPluginServices();
        resolveCliPluginServices();
    });

    await t.test("exposes the default plugin services", () => {
        resetRegisteredCliPluginServices();

        const services = resolveCliPluginServices();
        const defaults = createDefaultCliPluginServices();

        assert.strictEqual(
            services.buildProjectIndex,
            defaults.buildProjectIndex,
            "default project index builder should be registered"
        );
        assert.strictEqual(
            services.prepareIdentifierCasePlan,
            defaults.prepareIdentifierCasePlan,
            "default identifier case planner should be registered"
        );
    });

    await t.test("allows overriding the registered services", () => {
        const buildProjectIndex = async () => ({ metrics: {} });
        const prepareIdentifierCasePlan = async () => {};

        registerCliPluginServices(() => ({
            buildProjectIndex,
            prepareIdentifierCasePlan
        }));

        const services = resolveCliPluginServices();

        assert.strictEqual(
            services.buildProjectIndex,
            buildProjectIndex,
            "overridden project index builder should be returned"
        );
        assert.strictEqual(
            services.prepareIdentifierCasePlan,
            prepareIdentifierCasePlan,
            "overridden identifier case planner should be returned"
        );

        resetRegisteredCliPluginServices();
    });

    await t.test("reset restores the default services", () => {
        registerCliPluginServices(() => ({
            buildProjectIndex: async () => {
                throw new Error("should not be called");
            },
            prepareIdentifierCasePlan: async () => {
                throw new Error("should not be called");
            }
        }));

        resolveCliPluginServices();
        resetRegisteredCliPluginServices();

        const services = resolveCliPluginServices();
        const defaults = createDefaultCliPluginServices();

        assert.strictEqual(
            services.buildProjectIndex,
            defaults.buildProjectIndex,
            "default project index builder should be restored"
        );
        assert.strictEqual(
            services.prepareIdentifierCasePlan,
            defaults.prepareIdentifierCasePlan,
            "default identifier case planner should be restored"
        );
    });
});
