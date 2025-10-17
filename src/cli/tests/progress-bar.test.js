import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    getDefaultProgressBarWidth,
    resolveProgressBarWidth,
    setDefaultProgressBarWidth
} from "../lib/progress-bar.js";

describe("progress bar utilities", () => {
    it("allows the default width to be updated", () => {
        const originalDefault = getDefaultProgressBarWidth();

        try {
            setDefaultProgressBarWidth(32);
            assert.equal(getDefaultProgressBarWidth(), 32);
            assert.equal(resolveProgressBarWidth(), 32);
        } finally {
            setDefaultProgressBarWidth(originalDefault);
        }
    });

    it("supports overriding the default width per resolution", () => {
        const originalDefault = getDefaultProgressBarWidth();

        try {
            setDefaultProgressBarWidth(40);
            assert.equal(
                resolveProgressBarWidth(undefined, { defaultWidth: 12 }),
                12
            );
            assert.equal(resolveProgressBarWidth(), 40);
        } finally {
            setDefaultProgressBarWidth(originalDefault);
        }
    });

    it("rejects invalid defaults", () => {
        const originalDefault = getDefaultProgressBarWidth();

        try {
            assert.throws(
                () => setDefaultProgressBarWidth(0),
                /positive integer/
            );
            assert.equal(getDefaultProgressBarWidth(), originalDefault);
            assert.equal(resolveProgressBarWidth(), originalDefault);
        } finally {
            setDefaultProgressBarWidth(originalDefault);
        }
    });
});
