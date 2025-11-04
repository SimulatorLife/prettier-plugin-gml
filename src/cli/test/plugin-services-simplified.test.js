import assert from "node:assert/strict";
import test from "node:test";

import {
    getIdentifierCaseCacheClearer,
    resetPluginServices
} from "../src/plugin-runtime/plugin-services.js";

test("CLI plugin services provide cache clearer", async (t) => {
    t.after(() => {
        resetPluginServices();
    });

    await t.test("returns a cache clearer function", async () => {
        const clearCaches = await getIdentifierCaseCacheClearer();

        assert.strictEqual(
            typeof clearCaches,
            "function",
            "should return a function"
        );
    });

    await t.test("caches the clearer on subsequent calls", async () => {
        resetPluginServices();

        const clearCaches1 = await getIdentifierCaseCacheClearer();
        const clearCaches2 = await getIdentifierCaseCacheClearer();

        assert.strictEqual(
            clearCaches1,
            clearCaches2,
            "should return the same cached instance"
        );
    });

    await t.test("reset clears the cache", async () => {
        const clearCaches1 = await getIdentifierCaseCacheClearer();

        resetPluginServices();

        const clearCaches2 = await getIdentifierCaseCacheClearer();

        assert.notStrictEqual(
            clearCaches1,
            clearCaches2,
            "should return a new instance after reset"
        );
    });

    await t.test("cache clearer can be called without errors", async () => {
        const clearCaches = await getIdentifierCaseCacheClearer();

        assert.doesNotThrow(() => {
            clearCaches();
        }, "calling the cache clearer should not throw");
    });
});
