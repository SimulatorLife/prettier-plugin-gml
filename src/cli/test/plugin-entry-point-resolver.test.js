import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { resolvePluginEntryPoint } from "../src/plugin-runtime/entry-point.js";
import {
    getCliPluginEntryPointResolver,
    resetCliPluginEntryPointResolver,
    resolveCliPluginEntryPoint,
    setCliPluginEntryPointResolver
} from "../src/plugin-runtime/entry-point-resolver.js";

afterEach(() => {
    resetCliPluginEntryPointResolver();
});

describe("resolveCliPluginEntryPoint", () => {
    it("uses the default plugin entry resolver when no override is registered", () => {
        assert.equal(getCliPluginEntryPointResolver(), resolvePluginEntryPoint);
    });

    it("delegates to a registered resolver", () => {
        const sentinelOptions = {
            env: { PRETTIER_PLUGIN_GML_PLUGIN_PATH: "ignored" }
        };
        const sentinelPath = "/custom/plugin-entry-point";
        let observedOptions = null;

        setCliPluginEntryPointResolver((options) => {
            observedOptions = options;
            return sentinelPath;
        });

        const resolved = resolveCliPluginEntryPoint(sentinelOptions);

        assert.equal(resolved, sentinelPath);
        assert.equal(observedOptions, sentinelOptions);
    });

    it("restores the default resolver after reset", () => {
        setCliPluginEntryPointResolver(() => "/override");
        resetCliPluginEntryPointResolver();

        assert.equal(getCliPluginEntryPointResolver(), resolvePluginEntryPoint);
    });

    it("throws when registering a non-function resolver", () => {
        assert.throws(() => {
            setCliPluginEntryPointResolver(/** @type {never} */ (null));
        }, TypeError);
    });
});
