import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseFormatterOptionsFixture } from "../features/memory/index.js";
import { JsonParseError } from "../shared/json-utils.js";

describe("parseFormatterOptionsFixture", () => {
    it("parses formatter options objects", () => {
        const result = parseFormatterOptionsFixture('{"printWidth": 99}', {
            source: "/tmp/formatter/options.json"
        });

        assert.deepEqual(result, { printWidth: 99 });
    });

    it("annotates parse failures with context", () => {
        let error;
        try {
            parseFormatterOptionsFixture("{ invalid", {
                source: "/tmp/formatter/options.json"
            });
        } catch (error_) {
            error = error_;
        }

        assert.ok(error instanceof JsonParseError);
        assert.match(
            error.message,
            /Failed to parse formatter options fixture from \/tmp\/formatter\/options\.json/i
        );
    });

    it("rejects non-object formatter options fixtures", () => {
        let error;
        try {
            parseFormatterOptionsFixture("[]", {
                source: "/tmp/formatter/options.json"
            });
        } catch (error_) {
            error = error_;
        }

        assert.ok(error instanceof TypeError);
        assert.match(error.message, /formatter options fixture/i);
        assert.match(error.message, /array/);
    });
});
