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

    it("moves missing lerp interpolation arguments into nested calls", () => {
        const source = [
            "var clamp_result = clamp(lerp(start_value, end_value), 0.5, 0, 100);",
            "var composite = process_value(lerp(current_value, target_value), weight, fallback);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const lerpCalls = [];
        const visit = (node) => {
            if (!node) {
                return;
            }

            if (Array.isArray(node)) {
                for (const child of node) {
                    visit(child);
                }
                return;
            }

            if (typeof node !== "object") {
                return;
            }

            if (node.type === "CallExpression" && node.object?.name === "lerp") {
                lerpCalls.push(node);
            }

            for (const value of Object.values(node)) {
                if (value && typeof value === "object") {
                    visit(value);
                }
            }
        };

        visit(ast);

        assert.strictEqual(lerpCalls.length, 2, "Expected to locate both lerp call expressions.");

        const [clampLerp, processLerp] = lerpCalls;

        assert.strictEqual(Array.isArray(clampLerp.arguments), true);
        assert.strictEqual(clampLerp.arguments.length, 3);
        assert.strictEqual(clampLerp.arguments[2]?.type, "Literal");
        assert.strictEqual(clampLerp.arguments[2]?.value, "0.5");

        assert.strictEqual(Array.isArray(processLerp.arguments), true);
        assert.strictEqual(processLerp.arguments.length, 3);
        assert.strictEqual(processLerp.arguments[2]?.type, "Identifier");
        assert.strictEqual(processLerp.arguments[2]?.name, "weight");

        const clampDiagnostics = clampLerp._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            clampDiagnostics.some((entry) => entry.id === "GM1020"),
            true,
            "Expected clamp lerp call to record the GM1020 fix metadata."
        );

        const processDiagnostics = processLerp._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            processDiagnostics.some((entry) => entry.id === "GM1020"),
            true,
            "Expected process lerp call to record the GM1020 fix metadata."
        );

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        const appliedIds = new Set(ast._appliedFeatherDiagnostics.map((entry) => entry.id));
        assert.strictEqual(
            appliedIds.has("GM1020"),
            true,
            "Expected program-level metadata to include the GM1020 fix."
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
