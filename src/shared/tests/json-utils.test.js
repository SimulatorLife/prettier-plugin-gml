import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    isJsonParseError,
    parseJsonWithContext,
    stringifyJsonForFile
} from "../json-utils.js";
import { isErrorLike } from "../utils/capability-probes.js";

describe("parseJsonWithContext", () => {
    it("parses JSON payloads with optional revivers", () => {
        const payload = '{"value": 2}';
        const parsed = parseJsonWithContext(payload, {
            reviver(key, value) {
                return key === "value" ? value * 3 : value;
            }
        });

        assert.deepStrictEqual(parsed, { value: 6 });
    });

    it("annotates errors with contextual metadata", () => {
        let error;
        try {
            parseJsonWithContext("{ invalid", {
                source: "demo.json",
                description: "project metadata"
            });
        } catch (error_) {
            error = error_;
        }

        assert.ok(isJsonParseError(error));
        assert.equal(error.name, "JsonParseError");
        assert.equal(error.source, "demo.json");
        assert.equal(error.description, "project metadata");
        assert.match(
            error.message,
            /Failed to parse project metadata from demo\.json: .+/
        );
        assert.ok(isErrorLike(error.cause));
        assert.equal(error.cause.name, "SyntaxError");
        assert.equal(isJsonParseError(new Error("nope")), false);
        assert.equal(
            isJsonParseError({ message: "fail", name: "JsonParseError" }),
            false
        );
    });

    it("normalizes whitespace-only descriptions and error messages", () => {
        let error;
        try {
            parseJsonWithContext('{"value": 1}', {
                description: "   custom   ",
                source: {
                    toString() {
                        return "demo.json";
                    }
                },
                reviver() {
                    throw new SyntaxError("  spaced message  ");
                }
            });
        } catch (error_) {
            error = error_;
        }

        assert.ok(isJsonParseError(error));
        assert.equal(error.description, "custom");
        assert.equal(error.source, "demo.json");
        assert.match(
            error.message,
            /Failed to parse custom from demo\.json: spaced message/
        );
    });
});

describe("stringifyJsonForFile", () => {
    it("serializes objects with a trailing newline by default", () => {
        const contents = stringifyJsonForFile({ value: 1 }, { space: 2 });
        assert.equal(contents, '{\n  "value": 1\n}\n');
    });

    it("respects newline suppression requests", () => {
        const contents = stringifyJsonForFile(
            { value: 1 },
            {
                space: 2,
                includeTrailingNewline: false
            }
        );

        assert.equal(contents, '{\n  "value": 1\n}');
    });

    it("honours custom newline tokens without duplicating them", () => {
        const contents = stringifyJsonForFile(
            { value: 1 },
            {
                space: 2,
                newline: "\r\n"
            }
        );

        assert.ok(contents.endsWith("\r\n"));
        assert.ok(!contents.endsWith("\r\n\r\n"));
    });

    it("falls back to standard newlines when provided an invalid terminator", () => {
        const contents = stringifyJsonForFile(
            { value: 1 },
            {
                space: 0,
                newline: ""
            }
        );

        assert.ok(contents.endsWith("\n"));
    });
});
