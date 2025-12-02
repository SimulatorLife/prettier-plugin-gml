import assert from "node:assert/strict";
import { test } from "node:test";
import { Core } from "@gml-modules/core";

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
            Core.normalizeDocCommentTypeAnnotations(input),
            expected,
            `Expected ${input} to normalize to ${expected}`
        );
    }
});

void test("doc comment type normalization resolver extends the defaults", () => {
    const guidInput = "/// @returns {Guid} value";
    assert.equal(
        Core.normalizeDocCommentTypeAnnotations(guidInput),
        "/// @returns {Guid} value"
    );

    try {
        Core.setDocCommentTypeNormalizationResolver(() => ({
            synonyms: [
                ["guid", "string"],
                ["vec3", "vector3"]
            ],
            canonicalSpecifierNames: [["resource", "Resource"]],
            specifierPrefixes: ["resource"]
        }));

        assert.equal(
            Core.normalizeDocCommentTypeAnnotations(guidInput),
            "/// @returns {string} value"
        );

        assert.equal(
            Core.normalizeDocCommentTypeAnnotations(
                "/// @param {Resource Sprite} player"
            ),
            "/// @param {Resource.Sprite} player"
        );

        assert.equal(
            Core.normalizeDocCommentTypeAnnotations(
                "/// @param {Vec3} direction"
            ),
            "/// @param {vector3} direction"
        );
    } finally {
        Core.restoreDefaultDocCommentTypeNormalizationResolver();
    }

    assert.equal(
        Core.normalizeDocCommentTypeAnnotations(guidInput),
        "/// @returns {Guid} value"
    );
});

void test("doc comment normalization accepts entry-capable collaborators", () => {
    const synonymsEntries = {
        entries() {
            const values = [["Custom", "custom-normalized"]];
            return values[Symbol.iterator]();
        }
    };
    const canonicalEntries = {
        entries() {
            const values = [["Custom", "CustomCanonical"]];
            return values[Symbol.iterator]();
        }
    };
    const prefixIterable = {
        *[Symbol.iterator]() {
            yield "Custom";
        }
    };

    try {
        Core.setDocCommentTypeNormalizationResolver(() => ({
            synonyms: synonymsEntries,
            canonicalSpecifierNames: canonicalEntries,
            specifierPrefixes: prefixIterable
        }));

        const normalization = Core.resolveDocCommentTypeNormalization();
        assert.equal(
            normalization.lookupTypeIdentifier("Custom"),
            "custom-normalized"
        );
        assert.equal(
            normalization.getCanonicalSpecifierName("Custom"),
            "CustomCanonical"
        );
        assert.equal(normalization.hasSpecifierPrefix("Custom"), true);
    } finally {
        Core.restoreDefaultDocCommentTypeNormalizationResolver();
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
        Core.setDocCommentTypeNormalizationResolver(() => ({
            synonyms: synonymsEntries
        }));

        const normalization = Core.resolveDocCommentTypeNormalization();
        assert.equal(
            normalization.lookupTypeIdentifier("Keyed"),
            "value-normalized"
        );
        assert.equal(
            normalization.lookupTypeIdentifier("Indexed"),
            "indexed-normalized"
        );
        assert.equal(normalization.lookupTypeIdentifier("MissingValue"), null);
        assert.equal(normalization.lookupTypeIdentifier("not-a-pair"), null);
    } finally {
        Core.restoreDefaultDocCommentTypeNormalizationResolver();
    }
});
