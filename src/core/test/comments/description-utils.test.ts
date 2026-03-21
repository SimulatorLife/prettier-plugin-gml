import assert from "node:assert/strict";
import test from "node:test";

import { Core } from "../../src/index.js";

void test("collectDescriptionContinuationText normalizes multiline description payloads with consumed-line metadata", () => {
    const docLines = [
        "    /// @description Build the packet",
        "    /// first line",
        "    ///   nested details",
        "    ///",
        "    /// @param value"
    ];

    const { prefix } = Core.resolveDescriptionIndentation(docLines[0]);
    const result = Core.collectDescriptionContinuationText(docLines, 0, Math.max(prefix.length - 3, 0));

    assert.deepStrictEqual(result, {
        continuations: ["first line", "nested details", ""],
        linesConsumed: 4
    });
});
