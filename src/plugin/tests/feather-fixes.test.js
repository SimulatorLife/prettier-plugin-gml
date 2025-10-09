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

    it("normalizes GM1009 operations and captures fix metadata", () => {
        const source = [
            "var _attribs = fa_readonly + fa_archive;",
            "var next_room = room + 1;",
            "var previous_room = room - 1;",
            "room_goto(room + 1);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [attribDecl, nextDecl, previousDecl, gotoStatement] = ast.body ?? [];

        const attribInit = attribDecl?.declarations?.[0]?.init;
        assert.ok(attribInit);
        assert.strictEqual(attribInit.operator, "|");
        assert.ok(Array.isArray(attribInit._appliedFeatherDiagnostics));
        assert.strictEqual(attribInit._appliedFeatherDiagnostics[0]?.id, "GM1009");

        const nextInit = nextDecl?.declarations?.[0]?.init;
        assert.ok(nextInit);
        assert.strictEqual(nextInit.type, "CallExpression");
        assert.strictEqual(nextInit.object?.name, "room_next");
        assert.deepStrictEqual(nextInit.arguments?.map((argument) => argument?.name), ["room"]);
        assert.ok(Array.isArray(nextInit._appliedFeatherDiagnostics));
        assert.strictEqual(nextInit._appliedFeatherDiagnostics[0]?.id, "GM1009");

        const previousInit = previousDecl?.declarations?.[0]?.init;
        assert.ok(previousInit);
        assert.strictEqual(previousInit.type, "CallExpression");
        assert.strictEqual(previousInit.object?.name, "room_previous");
        assert.deepStrictEqual(previousInit.arguments?.map((argument) => argument?.name), ["room"]);
        assert.ok(Array.isArray(previousInit._appliedFeatherDiagnostics));
        assert.strictEqual(previousInit._appliedFeatherDiagnostics[0]?.id, "GM1009");

        const gotoExpression = gotoStatement;
        assert.ok(gotoExpression);
        assert.strictEqual(gotoExpression.type, "CallExpression");
        assert.strictEqual(gotoExpression.object?.name, "room_goto_next");
        assert.deepStrictEqual(gotoExpression.arguments, []);
        assert.ok(Array.isArray(gotoExpression._appliedFeatherDiagnostics));
        assert.strictEqual(gotoExpression._appliedFeatherDiagnostics[0]?.id, "GM1009");

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        assert.strictEqual(
            ast._appliedFeatherDiagnostics.some((entry) => entry.id === "GM1009"),
            true,
            "Expected GM1009 fix metadata to be captured on the program node."
        );
    });
});
