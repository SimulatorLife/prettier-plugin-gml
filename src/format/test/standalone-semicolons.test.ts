import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Format } from "../src/index.js";

void describe("standalone semicolons", () => {
    void it("drops empty statements that consist only of a semicolon", async () => {
        const source = ["foo();", ";", "bar();", ""].join("\n");

        const formatted = await Format.format(source);

        const expected = ["foo();", "bar();", ""].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
