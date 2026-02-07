import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
    assertValidIdentifierName,
    extractSymbolName,
    hasMethod,
    parseSymbolIdParts
} from "../src/validation-utils.js";

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

    void test("works with inherited methods like toString", () => {
        const obj = {};
        // toString exists on the prototype and should be detected
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

void describe("extractSymbolName", () => {
    void test("extracts symbol name from fully-qualified ID", () => {
        assert.strictEqual(extractSymbolName("gml/script/scr_player"), "scr_player");
        assert.strictEqual(extractSymbolName("gml/var/hp"), "hp");
        assert.strictEqual(extractSymbolName("gml/event/create"), "create");
    });

    void test("returns original ID when no slashes present", () => {
        assert.strictEqual(extractSymbolName("invalid"), "invalid");
        assert.strictEqual(extractSymbolName("simple"), "simple");
    });

    void test("handles trailing slash", () => {
        assert.strictEqual(extractSymbolName("gml/script/"), "");
    });

    void test("handles multiple slashes", () => {
        assert.strictEqual(extractSymbolName("gml/nested/path/to/symbol"), "symbol");
    });

    void test("handles empty string", () => {
        assert.strictEqual(extractSymbolName(""), "");
    });

    void test("handles single segment", () => {
        assert.strictEqual(extractSymbolName("segment"), "segment");
    });
});

void describe("parseSymbolIdParts", () => {
    void test("parses valid symbol IDs", () => {
        assert.deepStrictEqual(parseSymbolIdParts("gml/script/scr_player"), {
            segments: ["gml", "script", "scr_player"],
            symbolKind: "script",
            symbolName: "scr_player"
        });
    });

    void test("returns null for malformed symbol IDs", () => {
        assert.strictEqual(parseSymbolIdParts("gml/script"), null);
        assert.strictEqual(parseSymbolIdParts("script"), null);
    });

    void test("handles extra path segments", () => {
        assert.deepStrictEqual(parseSymbolIdParts("gml/nested/path/to/symbol"), {
            segments: ["gml", "nested", "path", "to", "symbol"],
            symbolKind: "nested",
            symbolName: "symbol"
        });
    });
});
