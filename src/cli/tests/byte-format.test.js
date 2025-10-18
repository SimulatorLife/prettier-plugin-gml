import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatByteSize, formatBytes } from "../lib/byte-format.js";

describe("byte-format", () => {
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

    describe("formatBytes", () => {
        it("formats string sizes using byte counts", () => {
            assert.equal(formatBytes(""), "0B");
            assert.equal(formatBytes("hello"), "5B");
            assert.equal(formatBytes("a".repeat(2048)), "2.0KB");
        });
    });
});
