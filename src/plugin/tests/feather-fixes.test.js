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

    it("promotes local variables used within with(other) scopes", () => {
        const source = [
            "var atk = 1;",
            "",
            "with (other)",
            "{",
            "    hp -= atk;",
            "    apply_damage(atk);",
            "}",
            "",
            "with (other)",
            "{",
            "    apply_damage(atk);",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [promotedAssignment, firstWith, secondWith] = ast.body ?? [];

        assert.ok(promotedAssignment);
        assert.strictEqual(promotedAssignment.type, "AssignmentExpression");
        assert.strictEqual(promotedAssignment.operator, "=");
        assert.strictEqual(promotedAssignment.left?.name, "atk");

        const firstBody = firstWith?.body?.body ?? [];
        const [damageExpression, damageCall] = firstBody;

        assert.ok(damageExpression);
        assert.strictEqual(damageExpression.type, "AssignmentExpression");
        assert.strictEqual(damageExpression.right?.type, "MemberDotExpression");
        assert.strictEqual(damageExpression.right?.object?.name, "other");
        assert.strictEqual(damageExpression.right?.property?.name, "atk");

        assert.ok(damageCall);
        const firstCallArgument = damageCall.arguments?.[0];
        assert.strictEqual(firstCallArgument?.type, "MemberDotExpression");
        assert.strictEqual(firstCallArgument?.object?.name, "other");
        assert.strictEqual(firstCallArgument?.property?.name, "atk");

        const secondBody = secondWith?.body?.body ?? [];
        const [secondCall] = secondBody;
        const secondCallArgument = secondCall?.arguments?.[0];
        assert.strictEqual(secondCallArgument?.type, "MemberDotExpression");
        assert.strictEqual(secondCallArgument?.object?.name, "other");
        assert.strictEqual(secondCallArgument?.property?.name, "atk");

        const assignmentFixes = promotedAssignment?._appliedFeatherDiagnostics ?? [];
        assert.ok(
            assignmentFixes.some((entry) => entry.id === "GM1013" && entry.automatic === true),
            "Expected promoted assignment to record GM1013 metadata."
        );

        const memberFixes = damageExpression.right?._appliedFeatherDiagnostics ?? [];
        assert.ok(
            memberFixes.some((entry) => entry.id === "GM1013" && entry.automatic === true),
            "Expected member access to record GM1013 metadata."
        );

        const programFixes = ast._appliedFeatherDiagnostics ?? [];
        const automaticGm1013 = programFixes.filter(
            (entry) => entry.id === "GM1013" && entry.automatic === true
        );

        assert.ok(
            automaticGm1013.length >= 3,
            "Expected program metadata to include automatic GM1013 fixes."
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
