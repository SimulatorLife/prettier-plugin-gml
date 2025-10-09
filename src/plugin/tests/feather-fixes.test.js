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

    it("normalizes mixed argument references for GM1040 and records fix metadata", () => {
        const source = [
            "function demo()",
            "{",
            "    var first = argument0;",
            "    var second = argument[1];",
            "    argument2 = argument1 + argument[3];",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const fn = ast.body?.[0];
        assert.ok(fn && fn.type === "FunctionDeclaration");

        const statements = Array.isArray(fn.body?.body) ? fn.body.body : [];
        assert.strictEqual(statements.length, 3);

        const firstDeclaration = statements[0]?.declarations?.[0];
        assert.ok(firstDeclaration);
        const firstInit = firstDeclaration.init;
        assert.ok(firstInit);
        assert.strictEqual(firstInit.type, "MemberIndexExpression");
        assert.strictEqual(firstInit.property?.[0]?.value, "0");

        const assignment = statements[2];
        assert.ok(assignment && assignment.type === "AssignmentExpression");
        assert.strictEqual(assignment.left?.type, "MemberIndexExpression");
        assert.strictEqual(assignment.left?.property?.[0]?.value, "2");

        const rightLeft = assignment.right?.left;
        assert.ok(rightLeft);
        assert.strictEqual(rightLeft.type, "MemberIndexExpression");
        assert.strictEqual(rightLeft.property?.[0]?.value, "1");

        const appliedAtFunction = fn.body.body.flatMap((node) =>
            Array.isArray(node?._appliedFeatherDiagnostics) ? node._appliedFeatherDiagnostics : []
        );

        for (const node of [firstInit, assignment.left, rightLeft]) {
            const metadata = node?._appliedFeatherDiagnostics;
            assert.ok(Array.isArray(metadata));
            assert.ok(metadata.some((entry) => entry.id === "GM1040"));
        }

        const gm1040Fixes = ast._appliedFeatherDiagnostics?.filter((entry) => entry.id === "GM1040") ?? [];
        assert.strictEqual(gm1040Fixes.length >= 3, true);

        assert.strictEqual(
            gm1040Fixes.every((entry) => entry.automatic === true),
            true,
            "Expected GM1040 fixes to be marked as automatic."
        );

        assert.ok(appliedAtFunction.every((entry) => entry.id !== undefined));
    });
});
