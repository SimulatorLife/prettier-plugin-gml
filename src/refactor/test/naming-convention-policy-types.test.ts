import assert from "node:assert/strict";
import test from "node:test";

import type {
    NamingCaseStyle,
    NamingCategory,
    NamingConventionPolicy,
    ResolvedNamingConventionRules,
    ResolvedNamingRule
} from "../index.js";

void test("NamingCaseStyle supports all documented literals", () => {
    const styles: Array<NamingCaseStyle> = ["lower", "upper", "camel", "lower_snake", "upper_snake", "pascal"];
    assert.equal(styles.length, 6);
});

void test("NamingCategory includes variable naming categories from the policy plan", () => {
    const categories: Array<NamingCategory> = [
        "variable",
        "localVariable",
        "globalVariable",
        "instanceVariable",
        "staticVariable",
        "argument",
        "catchArgument",
        "loopIndexVariable"
    ];

    assert.ok(categories.includes("globalVariable"));
    assert.ok(categories.includes("loopIndexVariable"));
});

void test("NamingConventionPolicy supports category rules and explicit disablement", () => {
    const policy: NamingConventionPolicy = {
        rules: {
            variable: {
                caseStyle: "camel",
                minChars: 2,
                maxChars: 32,
                bannedPrefixes: ["_"],
                bannedSuffixes: ["_"]
            },
            globalVariable: {
                caseStyle: "lower_snake",
                prefix: "g_"
            },
            loopIndexVariable: false
        },
        exclusivePrefixes: {
            g_: "globalVariable"
        }
    };

    assert.equal(policy.rules.loopIndexVariable, false);
    assert.equal(policy.exclusivePrefixes?.g_, "globalVariable");

    const globalVariableRule = policy.rules.globalVariable;
    assert.notEqual(globalVariableRule, undefined);
    assert.notEqual(globalVariableRule, false);

    if (globalVariableRule !== false && globalVariableRule !== undefined) {
        assert.equal(globalVariableRule.caseStyle, "lower_snake");
        assert.equal(globalVariableRule.prefix, "g_");
    }
});

void test("ResolvedNamingRule requires normalized non-optional fields", () => {
    const resolvedRule: ResolvedNamingRule = {
        prefix: "g_",
        suffix: "",
        caseStyle: "lower_snake",
        minChars: 2,
        maxChars: 32,
        bannedPrefixes: ["_"],
        bannedSuffixes: ["_"]
    };

    const resolvedRules: ResolvedNamingConventionRules = {
        globalVariable: resolvedRule
    };

    assert.equal(resolvedRules.globalVariable?.prefix, "g_");
    assert.equal(resolvedRules.globalVariable?.caseStyle, "lower_snake");
    assert.equal(resolvedRules.globalVariable?.minChars, 2);
});
