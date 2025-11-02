import assert from "node:assert/strict";
import test from "node:test";

import {
    getCliPluginServiceDependencyProvider,
    resolveCliPluginServiceDependencies,
    restoreDefaultCliPluginServiceDependencies,
    setCliPluginServiceDependencyProvider
} from "../src/plugin-runtime/service-providers/cli-plugin-service-dependency-registry.js";
import { defaultCliPluginServiceDependencies } from "../src/plugin-runtime/service-providers/default-service-dependencies.js";

async function createCustomDependencyBundle() {
    async function buildProjectIndex() {
        return { metrics: { overridden: true } };
    }

    async function prepareIdentifierCasePlan() {}

    function clearIdentifierCaseCaches() {}

    return {
        projectIndexBuilder: buildProjectIndex,
        identifierCasePlanPreparer: prepareIdentifierCasePlan,
        identifierCaseCacheClearer: clearIdentifierCaseCaches
    };
}

test("CLI plugin service dependency registry exposes the default bundle", async (t) => {
    t.after(async () => {
        await restoreDefaultCliPluginServiceDependencies();
    });

    const activeDependencies = resolveCliPluginServiceDependencies();
    assert.strictEqual(
        activeDependencies,
        defaultCliPluginServiceDependencies,
        "registry should return the default dependency bundle by default"
    );

    const provider = getCliPluginServiceDependencyProvider();
    assert.strictEqual(
        typeof provider,
        "function",
        "registry should expose the current provider"
    );
    assert.strictEqual(
        provider(),
        defaultCliPluginServiceDependencies,
        "default provider should return the default dependency bundle"
    );
});

test("CLI plugin service dependency registry supports overrides", async (t) => {
    t.after(async () => {
        await restoreDefaultCliPluginServiceDependencies();
    });

    const customDependencies = await createCustomDependencyBundle();

    await setCliPluginServiceDependencyProvider(() => customDependencies);

    const resolved = resolveCliPluginServiceDependencies();
    assert.strictEqual(
        resolved.projectIndexBuilder,
        customDependencies.projectIndexBuilder,
        "registry should expose the overridden project index builder"
    );
    assert.strictEqual(
        resolved.identifierCasePlanPreparer,
        customDependencies.identifierCasePlanPreparer,
        "registry should expose the overridden identifier case plan preparer"
    );
    assert.strictEqual(
        resolved.identifierCaseCacheClearer,
        customDependencies.identifierCaseCacheClearer,
        "registry should expose the overridden identifier case cache clearer"
    );

    const asyncDependencies = await createCustomDependencyBundle();

    await setCliPluginServiceDependencyProvider(async () => asyncDependencies);

    const asyncResolved = resolveCliPluginServiceDependencies();
    assert.strictEqual(
        asyncResolved.projectIndexBuilder,
        asyncDependencies.projectIndexBuilder,
        "registry should await asynchronous dependency providers"
    );

    await restoreDefaultCliPluginServiceDependencies();
    assert.strictEqual(
        resolveCliPluginServiceDependencies(),
        defaultCliPluginServiceDependencies,
        "restoring should reapply the default dependencies"
    );
});

test("CLI plugin service dependency registry validates providers", async (t) => {
    t.after(async () => {
        await restoreDefaultCliPluginServiceDependencies();
    });

    await assert.rejects(
        // @ts-expect-error intentionally invalid provider
        () => setCliPluginServiceDependencyProvider(null),
        {
            name: "TypeError",
            message: /dependency providers must be functions/
        },
        "registry should reject non-function providers"
    );

    await assert.rejects(
        () =>
            setCliPluginServiceDependencyProvider(() => ({
                // @ts-expect-error missing builder
                identifierCasePlanPreparer: async () => {},
                identifierCaseCacheClearer: () => {}
            })),
        {
            name: "TypeError",
            message: /projectIndexBuilder/
        },
        "registry should reject bundles missing the project index builder"
    );
});
