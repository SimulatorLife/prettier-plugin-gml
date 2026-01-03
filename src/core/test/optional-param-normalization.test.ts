import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Core } from "@gml-modules/core";

void describe("normalizeOptionalParamToken", () => {
    void it("wraps Feather sentinels in brackets", () => {
        assert.strictEqual(Core.normalizeOptionalParamToken("*value*"), "[value]");
        assert.strictEqual(Core.normalizeOptionalParamToken("* optional *"), "[optional]");
    });

    void it("preserves already normalized tokens", () => {
        assert.strictEqual(Core.normalizeOptionalParamToken("[existing]"), "[existing]");
    });

    void it("returns non-string tokens unchanged", () => {
        const sentinel = Symbol("value");
        assert.strictEqual(Core.normalizeOptionalParamToken(null), null);
        assert.strictEqual(Core.normalizeOptionalParamToken(42), 42);
        assert.strictEqual(Core.normalizeOptionalParamToken(sentinel), sentinel);
    });

    void it("strips sentinels that contain no identifier", () => {
        assert.strictEqual(Core.normalizeOptionalParamToken("***"), "");
    });
});
