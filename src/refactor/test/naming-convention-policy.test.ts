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
            typeName: {
                caseStyle: "pascal"
            },
            member: {
                suffix: "_member"
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
    assert.equal(resolved.structDeclaration?.caseStyle, "pascal");
    assert.equal(resolved.enum?.caseStyle, "pascal");
    assert.equal(resolved.enumMember?.suffix, "_member");
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

void test("evaluateNamingConvention strips banned affixes before applying case style", () => {
    // Exercises the third-priority branch in stripOneAffixDirection: when the identifier
    // carries a banned prefix or suffix (not the required one, not an exclusive one), it is
    // stripped before the core name is case-checked and a suggestion is produced.
    const policy = Refactor.normalizeNamingConventionPolicy({
        rules: {
            localVariable: {
                caseStyle: "camel",
                bannedPrefixes: ["m_", "_"],
                bannedSuffixes: ["_t"]
            }
        }
    });
    const resolved = Refactor.resolveNamingConventionRules(policy);

    const withBannedPrefix = Refactor.evaluateNamingConvention("m_player_hp", "localVariable", policy, resolved);
    assert.equal(withBannedPrefix.compliant, false);
    assert.equal(withBannedPrefix.suggestedName, "playerHp");
    assert.match(withBannedPrefix.message ?? "", /banned prefix/);

    const withBannedSuffix = Refactor.evaluateNamingConvention("playerHp_t", "localVariable", policy, resolved);
    assert.equal(withBannedSuffix.compliant, false);
    assert.equal(withBannedSuffix.suggestedName, "playerHp");
    assert.match(withBannedSuffix.message ?? "", /banned suffix/);
});

void test("normalizeNamingConventionPolicy rejects unsupported naming categories", () => {
    assert.throws(
        () =>
            Refactor.normalizeNamingConventionPolicy({
                rules: {
                    eventHandlerFunction: {
                        caseStyle: "camel"
                    }
                }
            } as Parameters<typeof Refactor.normalizeNamingConventionPolicy>[0]),
        /unknown category/
    );
});

void test("resolveNamingConventionRules supports separate path and animation-curve categories", () => {
    const policy = Refactor.normalizeNamingConventionPolicy({
        rules: {
            resource: {
                caseStyle: "lower"
            },
            pathResourceName: {
                prefix: "pth_"
            },
            animationCurveResourceName: {
                prefix: "curve_"
            }
        }
    });

    const resolved = Refactor.resolveNamingConventionRules(policy);

    assert.equal(resolved.pathResourceName?.prefix, "pth_");
    assert.equal(resolved.animationCurveResourceName?.prefix, "curve_");
    assert.equal(resolved.pathResourceName?.caseStyle, "lower");
    assert.equal(resolved.animationCurveResourceName?.caseStyle, "lower");
});

void test("resolveNamingConventionRules supports sequence, tileset, particle, note, and extension categories", () => {
    const policy = Refactor.normalizeNamingConventionPolicy({
        rules: {
            resource: {
                caseStyle: "lower"
            },
            sequenceResourceName: {
                prefix: "seq_"
            },
            tilesetResourceName: {
                prefix: "tile_"
            },
            particleSystemResourceName: {
                prefix: "part_"
            },
            noteResourceName: {
                prefix: "note_"
            },
            extensionResourceName: {
                prefix: "ext_"
            }
        }
    });

    const resolved = Refactor.resolveNamingConventionRules(policy);

    assert.equal(resolved.sequenceResourceName?.prefix, "seq_");
    assert.equal(resolved.tilesetResourceName?.prefix, "tile_");
    assert.equal(resolved.particleSystemResourceName?.prefix, "part_");
    assert.equal(resolved.noteResourceName?.prefix, "note_");
    assert.equal(resolved.extensionResourceName?.prefix, "ext_");
    assert.equal(resolved.sequenceResourceName?.caseStyle, "lower");
    assert.equal(resolved.tilesetResourceName?.caseStyle, "lower");
    assert.equal(resolved.particleSystemResourceName?.caseStyle, "lower");
    assert.equal(resolved.noteResourceName?.caseStyle, "lower");
    assert.equal(resolved.extensionResourceName?.caseStyle, "lower");
});
