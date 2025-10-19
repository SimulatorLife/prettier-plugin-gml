import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
    DEFAULT_PROGRESS_BAR_WIDTH,
    PROGRESS_BAR_WIDTH_ENV_VAR,
    applyProgressBarWidthEnvOverride,
    getDefaultProgressBarWidth,
    resolveProgressBarWidth,
    setDefaultProgressBarWidth
} from "../lib/progress-bar.js";

describe("progress bar utilities", () => {
    beforeEach(() => {
        setDefaultProgressBarWidth(DEFAULT_PROGRESS_BAR_WIDTH);
    });

    afterEach(() => {
        setDefaultProgressBarWidth(DEFAULT_PROGRESS_BAR_WIDTH);
    });

    it("exposes the canonical default width", () => {
        assert.equal(getDefaultProgressBarWidth(), DEFAULT_PROGRESS_BAR_WIDTH);
    });

    it("returns the default width when no value is provided", () => {
        assert.equal(resolveProgressBarWidth(), getDefaultProgressBarWidth());
    });

    it("normalizes numeric inputs", () => {
        assert.equal(resolveProgressBarWidth("  32 "), 32);
        assert.equal(resolveProgressBarWidth(16.75), 16);
    });

    it("rejects non-positive widths", () => {
        assert.throws(() => resolveProgressBarWidth(0), /positive integer/i);
        assert.throws(() => resolveProgressBarWidth(-5), /positive integer/i);
    });

    it("allows overriding the default width programmatically", () => {
        setDefaultProgressBarWidth(48);
        assert.equal(getDefaultProgressBarWidth(), 48);
        assert.equal(resolveProgressBarWidth(), 48);
    });

    it("applies environment overrides when provided", () => {
        applyProgressBarWidthEnvOverride({
            [PROGRESS_BAR_WIDTH_ENV_VAR]: "60"
        });

        assert.equal(getDefaultProgressBarWidth(), 60);
        assert.equal(resolveProgressBarWidth(), 60);
    });

    it("falls back to the baseline width for blank environment overrides", () => {
        setDefaultProgressBarWidth(40);

        applyProgressBarWidthEnvOverride({
            [PROGRESS_BAR_WIDTH_ENV_VAR]: "   "
        });

        assert.equal(getDefaultProgressBarWidth(), DEFAULT_PROGRESS_BAR_WIDTH);
    });
});
