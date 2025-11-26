import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

describe("enum trailing comment spacing", () => {
    it("keeps inline comments snug after aligned initializers", async () => {
        const source = [
            "enum eTransitionType {",
            "    in = eTransitionState.in, // zoom in",
            "    out = eTransitionState.out, // zoom out",
            "    partway_in = eTransitionState.partway_in, // zoom part way in",
            "    partway_out = eTransitionState.partway_out // zoom part way in",
            "}",
            ""
        ].join("\n");

        const formatted = await Plugin.format(source);

        const expected = [
            "enum eTransitionType {",
            "    in          = eTransitionState.in, // zoom in",
            "    out         = eTransitionState.out, // zoom out",
            "    partway_in  = eTransitionState.partway_in, // zoom part way in",
            "    partway_out = eTransitionState.partway_out // zoom part way in",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
