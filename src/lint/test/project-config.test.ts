import assert from "node:assert/strict";
import test from "node:test";

import { Lint } from "../index.js";

void test("normalizeLintRulesConfig validates and returns rule overrides", () => {
    const rules = Lint.normalizeLintRulesConfig({
        lintRules: {
            "gml/no-globalvar": "error",
            "feather/gm1000": "warn"
        }
    });

    assert.deepEqual(rules, {
        "gml/no-globalvar": "error",
        "feather/gm1000": "warn"
    });
});

void test("normalizeLintRulesConfig rejects malformed lintRules", () => {
    assert.throws(() => Lint.normalizeLintRulesConfig({ lintRules: [] }), {
        name: "TypeError",
        message: "gmloop.json lintRules must be an object."
    });
});
