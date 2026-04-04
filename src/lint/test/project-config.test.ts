import assert from "node:assert/strict";
import test from "node:test";

import { createLintRuleEntriesFromProjectConfig, normalizeLintRulesConfig } from "../src/configs/index.js";

void test("normalizeLintRulesConfig validates and returns rule overrides", () => {
    const rules = normalizeLintRulesConfig({
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
    assert.throws(() => normalizeLintRulesConfig({ lintRules: [] }), {
        name: "TypeError",
        message: "gmloop.json lintRules must be an object."
    });
});

void test("createLintRuleEntriesFromProjectConfig builds enabled rule entries", () => {
    const ruleEntries = createLintRuleEntriesFromProjectConfig({
        lintRules: {
            "gml/no-globalvar": "error"
        }
    });

    assert.deepEqual(ruleEntries, {
        "gml/no-globalvar": "error"
    });
});

void test("createLintRuleEntriesFromProjectConfig passes matching top-level rule options", () => {
    const ruleEntries = createLintRuleEntriesFromProjectConfig({
        lintRules: {
            "gml/prefer-hoistable-loop-accessors": "warn"
        },
        minOccurrences: 3,
        functionSuffixes: {
            array_length: "count"
        },
        ignoredTopLevelKey: true
    });

    assert.deepEqual(ruleEntries, {
        "gml/prefer-hoistable-loop-accessors": [
            "warn",
            {
                minOccurrences: 3,
                functionSuffixes: {
                    array_length: "count"
                }
            }
        ]
    });
});
