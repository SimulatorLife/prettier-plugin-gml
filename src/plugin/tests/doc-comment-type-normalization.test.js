import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeDocCommentTypeAnnotations } from "../src/comments/index.js";

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
        input: "/// @param {Constant Color} value",
        expected: "/// @param {Constant.Color} value"
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
