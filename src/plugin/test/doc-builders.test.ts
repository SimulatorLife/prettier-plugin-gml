import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    concat,
    join,
    group,
    line,
    hardline
} from "../src/printer/doc-builders.js";

void describe("doc builder sanitization", () => {
    void it("replaces nullish fragments when concatenating", () => {
        const result = concat(["alpha", null, "bravo"]);
        assert.deepEqual(result, ["alpha", "", "bravo"]);
    });

    void it("sanitizes join fragments", () => {
        const result = join(line, ["alpha", undefined, "bravo"]);
        assert.deepEqual(result, ["alpha", line, "", line, "bravo"]);
    });

    void it("wraps sanitized content in groups", () => {
        const result = group([hardline, false, "tail"]);
        assert.equal((result as any).type, "group");
        assert.deepEqual((result as any).contents, [
            [{ type: "line", hard: true }, { type: "break-parent" }],
            "",
            "tail"
        ]);
    });
});
