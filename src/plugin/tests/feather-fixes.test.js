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

    it("renames reserved identifiers and records fix metadata", () => {
        const source = [
            "#macro image_index 1",
            "",
            "var image_index = 1;",
            "static draw_text = 2;"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [macro, varDeclaration, staticDeclaration] = ast.body ?? [];

        assert.ok(macro?.name);
        assert.strictEqual(macro.name.name, "_image_index");
        assert.strictEqual(macro._featherMacroText?.trimEnd(), "#macro _image_index 1");
        assert.ok(Array.isArray(macro.name._appliedFeatherDiagnostics));
        assert.strictEqual(macro.name._appliedFeatherDiagnostics[0].id, "GM1030");
        assert.strictEqual(macro.name._appliedFeatherDiagnostics[0].target, "image_index");

        const varDeclarator = varDeclaration?.declarations?.[0];
        assert.ok(varDeclarator?.id);
        assert.strictEqual(varDeclarator.id.name, "_image_index");
        assert.ok(Array.isArray(varDeclarator.id._appliedFeatherDiagnostics));
        assert.strictEqual(varDeclarator.id._appliedFeatherDiagnostics[0].id, "GM1030");
        assert.strictEqual(varDeclarator.id._appliedFeatherDiagnostics[0].target, "image_index");

        const staticDeclarator = staticDeclaration?.declarations?.[0];
        assert.ok(staticDeclarator?.id);
        assert.strictEqual(staticDeclarator.id.name, "_draw_text");
        assert.ok(Array.isArray(staticDeclarator.id._appliedFeatherDiagnostics));
        assert.strictEqual(staticDeclarator.id._appliedFeatherDiagnostics[0].id, "GM1030");
        assert.strictEqual(staticDeclarator.id._appliedFeatherDiagnostics[0].target, "draw_text");

        const appliedFixes = ast._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            appliedFixes.some((entry) => entry.id === "GM1030"),
            true,
            "Expected GM1030 fix metadata to be attached to the program node."
        );
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
