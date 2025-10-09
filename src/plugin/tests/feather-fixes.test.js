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

    it("normalizes multidimensional array indexing and records metadata", () => {
        const source = [
            "function fetch_value(_grid, _row, _column, _depth)",
            "{",
            "    var primary = _grid[_row, _column];",
            "    var tertiary = _grid[_row, _column, _depth];",
            "    return primary + tertiary;",
            "}",
            "",
            "var nested = matrix[0, 1, 2, 3];"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const functionDeclaration = ast.body?.[0];
        assert.ok(functionDeclaration?.body?.body);

        const [primaryDeclaration, tertiaryDeclaration, returnStatement] =
            functionDeclaration.body.body;

        const primaryInit = primaryDeclaration?.declarations?.[0]?.init;
        const tertiaryInit = tertiaryDeclaration?.declarations?.[0]?.init;

        assert.strictEqual(primaryInit?.type, "MemberIndexExpression");
        assert.strictEqual(primaryInit?.property?.length, 1);
        assert.strictEqual(primaryInit?.object?.type, "MemberIndexExpression");
        assert.strictEqual(primaryInit.object.property?.length, 1);
        assert.ok(Array.isArray(primaryInit._appliedFeatherDiagnostics));

        assert.strictEqual(tertiaryInit?.type, "MemberIndexExpression");
        assert.strictEqual(tertiaryInit?.property?.length, 1);
        assert.strictEqual(tertiaryInit?.object?.type, "MemberIndexExpression");
        assert.strictEqual(tertiaryInit.object.property?.length, 1);
        assert.strictEqual(tertiaryInit.object?.object?.type, "MemberIndexExpression");
        assert.ok(Array.isArray(tertiaryInit._appliedFeatherDiagnostics));

        const globalDeclaration = ast.body?.[1]?.declarations?.[0];
        const nestedInit = globalDeclaration?.init;

        assert.strictEqual(nestedInit?.type, "MemberIndexExpression");
        assert.strictEqual(nestedInit?.property?.length, 1);
        assert.strictEqual(nestedInit?.object?.type, "MemberIndexExpression");
        assert.strictEqual(nestedInit?.object?.property?.length, 1);
        assert.strictEqual(nestedInit?.object?.object?.type, "MemberIndexExpression");
        assert.strictEqual(nestedInit?.object?.object?.object?.type, "MemberIndexExpression");
        assert.ok(Array.isArray(nestedInit._appliedFeatherDiagnostics));

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        const normalizedFixes = ast._appliedFeatherDiagnostics.filter(
            (entry) => entry.id === "GM1036"
        );
        assert.strictEqual(normalizedFixes.length >= 3, true);

        for (const entry of normalizedFixes) {
            assert.strictEqual(entry.automatic, true);
        }

        assert.ok(returnStatement);
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
