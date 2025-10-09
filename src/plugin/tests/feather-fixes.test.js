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

    it("deduplicates local variables flagged by GM2044 and records metadata", () => {
        const source = [
            "function demo() {",
            "    var total = 1;",
            "    var total = 2;",
            "    var count;",
            "    var count;",
            "    if (true) {",
            "        var temp = 0;",
            "        var temp = 1;",
            "    }",
            "}",
            ""
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const functionNode = ast.body?.[0];
        assert.ok(functionNode?.type === "FunctionDeclaration");

        const statements = functionNode?.body?.body ?? [];
        assert.strictEqual(statements.length, 4);

        const totalDeclaration = statements[0];
        assert.ok(totalDeclaration?.type === "VariableDeclaration");
        assert.strictEqual(totalDeclaration.declarations?.[0]?.id?.name, "total");

        const totalAssignment = statements[1];
        assert.ok(totalAssignment?.type === "AssignmentExpression");
        assert.strictEqual(totalAssignment.left?.name, "total");

        const countDeclarations = statements.filter(
            (node) => node?.type === "VariableDeclaration" && node.declarations?.[0]?.id?.name === "count"
        );
        assert.strictEqual(countDeclarations.length, 1);

        const ifStatement = statements[3];
        assert.strictEqual(ifStatement?.type, "IfStatement");

        const innerStatements = ifStatement?.consequent?.body ?? [];
        assert.strictEqual(innerStatements.length, 2);

        const innerAssignment = innerStatements[1];
        assert.ok(innerAssignment?.type === "AssignmentExpression");
        assert.strictEqual(innerAssignment.left?.name, "temp");

        const programDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2044Entries = programDiagnostics.filter((entry) => entry.id === "GM2044");

        assert.ok(gm2044Entries.length >= 2, "Expected GM2044 metadata to be recorded at the program level.");
        assert.strictEqual(gm2044Entries.every((entry) => entry.automatic === true), true);

        const assignmentDiagnostics = innerAssignment._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            assignmentDiagnostics.some((entry) => entry.id === "GM2044"),
            true,
            "Expected inserted assignment to record GM2044 metadata."
        );
    });
});
