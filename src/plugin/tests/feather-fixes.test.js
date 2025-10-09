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

    it("wraps standalone numeric literals with return statements and records metadata", () => {
        const sourceWithReturn = [
            "function constant() {",
            "    return 123;",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(sourceWithReturn, {
            getLocations: true,
            simplifyLocations: false
        });

        const program = ast;
        const [functionDeclaration] = program.body ?? [];
        assert.ok(functionDeclaration);

        const block = functionDeclaration.body;
        const [originalReturn] = block.body ?? [];
        assert.ok(originalReturn);

        block.body[0] = {
            type: "ExpressionStatement",
            expression: originalReturn.argument,
            start: { line: 2, index: 26 },
            end: { line: 2, index: 29 }
        };

        const literalSource = [
            "function constant() {",
            "    123;",
            "}"
        ].join("\n");

        applyFeatherFixes(program, { sourceText: literalSource });

        const [updatedStatement] = block.body ?? [];

        assert.ok(updatedStatement);
        assert.strictEqual(updatedStatement.type, "ReturnStatement");
        assert.ok(Array.isArray(updatedStatement._appliedFeatherDiagnostics));
        assert.strictEqual(
            updatedStatement._appliedFeatherDiagnostics.some((entry) => entry.id === "GM1025"),
            true,
            "Expected GM1025 metadata to be recorded on the synthesized return statement."
        );

        assert.ok(Array.isArray(program._appliedFeatherDiagnostics));
        assert.strictEqual(
            program._appliedFeatherDiagnostics.some((entry) => entry.id === "GM1025"),
            true,
            "Expected program-level Feather metadata to include GM1025."
        );
    });

    it("wraps standalone colour literals and preserves literal text in metadata", () => {
        const sourceWithReturn = [
            "function get_colour() {",
            "    return #AEF033;",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(sourceWithReturn, {
            getLocations: true,
            simplifyLocations: false
        });

        const program = ast;
        const [functionDeclaration] = program.body ?? [];
        const block = functionDeclaration.body;
        const [originalReturn] = block.body ?? [];

        block.body[0] = {
            type: "ExpressionStatement",
            expression: originalReturn.argument,
            start: { line: 2, index: 28 },
            end: { line: 2, index: 35 }
        };

        const literalSource = [
            "function get_colour() {",
            "    #AEF033;",
            "}"
        ].join("\n");

        applyFeatherFixes(program, { sourceText: literalSource });

        const [updatedStatement] = block.body ?? [];

        assert.ok(updatedStatement);
        assert.strictEqual(updatedStatement.type, "ReturnStatement");

        const diagnostics = updatedStatement._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            diagnostics.some((entry) => entry.id === "GM1025" && entry.target === "#AEF033"),
            true,
            "Expected GM1025 metadata to capture the colour literal text."
        );
    });
});
