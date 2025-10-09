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

    it("harmonizes texture ternaries flagged by GM1063 and records metadata", () => {
        const source = [
            "/// Create Event",
            "",
            "tex = (texture_defined) ? sprite_get_texture(sprite_index, 0) : -1;",
            "",
            "/// Draw Event",
            "",
            "vertex_submit(vb, pr_trianglelist, tex);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        const [assignment] = ast.body ?? [];
        assert.ok(assignment?.right?.type === "TernaryExpression");
        assert.strictEqual(assignment.right.alternate.type === "UnaryExpression", true);

        applyFeatherFixes(ast, { sourceText: source });

        const fixedTernary = assignment?.right;
        assert.ok(fixedTernary);
        assert.strictEqual(fixedTernary.alternate?.type, "Identifier");
        assert.strictEqual(fixedTernary.alternate?.name, "pointer_null");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm1063 = appliedDiagnostics.find((entry) => entry.id === "GM1063");

        assert.ok(gm1063, "Expected GM1063 metadata to be recorded on the AST.");
        assert.strictEqual(gm1063.automatic, true);
        assert.strictEqual(gm1063.target, "tex");
        assert.ok(gm1063.range);

        const ternaryDiagnostics = fixedTernary._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(ternaryDiagnostics.some((entry) => entry.id === "GM1063"), true);
    });

    it("wraps pure function calls flagged by GM2022 and records metadata", () => {
        const source = [
            "variable_get_hash(\"member\");",
            "",
            "choose(\"a\", \"b\", \"c\");",
            "",
            "choose(\"d\", \"e\", \"f\");",
            "",
            "if (flag) make_colour_rgb(255, 255, 0);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [first, second, third, fourth] = ast.body ?? [];

        assert.strictEqual(first?.type, "VariableDeclaration");
        assert.strictEqual(second?.type, "VariableDeclaration");
        assert.strictEqual(third?.type, "VariableDeclaration");
        assert.strictEqual(fourth?.type, "IfStatement");

        const firstDeclarator = first?.declarations?.[0];
        const secondDeclarator = second?.declarations?.[0];
        const thirdDeclarator = third?.declarations?.[0];
        const fourthConsequent = fourth?.consequent;

        assert.strictEqual(firstDeclarator?.id?.name, "__feather_variable_get_hash_result_1");
        assert.strictEqual(secondDeclarator?.id?.name, "__feather_choose_result_1");
        assert.strictEqual(thirdDeclarator?.id?.name, "__feather_choose_result_2");

        assert.strictEqual(fourthConsequent?.type, "VariableDeclaration");
        const fourthDeclarator = fourthConsequent?.declarations?.[0];
        assert.strictEqual(fourthDeclarator?.id?.name, "__feather_make_colour_rgb_result_1");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2022Diagnostics = appliedDiagnostics.filter((entry) => entry.id === "GM2022");
        assert.strictEqual(gm2022Diagnostics.length, 4);

        const firstDiagnostics = first?._appliedFeatherDiagnostics ?? [];
        const secondDiagnostics = second?._appliedFeatherDiagnostics ?? [];
        const thirdDiagnostics = third?._appliedFeatherDiagnostics ?? [];
        const fourthDiagnostics = fourthConsequent?._appliedFeatherDiagnostics ?? [];

        assert.strictEqual(firstDiagnostics.some((entry) => entry.target === "variable_get_hash"), true);
        assert.strictEqual(secondDiagnostics.some((entry) => entry.target === "choose"), true);
        assert.strictEqual(thirdDiagnostics.some((entry) => entry.target === "choose"), true);
        assert.strictEqual(fourthDiagnostics.some((entry) => entry.target === "make_colour_rgb"), true);
    });
});
