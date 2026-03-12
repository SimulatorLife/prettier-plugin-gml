import assert from "node:assert/strict";
import test from "node:test";

import { Refactor } from "../index.js";

void test("resolveNamingConventionRules applies inheritance and explicit disablement", () => {
    const policy = Refactor.normalizeNamingConventionPolicy({
        rules: {
            variable: {
                caseStyle: "camel",
                bannedPrefixes: ["_"]
            },
            globalVariable: {
                prefix: "g_"
            },
            loopIndexVariable: false
        },
        exclusivePrefixes: {
            g_: "globalVariable"
        }
    });

    const resolved = Refactor.resolveNamingConventionRules(policy);

    assert.equal(resolved.globalVariable?.prefix, "g_");
    assert.equal(resolved.globalVariable?.suffix, "");
    assert.equal(resolved.globalVariable?.caseStyle, "camel");
    assert.equal(resolved.globalVariable?.minChars, null);
    assert.equal(resolved.globalVariable?.maxChars, null);
    assert.deepEqual(resolved.globalVariable?.bannedPrefixes, ["_"]);
    assert.deepEqual(resolved.globalVariable?.bannedSuffixes, []);
    assert.equal(resolved.loopIndexVariable, undefined);
});

void test("evaluateNamingConvention suggests case and prefix fixes", () => {
    const policy = Refactor.normalizeNamingConventionPolicy({
        rules: {
            variable: {
                caseStyle: "camel"
            },
            globalVariable: {
                prefix: "g_"
            }
        }
    });

    const evaluation = Refactor.evaluateNamingConvention(
        "g_player_hp",
        "globalVariable",
        policy,
        Refactor.resolveNamingConventionRules(policy)
    );

    assert.equal(evaluation.compliant, false);
    assert.equal(evaluation.suggestedName, "g_playerHp");
    assert.match(evaluation.message ?? "", /camel case/);
});

void test("evaluateNamingConvention blocks automatic renames when min or max length is violated", () => {
    const policy = Refactor.normalizeNamingConventionPolicy({
        rules: {
            localVariable: {
                caseStyle: "camel",
                minChars: 4,
                maxChars: 8
            }
        }
    });
    const resolved = Refactor.resolveNamingConventionRules(policy);

    const tooShort = Refactor.evaluateNamingConvention("id", "localVariable", policy, resolved);
    const tooLong = Refactor.evaluateNamingConvention("veryLongName", "localVariable", policy, resolved);

    assert.equal(tooShort.suggestedName, null);
    assert.match(tooShort.message ?? "", /minimum core length/);
    assert.equal(tooLong.suggestedName, null);
    assert.match(tooLong.message ?? "", /maximum core length/);
});

void test("evaluateNamingConvention reports reserved affix violations", () => {
    const policy = Refactor.normalizeNamingConventionPolicy({
        rules: {
            localVariable: {
                caseStyle: "camel"
            },
            globalVariable: {
                prefix: "g_"
            }
        },
        exclusivePrefixes: {
            g_: "globalVariable"
        }
    });

    const evaluation = Refactor.evaluateNamingConvention(
        "g_localValue",
        "localVariable",
        policy,
        Refactor.resolveNamingConventionRules(policy)
    );

    assert.equal(evaluation.compliant, false);
    assert.equal(evaluation.suggestedName, "localValue");
    assert.match(evaluation.message ?? "", /reserved prefix/);
});
