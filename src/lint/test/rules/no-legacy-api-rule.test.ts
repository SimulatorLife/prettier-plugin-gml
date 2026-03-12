import assert from "node:assert/strict";
import test from "node:test";

import * as CoreWorkspace from "@gmloop/core";
import * as LintWorkspace from "@gmloop/lint";
import { ESLint, type Linter } from "eslint";

import { clearDeprecatedIdentifierCatalogCache } from "../../src/services/deprecated-identifiers/index.js";
import { assertEquals } from "../assertions.js";
import { lintWithRule } from "./lint-rule-test-harness.js";

function resetDeprecatedMetadataState(): void {
    CoreWorkspace.Core.resetReservedIdentifierMetadataLoader();
    CoreWorkspace.Core.clearIdentifierMetadataCache();
    clearDeprecatedIdentifierCatalogCache();
}

test.afterEach(() => {
    resetDeprecatedMetadataState();
});

function withDeprecatedMetadata(metadata: Record<string, Record<string, unknown>>): void {
    CoreWorkspace.Core.setReservedIdentifierMetadataLoader(() => ({
        identifiers: metadata
    }));
    clearDeprecatedIdentifierCatalogCache();
}

void test("no-legacy-api is registered in the lint plugin and recommended config", () => {
    assert.ok(LintWorkspace.Lint.plugin.rules["no-legacy-api"]);
    assertEquals(LintWorkspace.Lint.configs.recommended[0]?.rules["gml/no-legacy-api"], "warn");
});

void test("no-legacy-api fixes safe direct deprecated function renames", () => {
    withDeprecatedMetadata({
        array_length_2d: {
            type: "function",
            deprecated: true,
            replacement: "array_length",
            replacementKind: "direct-rename",
            legacyUsage: "call",
            diagnosticOwner: "gml"
        }
    });

    const input = ["var count = array_length_2d(items);", ""].join("\n");
    const result = lintWithRule("no-legacy-api", input);

    assertEquals(result.messages.length, 1);
    assertEquals(result.messages[0]?.messageId, "noLegacyApi");
    assertEquals(result.output, ["var count = array_length(items);", ""].join("\n"));
});

void test("no-legacy-api also fixes direct rename replacements that used to be Feather-only", () => {
    withDeprecatedMetadata({
        array_length_1d: {
            type: "function",
            deprecated: true,
            replacement: "array_length",
            replacementKind: "direct-rename",
            legacyUsage: "call",
            diagnosticOwner: "feather"
        },
        array_height_2d: {
            type: "function",
            deprecated: true,
            replacement: "array_height",
            replacementKind: "direct-rename",
            legacyUsage: "call",
            diagnosticOwner: "feather"
        }
    });

    const input = ["var count = array_length_1d(items);", "var height = array_height_2d(items);", ""].join("\n");
    const result = lintWithRule("no-legacy-api", input);

    assertEquals(result.messages.length, 2);
    assertEquals(
        result.output,
        ["var count = array_length(items);", "var height = array_height(items);", ""].join("\n")
    );
});

void test("no-legacy-api fixes safe direct deprecated bare identifier renames", () => {
    withDeprecatedMetadata({
        secure_mode: {
            type: "variable",
            deprecated: true,
            replacement: "security_enabled",
            replacementKind: "direct-rename",
            legacyUsage: "identifier",
            diagnosticOwner: "gml"
        }
    });

    const input = ["if (secure_mode) {", "    show_debug_message(secure_mode);", "}", ""].join("\n");
    const result = lintWithRule("no-legacy-api", input);

    assertEquals(result.messages.length, 2);
    assertEquals(
        result.output,
        ["if (security_enabled) {", "    show_debug_message(security_enabled);", "}", ""].join("\n")
    );
});

void test("no-legacy-api fixes feather-tagged direct bare identifier renames", () => {
    withDeprecatedMetadata({
        os_win32: {
            type: "literal",
            deprecated: true,
            replacement: "os_windows",
            replacementKind: "direct-rename",
            legacyUsage: "identifier",
            diagnosticOwner: "feather"
        }
    });

    const input = ["if (os_type == os_win32) {", "    global.platform = os_win32;", "}", ""].join("\n");
    const result = lintWithRule("no-legacy-api", input);

    assertEquals(result.messages.length, 2);
    assertEquals(
        result.output,
        ["if (os_type == os_windows) {", "    global.platform = os_windows;", "}", ""].join("\n")
    );
});

void test("no-legacy-api reports indexed legacy globals without an unsafe fix", () => {
    withDeprecatedMetadata({
        background_index: {
            type: "variable",
            deprecated: true,
            replacementKind: "manual-migration",
            legacyCategory: "Backgrounds",
            legacyUsage: "indexed-identifier",
            diagnosticOwner: "gml"
        }
    });

    const input = ["background_index[0] = spr_sky;", ""].join("\n");
    const result = lintWithRule("no-legacy-api", input);

    assertEquals(result.messages.length, 1);
    assertEquals(result.output, input);
});

void test("no-legacy-api skips deprecated identifiers shadowed by local declarations", () => {
    withDeprecatedMetadata({
        secure_mode: {
            type: "variable",
            deprecated: true,
            replacement: "security_enabled",
            replacementKind: "direct-rename",
            legacyUsage: "identifier",
            diagnosticOwner: "gml"
        }
    });

    const input = ["var secure_mode = true;", "show_debug_message(secure_mode);", ""].join("\n");
    const result = lintWithRule("no-legacy-api", input);

    assertEquals(result.messages.length, 0);
    assertEquals(result.output, input);
});

void test("no-legacy-api keeps reporting outer-scope deprecated identifiers when an inner function shadows them", () => {
    withDeprecatedMetadata({
        secure_mode: {
            type: "variable",
            deprecated: true,
            replacement: "security_enabled",
            replacementKind: "direct-rename",
            legacyUsage: "identifier",
            diagnosticOwner: "gml"
        }
    });

    const input = [
        "function demo() {",
        "    var secure_mode = true;",
        "    return secure_mode;",
        "}",
        "",
        "if (secure_mode) {",
        "    show_debug_message(secure_mode);",
        "}",
        ""
    ].join("\n");
    const result = lintWithRule("no-legacy-api", input);

    assertEquals(result.messages.length, 2);
    assertEquals(
        result.output,
        [
            "function demo() {",
            "    var secure_mode = true;",
            "    return secure_mode;",
            "}",
            "",
            "if (security_enabled) {",
            "    show_debug_message(security_enabled);",
            "}",
            ""
        ].join("\n")
    );
});

void test("no-legacy-api defers Feather-owned deprecated mappings to avoid duplicate diagnostics", async () => {
    withDeprecatedMetadata({
        array_length_1d: {
            type: "function",
            deprecated: true,
            replacement: "array_length",
            replacementKind: "direct-rename",
            legacyUsage: "call",
            diagnosticOwner: "feather"
        }
    });

    const eslint = new ESLint({
        overrideConfigFile: true,
        fix: true,
        overrideConfig: [
            {
                files: ["**/*.gml"],
                plugins: {
                    gml: LintWorkspace.Lint.plugin,
                    feather: LintWorkspace.Lint.featherPlugin
                },
                language: "gml/gml",
                rules: {
                    "gml/no-legacy-api": "error" satisfies Linter.RuleEntry,
                    "feather/gm1054": "error" satisfies Linter.RuleEntry
                }
            }
        ]
    });

    const [result] = await eslint.lintText("var count = array_length_1d(items);\n", {
        filePath: "deprecated-overlap.gml"
    });

    assertEquals(result.messages.length, 0);
    assertEquals(result.output, "var count = array_length(items);\n");
});
