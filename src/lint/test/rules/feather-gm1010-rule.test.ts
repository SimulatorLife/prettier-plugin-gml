import { test } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

import { assertEquals } from "../assertions.js";
import { lintWithFeatherRule } from "./rule-test-harness.js";

void test("gm1010 wraps num* identifiers with real(...) for numeric addition", () => {
    const input = ['numFive = "5";', "result = 5 + numFive;", ""].join("\n");

    const result = lintWithFeatherRule(LintWorkspace.Lint.featherPlugin, "gm1010", input);

    assertEquals(result.output.includes("result = 5 + real(numFive);"), true);
});

void test("gm1010 preserves num* identifiers in string-concatenation chains", () => {
    const input = [
        'numFive = "5";',
        'four = " four ";',
        'five = " five ";',
        "altText = four + five + numFive;",
        ""
    ].join("\n");

    const result = lintWithFeatherRule(LintWorkspace.Lint.featherPlugin, "gm1010", input);

    assertEquals(result.output.includes("altText = four + five + numFive;"), true);
    assertEquals(result.output.includes("altText = four + five + real(numFive);"), false);
});
