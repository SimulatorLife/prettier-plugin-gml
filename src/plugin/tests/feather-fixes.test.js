import assert from "node:assert/strict";

import { describe, it } from "mocha";

import GMLParser from "gamemaker-language-parser";

import { getFeatherMetadata } from "../../shared/feather/metadata.js";
import {
    applyFeatherFixes,
    getFeatherDiagnosticFixers,
    preprocessSourceTextForFeatherFixes
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

    it("removes standalone identifier statements flagged by GM1022", () => {
        const source = [
            "username;",
            "",
            "global.score; // inline access",
            "",
            "var player_name = get_string(\"Name?\", \"guest\");"
        ].join("\n");

        const preprocess = preprocessSourceTextForFeatherFixes(source);

        assert.ok(preprocess);
        assert.notStrictEqual(
            preprocess.text,
            source,
            "Expected preprocess step to adjust source text for GM1022 violations."
        );
        assert.ok(Array.isArray(preprocess.appliedFixes));
        assert.strictEqual(preprocess.appliedFixes.length, 2);
        assert.ok(preprocess.skipManualFixIds instanceof Set);
        assert.strictEqual(preprocess.skipManualFixIds.has("GM1022"), true);

        const ast = GMLParser.parse(preprocess.text, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, {
            sourceText: preprocess.text,
            preAppliedFixes: preprocess.appliedFixes,
            skipManualFixIds: preprocess.skipManualFixIds
        });

        const remainingIdentifiers = (ast.body ?? []).filter((node) => node?.type === "Identifier");
        assert.strictEqual(
            remainingIdentifiers.length,
            0,
            "Expected GM1022 fixer to remove dangling identifier statements."
        );

        const recordedFixes = ast._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(recordedFixes));

        const gm1022Fixes = recordedFixes.filter((entry) => entry.id === "GM1022");
        assert.strictEqual(gm1022Fixes.length, 2);
        assert.deepStrictEqual(
            new Set(gm1022Fixes.map((entry) => entry.target)),
            new Set(["username", "global.score"])
        );
        gm1022Fixes.forEach((entry) => {
            assert.strictEqual(entry.automatic, true);
            assert.ok(entry.range);
        });
    });
});
