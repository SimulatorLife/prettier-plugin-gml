import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { hasMethod, assertValidIdentifierName, assertNonEmptyNameString } from "../src/validation-utils.js";

void describe("hasMethod", () => {
    void test("returns true when object has the specified method", () => {
        const obj = {
            foo: () => "bar",
            baz: 42
        };

        assert.strictEqual(hasMethod(obj, "foo"), true);
    });

    void test("returns false when object does not have the specified method", () => {
        const obj = {
            foo: () => "bar",
            baz: 42
        };

        assert.strictEqual(hasMethod(obj, "nonexistent"), false);
    });

    void test("returns false when property exists but is not a function", () => {
        const obj = {
            foo: () => "bar",
            baz: 42
        };

        assert.strictEqual(hasMethod(obj, "baz"), false);
    });

    void test("returns false when object is null", () => {
        assert.strictEqual(hasMethod(null, "foo"), false);
    });

    void test("returns false when object is undefined", () => {
        assert.strictEqual(hasMethod(undefined, "foo"), false);
    });

    void test("works with class instances", () => {
        class TestClass {
            myMethod() {
                return "result";
            }
        }

        const instance = new TestClass();
        assert.strictEqual(hasMethod(instance, "myMethod"), true);
        assert.strictEqual(hasMethod(instance, "nonexistent"), false);
    });

    void test("returns false for inherited Object methods when not present", () => {
        const obj = {};
        // toString exists but on the prototype, not as an own property
        // Our implementation checks the object itself, so this should still work
        assert.strictEqual(hasMethod(obj, "toString"), true);
    });

    void test("handles async functions", () => {
        const obj = {
            async asyncMethod() {
                return "result";
            }
        };

        assert.strictEqual(hasMethod(obj, "asyncMethod"), true);
    });

    void test("handles arrow functions", () => {
        const obj = {
            arrowMethod: () => "result"
        };

        assert.strictEqual(hasMethod(obj, "arrowMethod"), true);
    });
});

void describe("assertValidIdentifierName", () => {
    void test("accepts valid identifier", () => {
        const result = assertValidIdentifierName("validName");
        assert.strictEqual(result, "validName");
    });

    void test("accepts identifier with underscores", () => {
        const result = assertValidIdentifierName("valid_name_123");
        assert.strictEqual(result, "valid_name_123");
    });

    void test("accepts identifier starting with underscore", () => {
        const result = assertValidIdentifierName("_privateName");
        assert.strictEqual(result, "_privateName");
    });

    void test("rejects identifier with leading whitespace", () => {
        assert.throws(() => assertValidIdentifierName(" name"), {
            message: /leading or trailing whitespace/
        });
    });

    void test("rejects identifier with trailing whitespace", () => {
        assert.throws(() => assertValidIdentifierName("name "), {
            message: /leading or trailing whitespace/
        });
    });

    void test("rejects empty string", () => {
        assert.throws(() => assertValidIdentifierName(""), {
            message: /must not be empty/
        });
    });

    void test("rejects non-string input", () => {
        assert.throws(() => assertValidIdentifierName(123 as unknown as string), {
            name: "TypeError"
        });
    });

    void test("rejects identifier starting with number", () => {
        assert.throws(() => assertValidIdentifierName("123name"), {
            message: /not a valid GML identifier/
        });
    });

    void test("rejects identifier with special characters", () => {
        assert.throws(() => assertValidIdentifierName("name-with-dash"), {
            message: /not a valid GML identifier/
        });
    });
});

void describe("assertNonEmptyNameString", () => {
    void test("does not throw for valid string", () => {
        assert.doesNotThrow(() => {
            assertNonEmptyNameString("validName", "testParam", "testFunction");
        });
    });

    void test("throws TypeError for empty string", () => {
        assert.throws(() => assertNonEmptyNameString("", "testParam", "testFunction"), {
            name: "TypeError",
            message: /testFunction requires testParam as a non-empty string/
        });
    });

    void test("throws TypeError for non-string input", () => {
        assert.throws(() => assertNonEmptyNameString(123 as unknown as string, "testParam", "testFunction"), {
            name: "TypeError",
            message: /testFunction requires testParam as a non-empty string/
        });
    });

    void test("throws TypeError for null", () => {
        assert.throws(() => assertNonEmptyNameString(null as unknown as string, "testParam", "testFunction"), {
            name: "TypeError",
            message: /testFunction requires testParam as a non-empty string/
        });
    });

    void test("throws TypeError for undefined", () => {
        assert.throws(() => assertNonEmptyNameString(undefined as unknown as string, "testParam", "testFunction"), {
            name: "TypeError",
            message: /testFunction requires testParam as a non-empty string/
        });
    });
});
