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

    it("corrects GM1021 typoed function calls using metadata guidance", () => {
        const source = [
            "function make_game(_genre) { /* ... */ }",
            "",
            'make_gaem("RPG");',
            "",
            "var _x = clam(x, 0, 100);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const typoCall = ast.body?.find((node) => node?.type === "CallExpression");
        const variableDeclaration = ast.body?.find((node) => node?.type === "VariableDeclaration");
        const clampCall = variableDeclaration?.declarations?.[0]?.init;

        assert.ok(typoCall);
        assert.strictEqual(typoCall.type, "CallExpression");
        assert.strictEqual(typoCall.object?.name, "make_game");

        assert.ok(clampCall);
        assert.strictEqual(clampCall.type, "CallExpression");
        assert.strictEqual(clampCall.object?.name, "clamp");

        const typoFixes = typoCall._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(typoFixes));
        assert.strictEqual(typoFixes.length, 1);
        assert.strictEqual(typoFixes[0].id, "GM1021");
        assert.strictEqual(typoFixes[0].target, "make_gaem");
        assert.strictEqual(typoFixes[0].replacement, "make_game");
        assert.strictEqual(typeof typoFixes[0].automatic, "boolean");
        assert.strictEqual(typoFixes[0].automatic, true);
        assert.ok(typoFixes[0].range);
        assert.strictEqual(typeof typoFixes[0].range.start, "number");
        assert.strictEqual(typeof typoFixes[0].range.end, "number");

        const clampFixes = clampCall._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(clampFixes));
        assert.strictEqual(clampFixes.length, 1);
        assert.strictEqual(clampFixes[0].id, "GM1021");
        assert.strictEqual(clampFixes[0].target, "clam");
        assert.strictEqual(clampFixes[0].replacement, "clamp");
        assert.strictEqual(clampFixes[0].automatic, true);

        const appliedFixes = ast._appliedFeatherDiagnostics ?? [];
        const gm1021Entries = appliedFixes.filter((entry) => entry?.id === "GM1021");

        assert.strictEqual(gm1021Entries.length >= 2, true);
        gm1021Entries.forEach((entry) => {
            assert.strictEqual(entry.automatic, true);
        });
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
