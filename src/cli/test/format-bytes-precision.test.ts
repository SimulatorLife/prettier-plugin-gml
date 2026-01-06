import { describe, it } from "node:test";
import assert from "node:assert";

/**
 * Test helper that replicates the OLD buggy formatBytes implementation
 * without bounds checking. This demonstrates the floating-point precision
 * issue that the fix addresses. This is kept identical to the old code
 * for accurate demonstration of the bug.
 */
function formatBytesWithoutBoundsCheck(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    // OLD CODE: No bounds checking on array index
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    // Using Number.parseFloat to match the actual implementation style
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Fixed implementation with bounds checking to handle floating-point
 * precision edge cases.
 */
function formatBytesWithBoundsCheck(bytes: number): string {
    if (bytes === 0) return "0 B";
    if (bytes < 0 || !Number.isFinite(bytes)) {
        return "Invalid";
    }
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    // FIXED: Clamp index to valid range to handle edge cases where logarithm
    // might produce unexpected values due to floating-point precision
    const i = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1));
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

void describe("formatBytes floating-point precision handling", () => {
    void it("should handle extremely large byte values without array index overflow", () => {
        // Test with a value larger than what GB can represent
        // This produces an index >= 4, which would overflow the sizes array
        const veryLargeBytes = Math.pow(1024, 5); // 1 PB = 1024^5 bytes

        // The old implementation would try to access sizes[4] or sizes[5],
        // which is undefined, causing the output to include "undefined"
        const oldResult = formatBytesWithoutBoundsCheck(veryLargeBytes);
        assert.ok(
            oldResult.includes("undefined"),
            "Old implementation should produce undefined for out-of-bounds index"
        );

        // The fixed implementation clamps to GB (index 3), avoiding the overflow
        const fixedResult = formatBytesWithBoundsCheck(veryLargeBytes);
        assert.ok(fixedResult.includes("GB"), "Fixed implementation should clamp to GB");
        assert.ok(!fixedResult.includes("undefined"), "Fixed implementation should not include undefined");
    });

    void it("should handle negative byte values gracefully", () => {
        const negativeBytes = -1024;

        // The old implementation would call Math.log on a negative number,
        // producing NaN, then Math.floor(NaN) => NaN, then sizes[NaN] => undefined
        const oldResult = formatBytesWithoutBoundsCheck(negativeBytes);
        assert.ok(
            oldResult.includes("undefined") || oldResult.includes("NaN"),
            "Old implementation fails on negative input"
        );

        // The fixed implementation returns "Invalid" for negative values
        const fixedResult = formatBytesWithBoundsCheck(negativeBytes);
        assert.strictEqual(fixedResult, "Invalid", "Fixed implementation should return 'Invalid' for negative bytes");
    });

    void it("should handle zero bytes correctly", () => {
        const result = formatBytesWithBoundsCheck(0);
        assert.strictEqual(result, "0 B", "Should return '0 B' for zero bytes");
    });

    void it("should handle normal byte values correctly", () => {
        assert.strictEqual(formatBytesWithBoundsCheck(1024), "1 KB");
        assert.strictEqual(formatBytesWithBoundsCheck(1_048_576), "1 MB"); // 1024^2
        assert.strictEqual(formatBytesWithBoundsCheck(1_073_741_824), "1 GB"); // 1024^3
    });

    void it("should handle fractional byte values near unit boundaries", () => {
        // Test values that are close to powers of 1024 to ensure
        // floating-point precision doesn't cause unexpected behavior
        const almostOneKB = 1023.9;
        const result = formatBytesWithBoundsCheck(almostOneKB);
        assert.ok(result.includes("B") && !result.includes("KB"), "Should round to bytes");

        const justOverOneKB = 1024.1;
        const result2 = formatBytesWithBoundsCheck(justOverOneKB);
        assert.ok(result2.includes("KB"), "Should round to kilobytes");
    });

    void it("should handle Infinity gracefully", () => {
        const result = formatBytesWithBoundsCheck(Infinity);
        assert.strictEqual(result, "Invalid", "Should return 'Invalid' for Infinity");
    });

    void it("should handle NaN gracefully", () => {
        const result = formatBytesWithBoundsCheck(Number.NaN);
        assert.strictEqual(result, "Invalid", "Should return 'Invalid' for NaN");
    });
});
