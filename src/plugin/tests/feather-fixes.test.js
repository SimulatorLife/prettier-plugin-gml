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

    it("normalizes argument built-ins flagged by GM1032", () => {
        const metadata = getFeatherMetadata();
        const diagnostic = (metadata?.diagnostics ?? []).find((entry) => entry?.id === "GM1032");

        assert.ok(diagnostic, "Expected GM1032 diagnostic metadata to be available.");

        const source = [
            "function sample() {",
            "    var first = argument1;",
            "    var second = argument3;",
            "    return argument3 + argument4;",
            "}",
            ""
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        const trackedIdentifiers = [];

        const collectArgumentIdentifiers = (node) => {
            if (!node) {
                return;
            }

            if (Array.isArray(node)) {
                for (const child of node) {
                    collectArgumentIdentifiers(child);
                }
                return;
            }

            if (typeof node !== "object") {
                return;
            }

            if (node.type === "Identifier" && typeof node.name === "string" && /^argument\d+$/.test(node.name)) {
                trackedIdentifiers.push({ node, originalName: node.name });
            }

            for (const value of Object.values(node)) {
                if (value && typeof value === "object") {
                    collectArgumentIdentifiers(value);
                }
            }
        };

        collectArgumentIdentifiers(ast);

        applyFeatherFixes(ast, { sourceText: source });

        const changedIdentifiers = trackedIdentifiers.filter((entry) => entry.node.name !== entry.originalName);

        assert.strictEqual(changedIdentifiers.length > 0, true, "Expected some argument built-ins to be renamed.");

        const changedNames = changedIdentifiers.map((entry) => entry.node.name).sort();
        const expectedNames = ["argument0", "argument1", "argument1", "argument2"].sort();

        assert.deepStrictEqual(
            changedNames,
            expectedNames,
            "Argument built-ins should be reindexed without gaps starting from argument0."
        );

        for (const entry of changedIdentifiers) {
            const metadataEntries = entry.node._appliedFeatherDiagnostics;

            assert.ok(Array.isArray(metadataEntries), "Each rewritten argument identifier should include metadata.");
            assert.strictEqual(metadataEntries.length > 0, true);

            const [fixDetail] = metadataEntries;

            assert.strictEqual(fixDetail.id, "GM1032");
            assert.strictEqual(fixDetail.target, entry.node.name);
            assert.strictEqual(fixDetail.title, diagnostic.title);
            assert.strictEqual(fixDetail.correction, diagnostic.correction);
            assert.strictEqual(fixDetail.description, diagnostic.description);
            assert.strictEqual(fixDetail.automatic, true);
        }

        const applied = ast._appliedFeatherDiagnostics ?? [];
        assert.ok(applied.some((entry) => entry.id === "GM1032"));
    });
});
