import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Format } from "../src/index.js";

void describe("constructor instance method semicolons", () => {
    void it("adds semicolons for assignments inside constructor methods", async () => {
        const source = [
            "function Line() : Shape() constructor {",
            "    function set_points(x1, y1) {",
            "        self.x1 = x1",
            "        self.y1 = y1",
            "    }",
            "}",
            ""
        ].join("\n");

        const formatted = await Format.format(source);

        const expected = [
            "function Line() : Shape() constructor {",
            "    function set_points(x1, y1) {",
            "        self.x1 = x1;",
            "        self.y1 = y1;",
            "    }",
            "",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    void it("keeps constructor methods compact when no parent clause exists", async () => {
        const source = [
            "function Line() constructor {",
            "    function set_points(x1, y1) {",
            "        self.x1 = x1",
            "        self.y1 = y1",
            "    }",
            "}",
            ""
        ].join("\n");

        const formatted = await Format.format(source);

        const expected = [
            "function Line() constructor {",
            "    function set_points(x1, y1) {",
            "        self.x1 = x1;",
            "        self.y1 = y1;",
            "    }",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
