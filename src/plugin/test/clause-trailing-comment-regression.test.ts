import assert from "node:assert/strict";
import { test } from "node:test";
import { Plugin } from "../src/index.js";

test("prints clause trailing comments with non-block bodies", async () => {
    const source = [
        "if (condition)\t//\tClause comment with tabs",
        "    perform_action();"
    ].join("\n");

    const formatted = await Plugin.format(source);
    const [clauseLine] = formatted.split("\n");

    assert.ok(
        clauseLine.includes("// Clause comment with tabs"),
        "Clause trailing comments should remain attached to their clause line."
    );

    assert.ok(
        !clauseLine.includes("//\t"),
        "Tabs inside clause trailing comments should be expanded to spaces."
    );
});
