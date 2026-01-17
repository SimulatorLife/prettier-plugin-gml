import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Parser } from "../src/index.js";
import { validateSourceText } from "../src/utils/input-validation.js";

const { GMLParser } = Parser;

describe("GMLParser constructor input validation", () => {
    describe("valid input", () => {
        it("should accept valid GML source code", () => {
            const parser = new GMLParser("x = 42;");
            assert.ok(parser);
            assert.equal(parser.originalText, "x = 42;");
        });

        it("should accept empty source", () => {
            const parser = new GMLParser("");
            assert.ok(parser);
            assert.equal(parser.originalText, "");
        });

        it("should accept complex multiline source", () => {
            const source = `
function test() {
    var x = 10;
    return x * 2;
}
`;
            const parser = new GMLParser(source);
            assert.ok(parser);
            assert.equal(parser.originalText, source);
        });
    });

    describe("invalid input types", () => {
        it("should reject null input", () => {
            assert.throws(
                () => new GMLParser(null as unknown as string),
                (error: unknown) => {
                    return (
                        error instanceof TypeError &&
                        error.name === "SourceTextValidationError" &&
                        error.message.includes("cannot be null")
                    );
                }
            );
        });

        it("should reject undefined input", () => {
            assert.throws(
                () => new GMLParser(undefined as unknown as string),
                (error: unknown) => {
                    return (
                        error instanceof TypeError &&
                        error.name === "SourceTextValidationError" &&
                        error.message.includes("cannot be undefined")
                    );
                }
            );
        });

        it("should reject numeric input", () => {
            assert.throws(
                () => new GMLParser(123 as unknown as string),
                (error: unknown) => {
                    return (
                        error instanceof TypeError &&
                        error.name === "SourceTextValidationError" &&
                        error.message.includes("must be a string")
                    );
                }
            );
        });

        it("should reject object input", () => {
            assert.throws(
                () => new GMLParser({ source: "x = 42;" } as unknown as string),
                (error: unknown) => {
                    return (
                        error instanceof TypeError &&
                        error.name === "SourceTextValidationError" &&
                        error.message.includes("must be a string")
                    );
                }
            );
        });

        it("should reject array input", () => {
            assert.throws(
                () => new GMLParser(["x = 42;"] as unknown as string),
                (error: unknown) => {
                    return (
                        error instanceof TypeError &&
                        error.name === "SourceTextValidationError" &&
                        error.message.includes("array")
                    );
                }
            );
        });
    });

    describe("length validation", () => {
        it("should accept source at default limit", () => {
            const maxLength = 10 * 1024 * 1024;
            const source = "x".repeat(maxLength);
            const parser = new GMLParser(source);
            assert.ok(parser);
        });

        it("should reject source exceeding default limit", () => {
            const maxLength = 10 * 1024 * 1024;
            const source = "x".repeat(maxLength + 1);
            assert.throws(
                () => new GMLParser(source),
                (error: unknown) => {
                    return (
                        error instanceof TypeError &&
                        error.name === "SourceTextValidationError" &&
                        error.message.includes("exceeds maximum allowed length")
                    );
                }
            );
        });
    });

    describe("static parse method validation", () => {
        it("should validate input before parsing", () => {
            assert.throws(
                () => GMLParser.parse(null as unknown as string),
                (error: unknown) => {
                    return (
                        error instanceof TypeError &&
                        error.name === "SourceTextValidationError" &&
                        error.message.includes("cannot be null")
                    );
                }
            );
        });

        it("should successfully parse valid input", () => {
            const ast = GMLParser.parse("x = 42;");
            assert.ok(ast);
            assert.equal(ast.type, "Program");
        });
    });

    describe("error message clarity", () => {
        it("should provide actionable error for null", () => {
            try {
                new GMLParser(null as unknown as string);
                assert.fail("Should have thrown");
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes("Provide a string"));
            }
        });

        it("should include actual type in error message", () => {
            try {
                new GMLParser(123 as unknown as string);
                assert.fail("Should have thrown");
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes("number"));
            }
        });

        it("should include length details in overflow error", () => {
            const maxLength = 100;
            const source = "x".repeat(maxLength + 1);
            try {
                validateSourceText(source, { maxLength });
                assert.fail("Should have thrown");
            } catch (error) {
                assert.ok(error instanceof Error);
                assert.ok(error.message.includes(String(maxLength)));
                assert.ok(error.message.includes(String(source.length)));
            }
        });
    });
});
