import assert from "node:assert/strict";
import test from "node:test";

import { Core } from "@gml-modules/core";

const { convertLegacyReturnsDescriptionLinesToMetadata } = Core;

void test("convertLegacyReturnsDescriptionLinesToMetadata ignores non-return descriptions with hyphens", () => {
    const input = [
        "/// @description Base class for all shapes. Shapes can be solid or not solid.",
        "///              Solid shapes will collide with other solid shapes, and",
        "///              non-solid shapes will not collide with anything."
    ];

    const output = convertLegacyReturnsDescriptionLinesToMetadata(input);

    assert.deepStrictEqual(output, input);
});

void test("convertLegacyReturnsDescriptionLinesToMetadata converts valid legacy returns", () => {
    const input = ["/// @function my_func", "/// Returns: real, the result"];

    const expected = [
        "/// @returns {real} The result"
    ];

    const output = convertLegacyReturnsDescriptionLinesToMetadata(input);

    assert.deepStrictEqual(output, expected);
});

void test("convertLegacyReturnsDescriptionLinesToMetadata converts hyphen style returns", () => {
    const input = ["/// @function my_func", "/// real - the result"];

    const expected = [
        "/// @returns {real} The result"
    ];

    const output = convertLegacyReturnsDescriptionLinesToMetadata(input);

    assert.deepStrictEqual(output, expected);
});
