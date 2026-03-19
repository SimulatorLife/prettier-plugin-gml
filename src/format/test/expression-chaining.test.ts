import assert from "node:assert";
import { describe, it } from "node:test";

import { Format } from "../src/index.js";

void describe("GML formatter - chained expression bug", () => {
    void it("should not break chained assignment/member expressions", async () => {
        const input = `_mapping = set_mapping(gp_axislv, 0, __INPUT_MAPPING.AXIS, "lefty").limited_range = true;`;
        const expected = `_mapping = set_mapping(gp_axislv, 0, __INPUT_MAPPING.AXIS, "lefty").limited_range = true;`;
        const output = await Format.format(input);
        assert.strictEqual(output.trim(), expected);
    });
});
