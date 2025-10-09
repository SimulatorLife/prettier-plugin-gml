import assert from "node:assert/strict";

import { describe, it } from "mocha";

import GMLParser from "gamemaker-language-parser";

import { getFeatherMetadata } from "../src/feather/metadata.js";
import {
    applyFeatherFixes,
    getFeatherDiagnosticFixers,
    preprocessSourceForFeatherFixes
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

    it("renames duplicate function parameters and records fix metadata", () => {
        const source = [
            "function example(value, other, value, value) {",
            "    return value + other;",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [fn] = ast.body ?? [];
        assert.ok(fn);
        const params = Array.isArray(fn.params) ? fn.params : [];
        assert.strictEqual(params.length, 4);

        const extractName = (param) => {
            if (!param) {
                return null;
            }

            if (param.type === "Identifier") {
                return param.name;
            }

            if (param.type === "DefaultParameter" && param.left?.type === "Identifier") {
                return param.left.name;
            }

            return null;
        };

        const parameterNames = params.map(extractName);
        assert.deepStrictEqual(parameterNames, ["value", "other", "value_2", "value_3"]);

        const renamedParams = [params[2], params[3]];

        for (const param of renamedParams) {
            assert.ok(param);
            const identifier = param.type === "Identifier" ? param : param.left;
            const metadata = identifier?._appliedFeatherDiagnostics;
            assert.ok(Array.isArray(metadata));
            assert.strictEqual(metadata.length, 1);
            assert.strictEqual(metadata[0].id, "GM1059");
            assert.strictEqual(metadata[0].target, "value");
            assert.strictEqual(metadata[0].automatic, true);
        }

        const rootMetadata = ast._appliedFeatherDiagnostics ?? [];
        const gm1059Metadata = rootMetadata.filter((entry) => entry.id === "GM1059");
        assert.strictEqual(gm1059Metadata.length, 2);
        gm1059Metadata.forEach((entry) => {
            assert.strictEqual(entry.target, "value");
            assert.strictEqual(entry.automatic, true);
        });
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

    it("resets texture repeat flagged by GM2056 and records metadata", () => {
        const source = [
            "gpu_set_texrepeat(true);",
            "",
            "vertex_submit(vb_world, pr_trianglelist, tex);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [setRepeatCall, resetCall, submitCall] = ast.body ?? [];

        assert.ok(setRepeatCall);
        assert.ok(resetCall);
        assert.ok(submitCall);
        assert.strictEqual(resetCall.type, "CallExpression");
        assert.strictEqual(resetCall.object?.name, "gpu_set_texrepeat");

        const args = Array.isArray(resetCall.arguments) ? resetCall.arguments : [];
        assert.strictEqual(args.length > 0, true);
        assert.strictEqual(args[0]?.type, "Literal");
        assert.strictEqual(args[0]?.value, "false");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2056 = appliedDiagnostics.find((entry) => entry.id === "GM2056");

        assert.ok(gm2056, "Expected GM2056 metadata to be recorded on the AST.");
        assert.strictEqual(gm2056.automatic, true);
        assert.strictEqual(gm2056.target, "gpu_set_texrepeat");
        assert.ok(gm2056.range);

        const resetMetadata = resetCall._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            resetMetadata.some((entry) => entry.id === "GM2056"),
            true,
            "Expected GM2056 metadata to be recorded on the inserted reset call."
        );
    });

    it("re-enables blending flagged by GM2048 and records metadata", () => {
        const source = [
            "gpu_set_blendenable(false);",
            "",
            "draw_self();"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [disableCall, enableCall, drawCall] = ast.body ?? [];

        assert.ok(disableCall);
        assert.ok(enableCall);
        assert.ok(drawCall);
        assert.strictEqual(enableCall.type, "CallExpression");
        assert.strictEqual(enableCall.object?.name, "gpu_set_blendenable");

        const args = Array.isArray(enableCall.arguments) ? enableCall.arguments : [];
        assert.strictEqual(args.length > 0, true);
        assert.strictEqual(args[0]?.type, "Literal");
        assert.strictEqual(args[0]?.value, "true");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2048 = appliedDiagnostics.find((entry) => entry.id === "GM2048");

        assert.ok(gm2048, "Expected GM2048 metadata to be recorded on the AST.");
        assert.strictEqual(gm2048.automatic, true);
        assert.strictEqual(gm2048.target, "gpu_set_blendenable");
        assert.ok(gm2048.range);

        const enableMetadata = enableCall._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            enableMetadata.some((entry) => entry.id === "GM2048"),
            true,
            "Expected GM2048 metadata to be recorded on the inserted re-enable call."
        );
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

    it("normalizes simple syntax errors flagged by GM1100 and records metadata", () => {
        const source = [
            "var _this * something;",
            "",
            "    = 48;"
        ].join("\n");

        const { sourceText, metadata } = preprocessSourceForFeatherFixes(source);

        assert.notStrictEqual(sourceText, source, "Expected GM1100 preprocessor to modify the source text.");
        assert.ok(metadata?.GM1100?.length > 0, "Expected GM1100 metadata to be recorded by the preprocessor.");

        const ast = GMLParser.parse(sourceText, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, {
            sourceText,
            preprocessedFixMetadata: metadata
        });

        const statements = (ast.body ?? []).filter((node) => node?.type !== "EmptyStatement");
        const [declaration, statement] = statements;

        assert.ok(declaration);
        assert.strictEqual(declaration.type, "VariableDeclaration");
        assert.strictEqual(Array.isArray(declaration.declarations), true);
        assert.ok(statement);

        const declarationFixes = declaration._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(declarationFixes.some((entry) => entry.id === "GM1100"), true);

        const expressionFixes = (statement?._appliedFeatherDiagnostics ?? [])
            .concat(statement?.expression?._appliedFeatherDiagnostics ?? []);
        assert.strictEqual(expressionFixes.some((entry) => entry.id === "GM1100"), true);

        const programDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm1100Entries = programDiagnostics.filter((entry) => entry.id === "GM1100");

        assert.ok(gm1100Entries.length >= 1, "Expected GM1100 metadata to be recorded on the program node.");

        for (const entry of gm1100Entries) {
            assert.strictEqual(entry.automatic, true);
            assert.strictEqual(entry.title, "Syntax Error");
            assert.strictEqual(entry.description?.includes("syntax error"), true);
        }
    });
  
    it("removes stray boolean literal statements flagged by GM1016 and records metadata", () => {
        const topLevelLiteral = {
            type: "ExpressionStatement",
            expression: {
                type: "Literal",
                value: "true",
                start: { index: 0 },
                end: { index: 3 }
            },
            start: { index: 0 },
            end: { index: 4 }
        };

        const nestedLiteral = {
            type: "ExpressionStatement",
            expression: {
                type: "Literal",
                value: "false",
                start: { index: 18 },
                end: { index: 22 }
            },
            start: { index: 18 },
            end: { index: 24 }
        };

        const ast = {
            type: "Program",
            body: [
                topLevelLiteral,
                {
                    type: "IfStatement",
                    test: {
                        type: "Literal",
                        value: "true",
                        start: { index: 10 },
                        end: { index: 13 }
                    },
                    consequent: {
                        type: "BlockStatement",
                        body: [nestedLiteral],
                        start: { index: 16 },
                        end: { index: 25 }
                    },
                    alternate: null,
                    start: { index: 6 },
                    end: { index: 25 }
                }
            ],
            start: { index: 0 },
            end: { index: 25 }
        };

        applyFeatherFixes(ast, { sourceText: "true;\nif (true) { false; }" });

        assert.strictEqual(ast.body.length, 1, "Expected stray boolean literal to be removed from the program body.");

        const [ifStatement] = ast.body;
        assert.ok(ifStatement);
        assert.strictEqual(
            Array.isArray(ifStatement.consequent?.body) ? ifStatement.consequent.body.length : -1,
            0,
            "Expected stray boolean literal to be removed from block statements."
        );

        const rootDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const rootGM1016 = rootDiagnostics.filter((entry) => entry.id === "GM1016");
        assert.strictEqual(rootGM1016.length, 2, "Expected GM1016 metadata to be recorded for each removed statement.");

        const blockDiagnostics = ifStatement.consequent?._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            blockDiagnostics.some((entry) => entry.id === "GM1016"),
            true,
            "Expected GM1016 metadata to be attached to the containing block."
        );

        for (const entry of rootGM1016) {
            assert.strictEqual(entry.automatic, true, "GM1016 fixes should be marked as automatic.");
            assert.ok(entry.range, "GM1016 fixes should capture the removed node's range.");
        }
    });
});
