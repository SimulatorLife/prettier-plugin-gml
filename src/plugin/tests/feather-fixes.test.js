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

    it("normalizes self-prefixed local variable references and records metadata", () => {
        const source = [
            "var _condition = false;",
            "",
            "function check(localValue)",
            "{",
            "    var counter = 0;",
            "    if (self.localValue)",
            "    {",
            "        self.localValue = counter + 1;",
            "    }",
            "",
            "    counter = self.counter + self.localValue;",
            "    return self.localValue + counter;",
            "}",
            "",
            "if (self._condition)",
            "{",
            "    self._condition = true;",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const appliedDiagnostics = ast._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(appliedDiagnostics));

        const automaticGm1050Fixes = appliedDiagnostics.filter(
            (entry) => entry.id === "GM1050" && entry.automatic === true
        );

        assert.ok(
            automaticGm1050Fixes.length >= 6,
            "Expected multiple automatic GM1050 fixes to be recorded."
        );

        const unwrap = (expression) =>
            expression?.type === "ParenthesizedExpression" ? expression.expression : expression;

        const programIf = ast.body?.find((node) => node.type === "IfStatement");
        assert.ok(programIf);

        const programCondition = unwrap(programIf.test);
        assert.strictEqual(programCondition?.type, "Identifier");
        assert.strictEqual(programCondition?.name, "_condition");
        assert.strictEqual(programCondition?._appliedFeatherDiagnostics?.[0]?.id, "GM1050");

        const programAssignment = programIf.consequent?.body?.[0];
        assert.ok(programAssignment);
        assert.strictEqual(programAssignment.left?.type, "Identifier");
        assert.strictEqual(programAssignment.left?.name, "_condition");
        assert.strictEqual(
            programAssignment.left?._appliedFeatherDiagnostics?.[0]?.target,
            "_condition"
        );

        const functionDeclaration = ast.body?.find((node) => node.type === "FunctionDeclaration");
        assert.ok(functionDeclaration);

        const functionBody = Array.isArray(functionDeclaration.body?.body)
            ? functionDeclaration.body.body
            : [];
        const functionIf = functionBody.find((node) => node.type === "IfStatement");
        assert.ok(functionIf);

        const functionCondition = unwrap(functionIf.test);
        assert.strictEqual(functionCondition?.type, "Identifier");
        assert.strictEqual(functionCondition?.name, "localValue");
        assert.strictEqual(functionCondition?._appliedFeatherDiagnostics?.[0]?.id, "GM1050");

        const innerAssignment = functionIf.consequent?.body?.[0];
        assert.ok(innerAssignment);
        assert.strictEqual(innerAssignment.left?.type, "Identifier");
        assert.strictEqual(innerAssignment.left?.name, "localValue");

        const subsequentAssignment = functionBody.find(
            (node) => node !== innerAssignment && node.type === "AssignmentExpression"
        );
        assert.ok(subsequentAssignment);

        const assignmentRight = subsequentAssignment.right;
        assert.strictEqual(assignmentRight?.type, "BinaryExpression");
        assert.strictEqual(assignmentRight.left?.type, "Identifier");
        assert.strictEqual(assignmentRight.left?.name, "counter");
        assert.strictEqual(assignmentRight.right?.type, "Identifier");
        assert.strictEqual(assignmentRight.right?.name, "localValue");

        const returnExpression = functionBody.find((node) => node.type === "ReturnStatement");
        assert.ok(returnExpression);
        const returnArgument = returnExpression.argument;
        assert.strictEqual(returnArgument?.type, "BinaryExpression");
        assert.strictEqual(returnArgument.left?.type, "Identifier");
        assert.strictEqual(returnArgument.left?.name, "localValue");
        assert.strictEqual(returnArgument.left?._appliedFeatherDiagnostics?.[0]?.target, "localValue");
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
});
