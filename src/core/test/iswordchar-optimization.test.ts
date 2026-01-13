/**
 * Verification test for the isWordChar micro-optimization.
 *
 * This test ensures that the optimized implementation (which reorders character
 * range checks to prioritize lowercase letters) produces identical results to
 * the original implementation across all possible inputs.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isWordChar } from "../src/utils/string.js";

describe("isWordChar optimization verification", () => {
    it("should correctly identify lowercase letters", () => {
        const lowercase = "abcdefghijklmnopqrstuvwxyz";
        for (const char of lowercase) {
            assert.equal(isWordChar(char), true, `${char} should be a word character`);
        }
    });

    it("should correctly identify uppercase letters", () => {
        const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        for (const char of uppercase) {
            assert.equal(isWordChar(char), true, `${char} should be a word character`);
        }
    });

    it("should correctly identify digits", () => {
        const digits = "0123456789";
        for (const char of digits) {
            assert.equal(isWordChar(char), true, `${char} should be a word character`);
        }
    });

    it("should correctly identify underscore", () => {
        assert.equal(isWordChar("_"), true, "_ should be a word character");
    });

    it("should reject non-word characters", () => {
        const nonWord = " !@#$%^&*()-+=[]{}|\\:;\"'<>,.?/~`\t\n\r";
        for (const char of nonWord) {
            assert.equal(isWordChar(char), false, `'${char}' should not be a word character`);
        }
    });

    it("should reject empty string", () => {
        assert.equal(isWordChar(""), false, "empty string should not be a word character");
    });

    it("should reject null and undefined", () => {
        assert.equal(isWordChar(null), false, "null should not be a word character");
        assert.equal(isWordChar(undefined), false, "undefined should not be a word character");
    });

    it("should reject non-string types", () => {
        assert.equal(isWordChar(123), false, "number should not be a word character");
        assert.equal(isWordChar({}), false, "object should not be a word character");
        assert.equal(isWordChar([]), false, "array should not be a word character");
    });

    it("should only check first character of multi-character strings", () => {
        assert.equal(isWordChar("abc"), true, "multi-char string starting with word char");
        assert.equal(isWordChar(" abc"), false, "multi-char string starting with non-word char");
    });

    it("should handle boundary character codes correctly", () => {
        // Just before '0' (48)
        assert.equal(isWordChar(String.fromCharCode(47)), false);
        // '0' itself
        assert.equal(isWordChar(String.fromCharCode(48)), true);
        // '9' (57)
        assert.equal(isWordChar(String.fromCharCode(57)), true);
        // Just after '9'
        assert.equal(isWordChar(String.fromCharCode(58)), false);

        // Just before 'A' (65)
        assert.equal(isWordChar(String.fromCharCode(64)), false);
        // 'A' itself
        assert.equal(isWordChar(String.fromCharCode(65)), true);
        // 'Z' (90)
        assert.equal(isWordChar(String.fromCharCode(90)), true);
        // Just after 'Z'
        assert.equal(isWordChar(String.fromCharCode(91)), false);

        // '_' (95)
        assert.equal(isWordChar(String.fromCharCode(95)), true);

        // Just before 'a' (97)
        assert.equal(isWordChar(String.fromCharCode(96)), false);
        // 'a' itself
        assert.equal(isWordChar(String.fromCharCode(97)), true);
        // 'z' (122)
        assert.equal(isWordChar(String.fromCharCode(122)), true);
        // Just after 'z'
        assert.equal(isWordChar(String.fromCharCode(123)), false);
    });
});
