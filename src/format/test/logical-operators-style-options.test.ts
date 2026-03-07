import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Format } from "../src/index.js";
import { LogicalOperatorsStyle, normalizeLogicalOperatorsStyle } from "../src/options/logical-operators-style.js";

void describe("normalizeLogicalOperatorsStyle", () => {
    void it("defaults to keywords when the option is unset", () => {
        assert.equal(normalizeLogicalOperatorsStyle(), LogicalOperatorsStyle.KEYWORDS);
    });

    void it("accepts the symbolic operator style", () => {
        assert.equal(normalizeLogicalOperatorsStyle(LogicalOperatorsStyle.SYMBOLS), LogicalOperatorsStyle.SYMBOLS);
    });

    void it("throws for unrecognised string values", () => {
        assert.throws(() => normalizeLogicalOperatorsStyle("emoji"), {
            name: "RangeError"
        });
    });
});

void describe("logicalOperatorsStyle formatting enforcement", () => {
    // The 'symbols' mode enforces symbol form: it converts keyword operators
    // (and, or, xor) to their symbol equivalents (&&, ||, ^^). It does NOT
    // preserve keyword operators as-is.
    void it("symbols mode converts 'and' keyword to '&&'", async () => {
        const formatted = await Format.format("var a = x and y;\n", { logicalOperatorsStyle: "symbols" });
        assert.equal(formatted.trim(), "var a = x && y;");
    });

    void it("symbols mode converts 'or' keyword to '||'", async () => {
        const formatted = await Format.format("var a = x or y;\n", { logicalOperatorsStyle: "symbols" });
        assert.equal(formatted.trim(), "var a = x || y;");
    });

    void it("symbols mode converts 'xor' keyword to '^^'", async () => {
        const formatted = await Format.format("var a = x xor y;\n", { logicalOperatorsStyle: "symbols" });
        assert.equal(formatted.trim(), "var a = x ^^ y;");
    });

    // The 'keywords' mode enforces keyword form: it converts symbolic operators
    // (&&, ||, ^^) to their keyword equivalents (and, or, xor).
    void it("keywords mode converts '&&' to 'and'", async () => {
        const formatted = await Format.format("var a = x && y;\n", { logicalOperatorsStyle: "keywords" });
        assert.equal(formatted.trim(), "var a = x and y;");
    });

    void it("keywords mode leaves 'and' unchanged", async () => {
        const formatted = await Format.format("var a = x and y;\n", { logicalOperatorsStyle: "keywords" });
        assert.equal(formatted.trim(), "var a = x and y;");
    });
});
