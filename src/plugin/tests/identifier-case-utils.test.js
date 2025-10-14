import assert from "node:assert/strict";
import test from "node:test";

import {
    RESERVED_IDENTIFIER_PREFIXES,
    formatIdentifierCase,
    isIdentifierCase,
    normalizeIdentifierCase
} from "../../shared/identifier-case/identifier-case-utils.js";

test("normalisation preserves prefixes and numeric suffixes", () => {
    const normalized = normalizeIdentifierCase("global.hp_max_2");

    assert.equal(normalized.prefix, "global.");
    assert.equal(normalized.suffixSeparator, "_");
    assert.equal(normalized.suffixDigits, "2");
    assert.deepEqual(
        normalized.tokens.map((token) => ({ ...token })),
        [
            { normalized: "hp", type: "word" },
            { normalized: "max", type: "word" }
        ]
    );

    const rebuilt = formatIdentifierCase(normalized, "camel");
    assert.equal(rebuilt, "global.hpMax_2");
});

test("leading and trailing underscores are stable across conversions", () => {
    const source = "__hpMax__";
    const normalized = normalizeIdentifierCase(source);

    assert.equal(normalized.leadingUnderscores, "__");
    assert.equal(normalized.trailingUnderscores, "__");
    const camel = formatIdentifierCase(normalized, "camel");
    assert.equal(camel, source);

    const pascal = formatIdentifierCase(normalized, "pascal");
    assert.equal(pascal.startsWith(normalized.leadingUnderscores), true);
    assert.equal(pascal.endsWith(normalized.trailingUnderscores), true);
    assert.equal(
        pascal.slice(
            normalized.leadingUnderscores.length,
            pascal.length - normalized.trailingUnderscores.length
        ),
        "HpMax"
    );
});

test("mixed alphanumeric identifiers join digits intelligently in snake cases", () => {
    const normalized = normalizeIdentifierCase("hp2DMax");

    assert.equal(formatIdentifierCase(normalized, "camel"), "hp2DMax");
    assert.equal(formatIdentifierCase(normalized, "pascal"), "Hp2DMax");
    assert.equal(formatIdentifierCase(normalized, "snake-lower"), "hp2d_max");
    assert.equal(formatIdentifierCase(normalized, "snake-upper"), "HP2D_MAX");
});

test("reserved prefixes from the reference list remain untouched", () => {
    for (const prefix of RESERVED_IDENTIFIER_PREFIXES) {
        const identifier = `${prefix}exampleValue`;
        const camel = formatIdentifierCase(identifier, "camel");
        assert.equal(camel.startsWith(prefix), true);
    }

    const bracketed = formatIdentifierCase("argument[1].hp_max", "camel");
    assert.equal(bracketed, "argument[1].hpMax");
});

test("idempotence checks report already compliant identifiers", () => {
    assert.equal(isIdentifierCase("hpMax", "camel"), true);
    assert.equal(isIdentifierCase("HpMax", "pascal"), true);
    assert.equal(isIdentifierCase("hp_max", "snake-lower"), true);
    assert.equal(isIdentifierCase("HP_MAX", "snake-upper"), true);

    assert.equal(isIdentifierCase("hp_max", "camel"), false);
});

test("numeric suffixes remain attached regardless of case", () => {
    const normalized = normalizeIdentifierCase("self.hp_value99");

    assert.equal(normalized.prefix, "self.");
    assert.equal(formatIdentifierCase(normalized, "camel"), "self.hpValue99");
    assert.equal(formatIdentifierCase(normalized, "pascal"), "self.HpValue99");
    assert.equal(
        formatIdentifierCase(normalized, "snake-lower"),
        "self.hp_value99"
    );
});
