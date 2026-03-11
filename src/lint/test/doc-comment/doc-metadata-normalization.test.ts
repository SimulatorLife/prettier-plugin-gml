import test from "node:test";

import { Core } from "@gml-modules/core";

import { assertEquals } from "../assertions.js";

const { getCanonicalParamNameFromText, normalizeDocMetadataName } = Core;

void test("normalizeDocMetadataName preserves valid optional tokens", () => {
    assertEquals(normalizeDocMetadataName("[value]"), "[value]");
});

void test("normalizeDocMetadataName strips synthetic sentinels", () => {
    assertEquals(normalizeDocMetadataName("__value__"), "value");
    assertEquals(normalizeDocMetadataName("$$value$$"), "value");
});

void test("getCanonicalParamNameFromText unwraps optional tokens and defaults", () => {
    assertEquals(getCanonicalParamNameFromText("[value]")?.includes("["), false);
    assertEquals(getCanonicalParamNameFromText("[value=10]"), "value");
});
