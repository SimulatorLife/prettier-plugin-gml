import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolvePluginEntryPoint } from "../src/plugin-runtime/entry-point.js";
import { resolveCliPluginEntryPoint } from "../src/plugin-runtime/entry-point-resolver.js";

describe("resolveCliPluginEntryPoint", () => {
    it("delegates to the default plugin entry resolver", () => {
        const resolved = resolveCliPluginEntryPoint();
        const expected = resolvePluginEntryPoint();

        assert.equal(resolved, expected);
    });

    it("forwards options to the underlying resolver", () => {
        const env = {
            PRETTIER_PLUGIN_GML_PLUGIN_PATH: "./src/plugin/src/gml.js"
        };

        const resolved = resolveCliPluginEntryPoint({ env });
        const expected = resolvePluginEntryPoint({ env });

        assert.equal(resolved, expected);
    });
});
