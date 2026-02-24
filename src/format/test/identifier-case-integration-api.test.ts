import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Format } from "../index.js";

void describe("format workspace API", () => {
    void it("formats source without semantic integration hooks", async () => {
        const formatted = await Format.format("function test() {\n    return 1;\n}\n", {
            filepath: "script.gml"
        });

        assert.match(formatted, /function test\(\)/);
    });
});
