import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    formatByteSize,
    isFiniteNumber,
    toNormalizedInteger
} from "../number-utils.js";

describe("number-utils", () => {
    describe("isFiniteNumber", () => {
        it("returns true for finite numbers", () => {
            assert.equal(isFiniteNumber(0), true);
            assert.equal(isFiniteNumber(42), true);
            assert.equal(isFiniteNumber(-13.5), true);
        });

        it("returns false for non-number values", () => {
            assert.equal(isFiniteNumber(null), false);
            assert.equal(isFiniteNumber(), false);
            assert.equal(isFiniteNumber("10"), false);
            assert.equal(isFiniteNumber(Number.NaN), false);
            assert.equal(isFiniteNumber(Infinity), false);
            assert.equal(isFiniteNumber(-Infinity), false);
        });
    });

    describe("formatByteSize", () => {
        it("formats byte counts with default options", () => {
            assert.equal(formatByteSize(0), "0B");
            assert.equal(formatByteSize(512), "512B");
            assert.equal(formatByteSize(2048), "2.0KB");
        });

        it("supports custom separators and precision", () => {
            assert.equal(
                formatByteSize(512, {
                    decimals: 2,
                    decimalsForBytes: 2,
                    separator: " "
                }),
                "512.00 B"
            );
            assert.equal(
                formatByteSize(5 * 1024 * 1024, {
                    decimals: 2,
                    separator: " ",
                    trimTrailingZeros: true
                }),
                "5 MB"
            );
        });
    });

    describe("toNormalizedInteger", () => {
        it("returns truncated integers for finite numbers", () => {
            assert.equal(toNormalizedInteger(10), 10);
            assert.equal(toNormalizedInteger(3.9), 3);
            assert.equal(toNormalizedInteger(-2.4), -2);
            assert.equal(toNormalizedInteger(-0.5), 0);
        });

        it("returns null for non-finite inputs", () => {
            assert.equal(toNormalizedInteger(Number.NaN), null);
            assert.equal(toNormalizedInteger(Infinity), null);
            assert.equal(toNormalizedInteger(-Infinity), null);
            assert.equal(toNormalizedInteger("10"), null);
            assert.equal(toNormalizedInteger(), null);
        });
    });
});
