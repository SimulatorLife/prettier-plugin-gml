import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    DEFAULT_BYTE_FORMAT_RADIX,
    formatByteSize,
    formatBytes,
    getDefaultByteFormatRadix,
    setDefaultByteFormatRadix
} from "../shared/byte-format.js";

// Prefer `assert.strictEqual` to document Node's supported assertion helper. The
// surrounding expectations exercise the same byte-formatting paths, providing
// regression coverage for the migration away from the deprecated `assert.equal`
// shim.

describe("byte-format", () => {
    describe("formatByteSize", () => {
        it("formats byte counts with default options", () => {
            assert.strictEqual(formatByteSize(0), "0B");
            assert.strictEqual(formatByteSize(512), "512B");
            assert.strictEqual(formatByteSize(2048), "2.0KB");
        });

        it("supports custom separators and precision", () => {
            assert.strictEqual(
                formatByteSize(512, {
                    decimals: 2,
                    decimalsForBytes: 2,
                    separator: " "
                }),
                "512.00 B"
            );
            assert.strictEqual(
                formatByteSize(5 * 1024 * 1024, {
                    decimals: 2,
                    separator: " ",
                    trimTrailingZeros: true
                }),
                "5 MB"
            );
        });

        it("accepts per-call radix overrides", () => {
            assert.strictEqual(formatByteSize(1000, { radix: 1000 }), "1.0KB");
            assert.strictEqual(
                formatByteSize(1000, { radix: "invalid" }),
                "1000B"
            );
        });

        it("allows adjusting the default radix", () => {
            const originalRadix = getDefaultByteFormatRadix();

            try {
                assert.strictEqual(originalRadix, DEFAULT_BYTE_FORMAT_RADIX);
                setDefaultByteFormatRadix(1000);
                assert.strictEqual(getDefaultByteFormatRadix(), 1000);
                assert.strictEqual(formatByteSize(1000), "1.0KB");
            } finally {
                setDefaultByteFormatRadix(originalRadix);
            }
        });
    });

    describe("formatBytes", () => {
        it("formats string sizes using byte counts", () => {
            assert.strictEqual(formatBytes(""), "0B");
            assert.strictEqual(formatBytes("hello"), "5B");
            assert.strictEqual(formatBytes("a".repeat(2048)), "2.0KB");
        });
    });
});
