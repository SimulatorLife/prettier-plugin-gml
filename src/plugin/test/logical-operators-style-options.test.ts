import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    LogicalOperatorsStyle,
    normalizeLogicalOperatorsStyle
} from "../src/options/logical-operators-style.js";

void describe("normalizeLogicalOperatorsStyle", () => {
    void it("defaults to keywords when the option is unset", () => {
        assert.equal(
            normalizeLogicalOperatorsStyle(),
            LogicalOperatorsStyle.KEYWORDS
        );
    });

    void it("accepts the symbolic operator style", () => {
        assert.equal(
            normalizeLogicalOperatorsStyle(LogicalOperatorsStyle.SYMBOLS),
            LogicalOperatorsStyle.SYMBOLS
        );
    });

    void it("throws for unrecognised string values", () => {
        assert.throws(() => normalizeLogicalOperatorsStyle("emoji"), {
            name: "RangeError"
        });
    });
});
