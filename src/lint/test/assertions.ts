import assert from "node:assert/strict";

function normalizeWhitespaceAndLineEndings(value: string): string {
    return value.replaceAll(/\r\n?/gu, "\n").replaceAll(/\s+/gu, "");
}

/**
 * Asserts equality while treating whitespace/newline-only differences in strings as equal.
 */
export function assertEquals(actual: unknown, expected: unknown, message?: string): void {
    if (typeof actual === "string" && typeof expected === "string") {
        assert.equal(normalizeWhitespaceAndLineEndings(actual), normalizeWhitespaceAndLineEndings(expected), message);
        return;
    }

    assert.equal(actual, expected, message);
}

/**
 * Asserts inequality while treating whitespace/newline-only differences in strings as equal.
 */
export function assertNotEquals(actual: unknown, expected: unknown, message?: string): void {
    if (typeof actual === "string" && typeof expected === "string") {
        assert.notEqual(
            normalizeWhitespaceAndLineEndings(actual),
            normalizeWhitespaceAndLineEndings(expected),
            message
        );
        return;
    }

    assert.notEqual(actual, expected, message);
}
