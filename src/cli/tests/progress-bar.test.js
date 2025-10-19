import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_PROGRESS_BAR_WIDTH,
    getDefaultProgressBarWidth,
    resolveProgressBarWidth
} from "../lib/progress-bar.js";

describe("progress bar utilities", () => {
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
});
