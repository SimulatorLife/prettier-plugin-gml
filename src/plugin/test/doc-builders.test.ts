import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as Printer from "../src/printer/index.js";

void describe("doc builder sanitization", () => {
    void it("replaces nullish fragments when concatenating", () => {
        const result = Printer.DocBuilders.concat(["alpha", null, "bravo"]);
        assert.deepEqual(result, ["alpha", "", "bravo"]);
    });

    void it("sanitizes join fragments", () => {
        const result = Printer.DocBuilders.join(Printer.DocBuilders.line, [
            "alpha",
            undefined,
            "bravo"
        ]);
        assert.deepEqual(result, [
            "alpha",
            Printer.DocBuilders.line,
            "",
            Printer.DocBuilders.line,
            "bravo"
        ]);
    });

    void it("wraps sanitized content in groups", () => {
        const result = Printer.DocBuilders.group([
            Printer.DocBuilders.hardline,
            false,
            "tail"
        ]);
        assert.equal((result as any).type, "group");
        assert.deepEqual((result as any).contents, [
            [{ type: "line", hard: true }, { type: "break-parent" }],
            "",
            "tail"
        ]);
    });
});
