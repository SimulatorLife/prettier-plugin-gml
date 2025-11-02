import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT,
    UNSUPPORTED_EXTENSION_SAMPLE_LIMIT_ENV_VAR,
    applyUnsupportedExtensionSampleLimitEnvOverride,
    getDefaultUnsupportedExtensionSampleLimit,
    resolveUnsupportedExtensionSampleLimit,
    setDefaultUnsupportedExtensionSampleLimit
} from "../src/runtime-options/unsupported-extension-sample-limit.js";

describe("unsupported extension sample limit", () => {
    afterEach(() => {
        setDefaultUnsupportedExtensionSampleLimit(undefined);
        applyUnsupportedExtensionSampleLimitEnvOverride({});
    });

    it("exposes the baseline default", () => {
        assert.strictEqual(
            getDefaultUnsupportedExtensionSampleLimit(),
            DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT
        );
    });

    it("returns the default when no value is provided", () => {
        assert.strictEqual(
            resolveUnsupportedExtensionSampleLimit(),
            DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT
        );
    });

    it("normalizes numeric inputs", () => {
        const normalizedFromString =
            resolveUnsupportedExtensionSampleLimit("  6  ");
        assert.strictEqual(typeof normalizedFromString, "number");
        assert.strictEqual(normalizedFromString, 6);

        const normalizedFromFloat = resolveUnsupportedExtensionSampleLimit(2.4);
        assert.strictEqual(typeof normalizedFromFloat, "number");
        assert.strictEqual(normalizedFromFloat, 2);
    });

    it("rejects negative limits", () => {
        assert.throws(() => resolveUnsupportedExtensionSampleLimit(-1), {
            message: /non-negative integer/i
        });
    });

    it("allows configuring the default programmatically", () => {
        setDefaultUnsupportedExtensionSampleLimit(3);

        assert.strictEqual(getDefaultUnsupportedExtensionSampleLimit(), 3);
        assert.strictEqual(resolveUnsupportedExtensionSampleLimit(), 3);
    });

    it("resets to the baseline default when set to undefined", () => {
        setDefaultUnsupportedExtensionSampleLimit(9);
        setDefaultUnsupportedExtensionSampleLimit(undefined);

        assert.strictEqual(
            getDefaultUnsupportedExtensionSampleLimit(),
            DEFAULT_UNSUPPORTED_EXTENSION_SAMPLE_LIMIT
        );
    });

    it("applies the environment override for the default", () => {
        applyUnsupportedExtensionSampleLimitEnvOverride({
            [UNSUPPORTED_EXTENSION_SAMPLE_LIMIT_ENV_VAR]: "7"
        });

        assert.strictEqual(getDefaultUnsupportedExtensionSampleLimit(), 7);
        assert.strictEqual(resolveUnsupportedExtensionSampleLimit(), 7);
    });
});
