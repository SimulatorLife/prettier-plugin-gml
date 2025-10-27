import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_CORE_OPTION_OVERRIDES,
    resolveCoreOptionOverrides,
    restoreDefaultCoreOptionOverridesResolver,
    setCoreOptionOverridesResolver
} from "../src/options/core-option-overrides.js";

describe("resolveCoreOptionOverrides", () => {
    it("returns the default override map when no resolver is registered", () => {
        const overrides = resolveCoreOptionOverrides();

        assert.strictEqual(overrides, DEFAULT_CORE_OPTION_OVERRIDES);
        assert.deepEqual(Object.keys(overrides).sort(), [
            "arrowParens",
            "htmlWhitespaceSensitivity",
            "jsxSingleQuote",
            "proseWrap",
            "singleAttributePerLine",
            "trailingComma"
        ]);
    });

    it("allows hosts to replace opinionated values via the resolver hook", () => {
        try {
            setCoreOptionOverridesResolver(() => ({
                trailingComma: "es5",
                htmlWhitespaceSensitivity: "ignore"
            }));

            const overrides = resolveCoreOptionOverrides();

            assert.equal(overrides.trailingComma, "es5");
            assert.equal(overrides.htmlWhitespaceSensitivity, "ignore");
            assert.equal(overrides.arrowParens, "always");
            assert.equal(overrides.jsxSingleQuote, false);
        } finally {
            restoreDefaultCoreOptionOverridesResolver();
        }
    });

    it("treats null or undefined entries as opt-outs so user configs can apply", () => {
        try {
            setCoreOptionOverridesResolver(() => ({
                trailingComma: null,
                arrowParens: undefined
            }));

            const overrides = resolveCoreOptionOverrides();

            assert.ok(!Object.hasOwn(overrides, "trailingComma"));
            assert.ok(!Object.hasOwn(overrides, "arrowParens"));
            assert.equal(overrides.singleAttributePerLine, false);
        } finally {
            restoreDefaultCoreOptionOverridesResolver();
        }
    });

    it("falls back to the default map when the resolver returns invalid data", () => {
        try {
            setCoreOptionOverridesResolver(() => ({
                trailingComma: 42,
                proseWrap: "ALWAYS"
            }));

            const overrides = resolveCoreOptionOverrides();

            assert.strictEqual(overrides, DEFAULT_CORE_OPTION_OVERRIDES);
        } finally {
            restoreDefaultCoreOptionOverridesResolver();
        }
    });
});
