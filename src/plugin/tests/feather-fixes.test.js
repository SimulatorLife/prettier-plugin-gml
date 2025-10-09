import assert from "node:assert/strict";

import { describe, it } from "mocha";

import GMLParser from "gamemaker-language-parser";

import { getFeatherMetadata } from "../../shared/feather/metadata.js";
import {
    applyFeatherFixes,
    getFeatherDiagnosticFixers
} from "../src/ast-transforms/apply-feather-fixes.js";

describe("Feather diagnostic fixer registry", () => {
    it("registers a fixer entry for every diagnostic", () => {
        const metadata = getFeatherMetadata();
        const diagnostics = Array.isArray(metadata?.diagnostics) ? metadata.diagnostics : [];
        const registry = getFeatherDiagnosticFixers();

        assert.strictEqual(
            registry.size,
            diagnostics.length,
            "Expected the fixer registry to include every Feather diagnostic."
        );

        for (const diagnostic of diagnostics) {
            assert.ok(
                registry.has(diagnostic.id),
                `Missing fixer entry for Feather diagnostic ${diagnostic.id}.`
            );
        }
    });
});

describe("applyFeatherFixes transform", () => {
    it("removes trailing macro semicolons and records fix metadata", () => {
        const source = [
            "#macro SAMPLE value;",
            "",
            "var data = SAMPLE;"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        const [macro] = ast.body ?? [];
        applyFeatherFixes(ast, { sourceText: source });

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        assert.strictEqual(
            ast._appliedFeatherDiagnostics.some((entry) => entry.id === "GM1051"),
            true,
            "Expected macro fixer metadata to be recorded on the program node."
        );

        assert.ok(macro);
        assert.ok(Array.isArray(macro.tokens));
        assert.strictEqual(macro.tokens.includes(";"), false);
        assert.strictEqual(typeof macro._featherMacroText, "string");
        assert.strictEqual(macro._featherMacroText.trimEnd(), "#macro SAMPLE value");

        const macroFixes = macro._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(macroFixes));
        assert.strictEqual(macroFixes.length, 1);
        assert.strictEqual(macroFixes[0].target, "SAMPLE");
    });

    it("removes trailing macro semicolons before inline comments", () => {
        const source = [
            "#macro SAMPLE value; // comment",
            "",
            "var data = SAMPLE;"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        const [macro] = ast.body ?? [];
        applyFeatherFixes(ast, { sourceText: source });

        assert.ok(macro);
        assert.ok(Array.isArray(macro.tokens));
        assert.strictEqual(macro.tokens.includes(";"), false);
        assert.strictEqual(typeof macro._featherMacroText, "string");
        assert.strictEqual(macro._featherMacroText.trimEnd(), "#macro SAMPLE value // comment");

        const macroFixes = macro._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(macroFixes));
        assert.strictEqual(macroFixes.length, 1);
        assert.strictEqual(macroFixes[0].target, "SAMPLE");
    });

    it("records manual Feather fix metadata for every diagnostic", () => {
        const source = "var value = 1;";

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));

        const recordedIds = new Set(ast._appliedFeatherDiagnostics.map((entry) => entry.id));
        const diagnostics = getFeatherMetadata().diagnostics ?? [];

        assert.strictEqual(
            recordedIds.size,
            diagnostics.length,
            "Expected manual Feather fix metadata to be captured for every diagnostic."
        );

        ["GM2054", "GM2020", "GM1042"].forEach((id) => {
            assert.strictEqual(
                recordedIds.has(id),
                true,
                `Expected manual Feather fix metadata for diagnostic ${id}.`
            );
        });

        for (const entry of ast._appliedFeatherDiagnostics) {
            assert.strictEqual(
                Object.prototype.hasOwnProperty.call(entry, "automatic"),
                true,
                "Each Feather fix entry should indicate whether it was applied automatically."
            );
        }
    });

    it("makes implicit bool casts explicit for known non-bool types", () => {
        const source = [
            "var array_value = [];",
            "var string_value = \"demo\";",
            "var struct_value = { value: 1 };",
            "var function_value = function () {",
            "    return 1;",
            "};",
            "var bool_value = true;",
            "var number_value = 42;",
            "",
            "if (array_value) {",
            "    array_value[0] = 1;",
            "}",
            "",
            "if (string_value) {",
            "    show_debug_message(string_value);",
            "}",
            "",
            "if (struct_value) {",
            "    show_debug_message(struct_value.value);",
            "}",
            "",
            "if (function_value) {",
            "    function_value();",
            "}",
            "",
            "if (bool_value) {",
            "    show_debug_message(bool_value);",
            "}",
            "",
            "if (number_value) {",
            "    show_debug_message(number_value);",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const statements = Array.isArray(ast.body) ? ast.body : [];
        const conditionals = statements.filter((statement) => statement?.type === "IfStatement");
        assert.strictEqual(conditionals.length, 6);
        const [ifArray, ifString, ifStruct, ifFunction, ifBool, ifNumber] = conditionals;

        assertBinaryConditional(ifArray, "array_value");
        assertBinaryConditional(ifString, "string_value");
        assertBinaryConditional(ifStruct, "struct_value");
        assertBinaryConditional(ifFunction, "function_value");

        assertIdentifierConditional(ifBool, "bool_value");
        assertIdentifierConditional(ifNumber, "number_value");

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        const gm1011Fixes = ast._appliedFeatherDiagnostics.filter((entry) => entry.id === "GM1011");
        assert.strictEqual(gm1011Fixes.length >= 4, true);

        function assertBinaryConditional(statement, expectedTarget) {
            assert.ok(statement);
            const test = unwrapTestExpression(statement.test);
            assert.ok(test);
            assert.strictEqual(test.type, "BinaryExpression");
            assert.strictEqual(test.operator, "!=");
            assert.ok(test.left);
            assert.strictEqual(test.left.type, "Identifier");
            assert.strictEqual(test.left.name, expectedTarget);
            assert.ok(test.right);
            assert.strictEqual(test.right.type, "Literal");
            assert.strictEqual(test.right.value, "undefined");

            const fixes = statement._appliedFeatherDiagnostics;
            assert.ok(Array.isArray(fixes));
            assert.strictEqual(fixes.length, 1);
            assert.strictEqual(fixes[0].id, "GM1011");
            assert.strictEqual(fixes[0].target, expectedTarget);
        }

        function assertIdentifierConditional(statement, expectedTarget) {
            assert.ok(statement);
            const test = unwrapTestExpression(statement.test);
            assert.ok(test);
            assert.strictEqual(test.type, "Identifier");
            assert.strictEqual(test.name, expectedTarget);
            assert.strictEqual(statement._appliedFeatherDiagnostics, undefined);
        }

        function unwrapTestExpression(test) {
            if (!test || typeof test !== "object") {
                return null;
            }

            return test.type === "ParenthesizedExpression" ? test.expression : test;
        }
    });
});
