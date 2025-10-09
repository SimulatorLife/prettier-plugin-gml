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

    it("splits inline globalvar initializers into assignments", () => {
        const declarationSource = "globalvar gameManager;";
        const initializerSource = "gameManager = new GameManager();";

        const ast = GMLParser.parse(declarationSource, {
            getLocations: true,
            simplifyLocations: false
        });

        const initializerAst = GMLParser.parse(initializerSource, {
            getLocations: true,
            simplifyLocations: false
        });

        const globalVar = ast.body?.[0];
        const initializerExpression = initializerAst.body?.[0]?.right ?? null;

        assert.ok(globalVar, "Expected to parse a globalvar declaration.");
        assert.ok(initializerExpression, "Expected to parse the initializer expression.");

        const [declarator] = globalVar.declarations ?? [];
        assert.ok(declarator, "Expected the globalvar statement to expose a declarator.");

        declarator.init = initializerExpression;
        declarator.end = initializerExpression?.end ?? declarator.end;

        applyFeatherFixes(ast, {
            sourceText: `${declarationSource}\n${initializerSource}`
        });

        assert.strictEqual(declarator.init, null, "Expected the declarator initializer to be cleared.");
        assert.ok(Array.isArray(ast.body));
        assert.strictEqual(ast.body.length, 2, "Expected the initializer to be emitted as a separate assignment.");

        const assignment = ast.body[1];
        assert.ok(assignment);
        assert.strictEqual(assignment.type, "AssignmentExpression");
        assert.strictEqual(assignment.operator, "=");
        assert.strictEqual(assignment.left?.type, "Identifier");
        assert.strictEqual(assignment.left?.name, "gameManager");
        assert.strictEqual(assignment.right, initializerExpression);

        const assignmentFixes = assignment._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(assignmentFixes));
        assert.strictEqual(assignmentFixes.length, 1);
        assert.strictEqual(assignmentFixes[0].id, "GM1002");
        assert.strictEqual(assignmentFixes[0].target, "gameManager");

        const globalVarFixes = globalVar._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(globalVarFixes));
        assert.strictEqual(
            globalVarFixes.some((entry) => entry.id === "GM1002"),
            true,
            "Expected the globalvar statement to record the GM1002 fix."
        );

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        assert.strictEqual(
            ast._appliedFeatherDiagnostics.some((entry) => entry.id === "GM1002"),
            true,
            "Expected GM1002 metadata to be recorded on the program node."
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
