import { test } from "node:test";

import * as LintWorkspace from "@gml-modules/lint";

import { assertEquals } from "../assertions.js";
import { lintWithFeatherRule } from "./rule-test-harness.js";

void test("gm1008 rewrites working_directory assignment into a local declaration", () => {
    const input = [
        "function demo() {",
        '    working_directory = @"PlayerData";',
        '    var first = file_find_first(working_directory + @"/Screenshots/*.png", fa_archive);',
        '    var second = working_directory + "/Manual";',
        "    return working_directory;",
        "}",
        ""
    ].join("\n");

    const result = lintWithFeatherRule(LintWorkspace.Lint.featherPlugin, "gm1008", input);

    assertEquals(result.output.includes("var __feather_working_directory ="), true);
    assertEquals(result.output.includes("\n    __feather_working_directory ="), false);
    assertEquals(/\bworking_directory\b/u.test(result.output), false);
});

void test("gm1008 preserves existing var declarations while renaming references", () => {
    const input = [
        "function demo() {",
        '    var working_directory = @"PlayerData";',
        '    working_directory = working_directory + "/Manual";',
        "    return working_directory;",
        "}",
        ""
    ].join("\n");

    const result = lintWithFeatherRule(LintWorkspace.Lint.featherPlugin, "gm1008", input);
    const expected = [
        "function demo() {",
        '    var __feather_working_directory = @"PlayerData";',
        '    __feather_working_directory = __feather_working_directory + "/Manual";',
        "    return __feather_working_directory;",
        "}",
        ""
    ].join("\n");

    assertEquals(result.output, expected);
    assertEquals(result.output.includes("var var"), false);
});
