import assert from "node:assert/strict";
import { test } from "node:test";

import {
    normalizeDocCommentTypeAnnotations,
    restoreDefaultDocCommentTypeNormalizationResolver,
    setDocCommentTypeNormalizationResolver
} from "../src/comments/index.js";

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
        expected: "/// @param {constant.Color} value"
    },
    {
        input: "/// @param {Constant.Colour} value",
        expected: "/// @param {constant.Colour} value"
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

test("normalizes GameMaker doc comment type annotations", () => {
    for (const { input, expected } of NORMALIZATION_CASES) {
        assert.equal(
            normalizeDocCommentTypeAnnotations(input),
            expected,
            `Expected ${input} to normalize to ${expected}`
        );
    }
});

test("doc comment type normalization resolver extends the defaults", () => {
    const guidInput = "/// @returns {Guid} value";
    assert.equal(
        normalizeDocCommentTypeAnnotations(guidInput),
        "/// @returns {Guid} value"
    );

    try {
        setDocCommentTypeNormalizationResolver(() => ({
            synonyms: [
                ["guid", "string"],
                ["vec3", "vector3"]
            ],
            canonicalSpecifierNames: [["resource", "Resource"]],
            specifierPrefixes: ["resource"]
        }));

        assert.equal(
            normalizeDocCommentTypeAnnotations(guidInput),
            "/// @returns {string} value"
        );

        assert.equal(
            normalizeDocCommentTypeAnnotations(
                "/// @param {Resource Sprite} player"
            ),
            "/// @param {Resource.Sprite} player"
        );

        assert.equal(
            normalizeDocCommentTypeAnnotations("/// @param {Vec3} direction"),
            "/// @param {vector3} direction"
        );
    } finally {
        restoreDefaultDocCommentTypeNormalizationResolver();
    }

    assert.equal(
        normalizeDocCommentTypeAnnotations(guidInput),
        "/// @returns {Guid} value"
    );
});
