import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT,
    SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR,
    applySkippedDirectorySampleLimitEnvOverride,
    getDefaultSkippedDirectorySampleLimit,
    resolveSkippedDirectorySampleLimit,
    setDefaultSkippedDirectorySampleLimit
} from "../src/runtime-options/sample-limits.js";

void describe("skipped directory sample limit", () => {
    afterEach(() => {
        setDefaultSkippedDirectorySampleLimit(undefined);
        applySkippedDirectorySampleLimitEnvOverride({});
    });

    void it("exposes the baseline default", () => {
        assert.strictEqual(
            getDefaultSkippedDirectorySampleLimit(),
            DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT
        );
    });

    void it("returns the default when no value is provided", () => {
        assert.strictEqual(
            resolveSkippedDirectorySampleLimit(),
            DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT
        );
    });

    void it("normalizes numeric inputs", () => {
        const normalizedFromString =
            resolveSkippedDirectorySampleLimit("  8  ");
        assert.strictEqual(typeof normalizedFromString, "number");
        assert.strictEqual(normalizedFromString, 8);

        const normalizedFromFloat = resolveSkippedDirectorySampleLimit(3.5);
        assert.strictEqual(typeof normalizedFromFloat, "number");
        assert.strictEqual(normalizedFromFloat, 3);
    });

    void it("rejects negative limits", () => {
        assert.throws(() => resolveSkippedDirectorySampleLimit(-1), {
            message: /non-negative integer/i
        });
    });

    void it("allows configuring the default programmatically", () => {
        setDefaultSkippedDirectorySampleLimit(2);

        assert.strictEqual(getDefaultSkippedDirectorySampleLimit(), 2);
        assert.strictEqual(resolveSkippedDirectorySampleLimit(), 2);
    });

    void it("resets to the baseline default when set to undefined", () => {
        setDefaultSkippedDirectorySampleLimit(7);
        setDefaultSkippedDirectorySampleLimit(undefined);

        assert.strictEqual(
            getDefaultSkippedDirectorySampleLimit(),
            DEFAULT_SKIPPED_DIRECTORY_SAMPLE_LIMIT
        );
    });

    void it("applies the environment override for the default", () => {
        applySkippedDirectorySampleLimitEnvOverride({
            [SKIPPED_DIRECTORY_SAMPLE_LIMIT_ENV_VAR]: "9"
        });

        assert.strictEqual(getDefaultSkippedDirectorySampleLimit(), 9);
        assert.strictEqual(resolveSkippedDirectorySampleLimit(), 9);
    });
});
