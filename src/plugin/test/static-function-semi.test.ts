import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Plugin } from "../src/index.js";

describe("constructor static function assignments", () => {
    it("adds semicolons for static function assignments", async () => {
        const source = [
            "function Shape() constructor {",
            "    static build = function() {",
            "        return 1;",
            "    }",
            "}",
            ""
        ].join("\n");

        const formatted = await Plugin.format(source);

        const expected = [
            "",
            "/// @function Shape",
            "function Shape() constructor {",
            "",
            "    /// @function build",
            "    static build = function() {",
            "        return 1;",
            "    };",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("adds semicolons for static non-function members", async () => {
        const source = [
            "function Shape() constructor {",
            "    static value = 1",
            "}",
            ""
        ].join("\n");

        const formatted = await Plugin.format(source);

        const expected = [
            "",
            "/// @function Shape",
            "function Shape() constructor {",
            "",
            "    static value = 1;",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("omits semicolons for constructor functions", async () => {
        const source = [
            "function Shape() constructor {",
            "    static value = 1;",
            "};",
            ""
        ].join("\n");

        const formatted = await Plugin.format(source);

        const expected = [
            "",
            "/// @function Shape",
            "function Shape() constructor {",
            "",
            "    static value = 1;",
            "}",
            ""
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });
});
