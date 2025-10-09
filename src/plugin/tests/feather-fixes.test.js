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

    it("replaces read-only built-in assignments with local variables", () => {
        const source = [
            "function demo() {",
            "    working_directory = @\"PlayerData\";",
            "    var first = file_find_first(working_directory + @\"/Screenshots/*.png\", fa_archive);",
            "    return working_directory;",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [functionDeclaration] = ast.body ?? [];
        assert.ok(functionDeclaration);

        const blockBody = functionDeclaration.body?.body ?? [];
        assert.ok(Array.isArray(blockBody));
        assert.strictEqual(blockBody.length, 3);

        const [replacementDeclaration, callDeclaration, returnStatement] = blockBody;

        assert.ok(replacementDeclaration);
        assert.strictEqual(replacementDeclaration.type, "VariableDeclaration");

        const replacementDeclarator = replacementDeclaration.declarations?.[0];
        assert.ok(replacementDeclarator);
        const replacementName = replacementDeclarator.id?.name;
        assert.strictEqual(typeof replacementName, "string");
        assert.ok(replacementName.startsWith("__feather_working_directory"));

        const callInit = callDeclaration?.declarations?.[0]?.init;
        assert.ok(callInit);
        assert.strictEqual(callInit.type, "CallExpression");

        const firstArgument = callInit.arguments?.[0];
        assert.ok(firstArgument);
        assert.strictEqual(firstArgument.type, "BinaryExpression");
        assert.strictEqual(firstArgument.left?.type, "Identifier");
        assert.strictEqual(firstArgument.left.name, replacementName);

        assert.ok(returnStatement);
        assert.strictEqual(returnStatement.type, "ReturnStatement");
        assert.strictEqual(returnStatement.argument?.type, "Identifier");
        assert.strictEqual(returnStatement.argument.name, replacementName);

        const statementFixes = replacementDeclaration._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(statementFixes));
        assert.strictEqual(statementFixes.length, 1);
        assert.strictEqual(statementFixes[0].id, "GM1008");
        assert.strictEqual(statementFixes[0].target, "working_directory");
        assert.strictEqual(statementFixes[0].automatic, true);

        const rootFixes = ast._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            rootFixes.some((entry) => entry.id === "GM1008"),
            true,
            "Expected program metadata to include the GM1008 fix."
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
