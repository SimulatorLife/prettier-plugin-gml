import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_PROGRESS_BAR_WIDTH,
    PROGRESS_BAR_WIDTH_ENV_VAR,
    applyProgressBarWidthEnvOverride,
    getDefaultProgressBarWidth,
    resolveProgressBarWidth,
    setDefaultProgressBarWidth
} from "../lib/progress-bar.js";

describe("progress bar utilities", () => {
    afterEach(() => {
        setDefaultProgressBarWidth(undefined);
    });

    it("exposes the canonical default width", () => {
        assert.equal(getDefaultProgressBarWidth(), DEFAULT_PROGRESS_BAR_WIDTH);
    });

    it("returns the default width when no value is provided", () => {
        assert.equal(resolveProgressBarWidth(), DEFAULT_PROGRESS_BAR_WIDTH);
    });

    it("normalizes numeric inputs", () => {
        assert.equal(resolveProgressBarWidth("  32 "), 32);
        assert.equal(resolveProgressBarWidth(16.75), 16);
    });

    it("rejects non-positive widths", () => {
        assert.throws(() => resolveProgressBarWidth(0), /positive integer/i);
        assert.throws(() => resolveProgressBarWidth(-5), /positive integer/i);
    });

    it("allows configuring the default width programmatically", () => {
        setDefaultProgressBarWidth(40);

        assert.equal(getDefaultProgressBarWidth(), 40);
        assert.equal(resolveProgressBarWidth(), 40);
    });

    it("resets to the baseline default when set to undefined", () => {
        setDefaultProgressBarWidth(31);
        setDefaultProgressBarWidth(undefined);

        assert.equal(getDefaultProgressBarWidth(), DEFAULT_PROGRESS_BAR_WIDTH);
    });

    it("applies the environment override for the default width", () => {
        applyProgressBarWidthEnvOverride({
            [PROGRESS_BAR_WIDTH_ENV_VAR]: "28"
        });

        assert.equal(getDefaultProgressBarWidth(), 28);
    });
});
