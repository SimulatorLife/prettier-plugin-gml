import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMetricValue } from "../src/modules/performance/metric-formatters.js";

describe("performance metric formatters", () => {
    it("formats finite numbers with the configured unit", () => {
        assert.equal(formatMetricValue(1.2349, { unit: "ms" }), "1.235 ms");
    });

    it("returns 'n/a' when the value is not finite", () => {
        assert.equal(formatMetricValue(null, { unit: "ms" }), "n/a");
        assert.equal(formatMetricValue(Number.NaN, { unit: "ms" }), "n/a");
    });

    it("omits the unit when none is provided", () => {
        assert.equal(formatMetricValue(2.5, { unit: "" }), "2.500");
        assert.equal(formatMetricValue(2.5), "2.500");
    });

    it("supports custom separators and precision", () => {
        assert.equal(
            formatMetricValue(42, {
                unit: "hits",
                unitSeparator: "-",
                precision: 0
            }),
            "42-hits"
        );
    });
});
