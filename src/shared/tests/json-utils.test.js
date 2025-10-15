import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { JsonParseError, parseJsonWithContext } from "../json-utils.js";

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
        } catch (thrown) {
            error = thrown;
        }

        assert.ok(error instanceof JsonParseError);
        assert.ok(error instanceof SyntaxError);
        assert.equal(error.name, "JsonParseError");
        assert.equal(error.source, "demo.json");
        assert.equal(error.description, "project metadata");
        assert.match(
            error.message,
            /Failed to parse project metadata from demo\.json: .+/
        );
        assert.ok(error.cause instanceof SyntaxError);
    });
});
