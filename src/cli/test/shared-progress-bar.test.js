import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_PROGRESS_BAR_WIDTH,
    PROGRESS_BAR_WIDTH_ENV_VAR,
    applyProgressBarWidthEnvOverride,
    getDefaultProgressBarWidth,
    resolveProgressBarWidth,
    setDefaultProgressBarWidth
} from "../src/runtime-options/progress-bar.js";

describe("progress bar utilities", () => {
    afterEach(() => {
        setDefaultProgressBarWidth(undefined);
    });

    // Use strict equality helpers; Node deprecated the legacy assert.equal API.

    it("exposes the canonical default width", () => {
        assert.strictEqual(
            getDefaultProgressBarWidth(),
            DEFAULT_PROGRESS_BAR_WIDTH
        );
    });

    it("returns the default width when no value is provided", () => {
        assert.strictEqual(
            resolveProgressBarWidth(),
            DEFAULT_PROGRESS_BAR_WIDTH
        );
    });

    it("normalizes numeric inputs", () => {
        const normalizedFromString = resolveProgressBarWidth("  32 ");
        assert.strictEqual(typeof normalizedFromString, "number");
        assert.strictEqual(normalizedFromString, 32);

        const normalizedFromFloat = resolveProgressBarWidth(16.75);
        assert.strictEqual(typeof normalizedFromFloat, "number");
        assert.strictEqual(normalizedFromFloat, 16);
    });

    it("rejects non-positive widths", () => {
        assert.throws(() => resolveProgressBarWidth(0), /positive integer/i);
        assert.throws(() => resolveProgressBarWidth(-5), /positive integer/i);
    });

    it("allows configuring the default width programmatically", () => {
        setDefaultProgressBarWidth(40);

        assert.strictEqual(getDefaultProgressBarWidth(), 40);
        assert.strictEqual(resolveProgressBarWidth(), 40);
    });

    it("resets to the baseline default when set to undefined", () => {
        setDefaultProgressBarWidth(31);
        setDefaultProgressBarWidth(undefined);

        assert.strictEqual(
            getDefaultProgressBarWidth(),
            DEFAULT_PROGRESS_BAR_WIDTH
        );
    });

    it("applies the environment override for the default width", () => {
        applyProgressBarWidthEnvOverride({
            [PROGRESS_BAR_WIDTH_ENV_VAR]: "28"
        });

        assert.strictEqual(getDefaultProgressBarWidth(), 28);
    });
});
