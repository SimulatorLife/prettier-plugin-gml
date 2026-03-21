import assert from "node:assert";
import { describe, it } from "node:test";

import { Format } from "../src/index.js";

void describe("GML formatter - long chained assignment/member expressions", () => {
    void it("should keep long chains inline unless print width is exceeded", async () => {
        // Note: in GML, this is actually resolves as a boolean-assigment expression, where the value of `a` is the result of the comparing all the other values for equality to each other and `1`
        const input = `a = b = c = d = e = f = g = h = i = j = k = l = m = n = o = p = q = r = s = t = u = v = w = x = y = z = 1;`;
        const expected = `a = b = c = d = e = f = g = h = i = j = k = l = m = n = o = p = q = r = s = t = u = v = w = x = y = z = 1;`;
        const output = await Format.format(input);
        assert.strictEqual(output.trim(), expected);
    });
});
