import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    LogicalOperatorsStyle,
    normalizeLogicalOperatorsStyle
} from "../src/options/logical-operators-style.js";

describe("normalizeLogicalOperatorsStyle", () => {
    it("defaults to keywords when the option is unset", () => {
        assert.equal(
            normalizeLogicalOperatorsStyle(),
            LogicalOperatorsStyle.KEYWORDS
        );
    });

    it("accepts the symbolic operator style", () => {
        assert.equal(
            normalizeLogicalOperatorsStyle(LogicalOperatorsStyle.SYMBOLS),
            LogicalOperatorsStyle.SYMBOLS
        );
    });

    it("throws for unrecognised string values", () => {
        assert.throws(() => normalizeLogicalOperatorsStyle("emoji"), {
            name: "RangeError"
        });
    });
});
