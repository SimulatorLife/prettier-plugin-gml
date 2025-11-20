import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeOptionalParamToken } from "../src/comments/index.js";

describe("normalizeOptionalParamToken", () => {
    it("wraps Feather sentinels in brackets", () => {
        assert.strictEqual(normalizeOptionalParamToken("*value*"), "[value]");
        assert.strictEqual(
            normalizeOptionalParamToken("* optional *"),
            "[optional]"
        );
    });

    it("preserves already normalized tokens", () => {
        assert.strictEqual(
            normalizeOptionalParamToken("[existing]"),
            "[existing]"
        );
    });

    it("returns non-string tokens unchanged", () => {
        const sentinel = Symbol("value");
        assert.strictEqual(normalizeOptionalParamToken(null), null);
        assert.strictEqual(normalizeOptionalParamToken(42), 42);
        assert.strictEqual(normalizeOptionalParamToken(sentinel), sentinel);
    });

    it("strips sentinels that contain no identifier", () => {
        assert.strictEqual(normalizeOptionalParamToken("***"), "");
    });
});
