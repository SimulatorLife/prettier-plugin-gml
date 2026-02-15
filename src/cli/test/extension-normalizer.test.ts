import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

import { normalizeExtensions } from "../src/cli-core/extension-normalizer.js";

void test("normalizeExtensions splits strings on commas and path delimiters", () => {
    const input = ["scripts/*.gml,.YY", `.OBJ${path.delimiter}rooms/*.gml`].join(path.delimiter);

    const result = normalizeExtensions(input);

    assert.deepStrictEqual(result, [".gml", ".yy", ".obj"]);
});

void test("normalizeExtensions accepts iterables and removes duplicates", () => {
    const result = normalizeExtensions(new Set([".YY", "objects/*.yy", ".gml"]));

    assert.deepStrictEqual(result, [".yy", ".gml"]);
});

void test("normalizeExtensions falls back when no valid fragments remain", () => {
    const fallback = [".gml"];

    const result = normalizeExtensions(null, fallback);

    assert.deepStrictEqual(result, fallback);
});
