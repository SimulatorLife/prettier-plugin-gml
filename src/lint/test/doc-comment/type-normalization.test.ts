import assert from "node:assert/strict";
import { test } from "node:test";

import { Lint } from "../../src/index.js";

const NORMALIZATION_CASES = [
    {
        input: "/// @param {String Array[String]} value",
        expected: "/// @param {string,array[string]} value"
    },
    {
        input: "/// @param {string|Array[String]} value",
        expected: "/// @param {string,array[string]} value"
    },
    {
        input: "/// @param {Id Instance} value",
        expected: "/// @param {Id.Instance} value"
    },
    {
        input: "/// @param {Asset GMObject} value",
        expected: "/// @param {Asset.GMObject} value"
    },
    {
        input: "/// @param {Asset.GMSprite} value",
        expected: "/// @param {Asset.GMSprite} value"
    },
    {
        input: "/// @param {Constant Color} value",
        expected: "/// @param {Constant.Color} value"
    },
    {
        input: "/// @param {Constant.Colour} value",
        expected: "/// @param {Constant.Colour} value"
    },
    {
        input: "/// @param {Struct Weapon} value",
        expected: "/// @param {Struct.Weapon} value"
    },
    {
        input: "/// @param {array [ string ]} value",
        expected: "/// @param {array[string]} value"
    }
];

void test("normalizes GameMaker doc comment type annotations", () => {
    for (const { input, expected } of NORMALIZATION_CASES) {
        assert.equal(
            Lint.normalizeDocCommentTypeAnnotations(input),
            expected,
            `Expected ${input} to normalize to ${expected}`
        );
    }
});

void test("applies JSDoc alias replacements without type normalization", () => {
    assert.equal(Lint.applyJsDocTagAliasReplacements("/// @desc Example"), "/// @description Example");
    assert.equal(Lint.applyJsDocTagAliasReplacements("/// @arg value"), "/// @param value");
    assert.equal(Lint.applyJsDocTagAliasReplacements("/// @params value"), "/// @param value");
    assert.equal(
        Lint.applyJsDocTagAliasReplacements("/// @return {Boolean} should stay cased"),
        "/// @returns {Boolean} should stay cased"
    );
});

void test("JSDoc alias replacement passthrough keeps non-string inputs unchanged", () => {
    const marker = Object.freeze({ key: "value" });
    assert.equal(Lint.applyJsDocTagAliasReplacements(marker), marker);
});

void test("doc comment type normalization resolver extends the defaults", () => {
    const guidInput = "/// @returns {Guid} value";
    assert.equal(Lint.normalizeDocCommentTypeAnnotations(guidInput), "/// @returns {Guid} value");

    try {
        Lint.setDocCommentTypeNormalizationResolver(() => ({
            synonyms: [
                ["guid", "string"],
                ["vec3", "vector3"]
            ],
            specifierPrefixes: ["resource"]
        }));

        assert.equal(Lint.normalizeDocCommentTypeAnnotations(guidInput), "/// @returns {string} value");

        assert.equal(
            Lint.normalizeDocCommentTypeAnnotations("/// @param {Resource Sprite} player"),
            "/// @param {Resource.Sprite} player"
        );

        assert.equal(
            Lint.normalizeDocCommentTypeAnnotations("/// @param {Vec3} direction"),
            "/// @param {vector3} direction"
        );
    } finally {
        Lint.restoreDefaultDocCommentTypeNormalizationResolver();
    }

    assert.equal(Lint.normalizeDocCommentTypeAnnotations(guidInput), "/// @returns {Guid} value");
});

void test("doc comment normalization accepts entry-capable collaborators", () => {
    const synonymsEntries = {
        entries() {
            const values = [["Custom", "custom-normalized"]];
            return values[Symbol.iterator]();
        }
    };
    const prefixIterable = {
        *[Symbol.iterator]() {
            yield "Custom";
        }
    };
    try {
        Lint.setDocCommentTypeNormalizationResolver(() => ({
            synonyms: synonymsEntries,
            specifierPrefixes: prefixIterable
        }));

        const normalization = Lint.resolveDocCommentTypeNormalization();
        assert.equal(normalization.lookupTypeIdentifier("Custom"), "custom-normalized");
        assert.equal(normalization.getCanonicalSpecifierName("Custom"), "Custom");
        assert.equal(normalization.hasSpecifierPrefix("Custom"), true);
    } finally {
        Lint.restoreDefaultDocCommentTypeNormalizationResolver();
    }
});

void test("doc comment normalization ignores invalid entry shapes", () => {
    const synonymsEntries = {
        entries() {
            return (function* () {
                yield "not-a-pair";
                yield { key: "Keyed", value: "value-normalized" };
                yield { 0: "Indexed", 1: "indexed-normalized" };
                yield { key: "MissingValue" };
            })();
        }
    };

    try {
        Lint.setDocCommentTypeNormalizationResolver(() => ({
            synonyms: synonymsEntries
        }));

        const normalization = Lint.resolveDocCommentTypeNormalization();
        assert.equal(normalization.lookupTypeIdentifier("Keyed"), "value-normalized");
        assert.equal(normalization.lookupTypeIdentifier("Indexed"), "indexed-normalized");
        assert.equal(normalization.lookupTypeIdentifier("MissingValue"), null);
        assert.equal(normalization.lookupTypeIdentifier("not-a-pair"), null);
    } finally {
        Lint.restoreDefaultDocCommentTypeNormalizationResolver();
    }
});
