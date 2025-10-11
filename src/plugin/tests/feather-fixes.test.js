import assert from "node:assert/strict";

import { describe, it } from "node:test";

import GMLParser from "gamemaker-language-parser";

import {
    getFeatherMetadata,
    getFeatherDiagnosticById
} from "../../shared/feather/metadata.js";
import {
    applyFeatherFixes,
    getFeatherDiagnosticFixers,
    preprocessSourceForFeatherFixes
} from "../src/ast-transforms/apply-feather-fixes.js";

describe("Feather diagnostic fixer registry", () => {
    it("registers a fixer entry for every diagnostic", () => {
        const metadata = getFeatherMetadata();
        const diagnostics = Array.isArray(metadata?.diagnostics)
            ? metadata.diagnostics
            : [];
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
        const source = ["#macro SAMPLE value;", "", "var data = SAMPLE;"].join(
            "\n"
        );

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
        assert.strictEqual(
            macro._featherMacroText.trimEnd(),
            "#macro SAMPLE value"
        );

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
        assert.strictEqual(
            macro._featherMacroText.trimEnd(),
            "#macro SAMPLE value // comment"
        );

        const macroFixes = macro._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(macroFixes));
        assert.strictEqual(macroFixes.length, 1);
        assert.strictEqual(macroFixes[0].target, "SAMPLE");
    });

    it("marks constructor declarations for functions instantiated with new", () => {
        const source = [
            "function item() {",
            "    return 42;",
            "}",
            "",
            "var sword = new item();"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        const [functionNode] = ast.body ?? [];

        assert.ok(functionNode);
        assert.strictEqual(functionNode.type, "FunctionDeclaration");

        applyFeatherFixes(ast, { sourceText: source });

        assert.strictEqual(functionNode.type, "ConstructorDeclaration");

        const functionFixes = functionNode._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(functionFixes));
        assert.strictEqual(
            functionFixes.some((entry) => entry.id === "GM1058"),
            true
        );
        assert.strictEqual(
            functionFixes.some((entry) => entry.target === "item"),
            true,
            "Expected constructor fix metadata to target the function name."
        );

        const recordedIds = ast._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            recordedIds.some((entry) => entry.id === "GM1058"),
            true,
            "Expected the program node to record the GM1058 constructor fix."
        );
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

            if (
                param.type === "DefaultParameter" &&
        param.left?.type === "Identifier"
            ) {
                return param.left.name;
            }

            return null;
        };

        const parameterNames = params.map(extractName);
        assert.deepStrictEqual(parameterNames, [
            "value",
            "other",
            "value_2",
            "value_3"
        ]);

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
        const gm1059Metadata = rootMetadata.filter(
            (entry) => entry.id === "GM1059"
        );
        assert.strictEqual(gm1059Metadata.length, 2);
        gm1059Metadata.forEach((entry) => {
            assert.strictEqual(entry.target, "value");
            assert.strictEqual(entry.automatic, true);
        });
    });

    it("respects the configurable duplicate parameter suffix start", () => {
        const source = [
            "function example(value, other, value, value) {",
            "    return value + other;",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, {
            sourceText: source,
            options: { featherDuplicateParameterSuffixStart: 7 }
        });

        const [fn] = ast.body ?? [];
        assert.ok(fn);
        const params = Array.isArray(fn.params) ? fn.params : [];
        assert.strictEqual(params.length, 4);

        const names = params.map((param) => {
            if (!param) {
                return null;
            }

            if (param.type === "Identifier") {
                return param.name;
            }

            if (param.type === "DefaultParameter") {
                return param.left?.name ?? null;
            }

            return null;
        });

        assert.deepStrictEqual(names, ["value", "other", "value_7", "value_8"]);

        const renamed = [params[2], params[3]];
        renamed.forEach((param) => {
            const identifier = param?.type === "Identifier" ? param : param?.left;
            assert.ok(identifier);
            const metadata = identifier._appliedFeatherDiagnostics ?? [];
            assert.strictEqual(
                metadata.some((entry) => entry.id === "GM1059"),
                true
            );
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

        const recordedIds = new Set(
            ast._appliedFeatherDiagnostics.map((entry) => entry.id)
        );
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

    it("normalizes missing constructor parent clauses and records fix metadata", () => {
        const source = [
            "function Base() {",
            "    self.value = 1;",
            "}",
            "",
            "function Child() : Base() constructor {",
            "    constructor_apply();",
            "}",
            "",
            "function Orphan() : Missing() constructor {",
            "    constructor_apply();",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        const [baseFunction, childConstructor, orphanConstructor] = ast.body ?? [];

        applyFeatherFixes(ast, { sourceText: source });

        assert.ok(baseFunction);
        assert.strictEqual(baseFunction.type, "ConstructorDeclaration");
        assert.strictEqual(baseFunction.parent, null);

        const baseFixes = baseFunction._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(baseFixes));
        assert.strictEqual(baseFixes.length > 0, true);
        assert.strictEqual(baseFixes.some((entry) => entry.id === "GM1054"), true);

        assert.ok(childConstructor);
        assert.ok(childConstructor.parent);
        assert.strictEqual(childConstructor.parent.id, "Base");

        assert.ok(orphanConstructor);
        assert.strictEqual(orphanConstructor.parent, null);

        const orphanFixes = orphanConstructor._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(orphanFixes));
        assert.strictEqual(orphanFixes.length > 0, true);
        assert.strictEqual(orphanFixes[0].id, "GM1054");
        assert.strictEqual(orphanFixes[0].target, "Missing");

        const recordedIds = new Set(
            ast._appliedFeatherDiagnostics?.map((entry) => entry.id)
        );
        assert.strictEqual(recordedIds.has("GM1054"), true);
    });

    it("reorders optional parameters after required ones and records fix metadata", () => {
        const source = [
            "function example(a, b = 1, c, d = 2) {",
            "    return a + b + c + d;",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [fn] = ast.body ?? [];
        assert.ok(fn);

        const parameterNames = Array.isArray(fn.params)
            ? fn.params.map((param) => {
                if (param?.type === "DefaultParameter") {
                    return param.left?.name ?? null;
                }

                return param?.name ?? null;
            })
            : [];

        assert.deepStrictEqual(parameterNames, ["a", "c", "b", "d"]);

        const defaultParameters = fn.params.filter(
            (param) => param?.type === "DefaultParameter"
        );
        assert.strictEqual(defaultParameters.length, 2);
        assert.strictEqual(defaultParameters[0].left?.name, "b");
        assert.strictEqual(defaultParameters[1].left?.name, "d");

        assert.ok(Array.isArray(fn._appliedFeatherDiagnostics));
        assert.strictEqual(fn._appliedFeatherDiagnostics.length, 1);
        assert.strictEqual(fn._appliedFeatherDiagnostics[0].id, "GM1056");
        assert.strictEqual(fn._appliedFeatherDiagnostics[0].target, "example");

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        assert.strictEqual(
            ast._appliedFeatherDiagnostics.some((entry) => entry.id === "GM1056"),
            true,
            "Expected GM1056 metadata to be recorded on the program node."
        );
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
            "draw_text(0, 0, \"Hello!\");"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [disableCall, resetCall, drawCall] = ast.body ?? [];

        assert.ok(disableCall);
        assert.ok(resetCall);
        assert.ok(drawCall);
        assert.strictEqual(resetCall.type, "CallExpression");
        assert.strictEqual(resetCall.object?.name, "gpu_set_blendenable");

        const args = Array.isArray(resetCall.arguments) ? resetCall.arguments : [];
        assert.strictEqual(args.length > 0, true);
        assert.strictEqual(args[0]?.type, "Literal");
        assert.strictEqual(args[0]?.value, "true");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2048 = appliedDiagnostics.find((entry) => entry.id === "GM2048");

        assert.ok(gm2048, "Expected GM2048 metadata to be recorded on the AST.");
        assert.strictEqual(gm2048.automatic, true);
        assert.strictEqual(gm2048.target, "gpu_set_blendenable");
        assert.ok(gm2048.range);

        const resetMetadata = resetCall._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            resetMetadata.some((entry) => entry.id === "GM2048"),
            true,
            "Expected GM2048 metadata to be recorded on the inserted reset call."
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
        assert.strictEqual(
            assignment.right.alternate.type === "UnaryExpression",
            true
        );

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
        assert.strictEqual(
            ternaryDiagnostics.some((entry) => entry.id === "GM1063"),
            true
        );
    });

    it("normalizes simple syntax errors flagged by GM1100 and records metadata", () => {
        const source = ["var _this * something;", "", "    = 48;"].join("\n");

        const { sourceText, metadata } = preprocessSourceForFeatherFixes(source);

        assert.notStrictEqual(
            sourceText,
            source,
            "Expected GM1100 preprocessor to modify the source text."
        );
        assert.ok(
            metadata?.GM1100?.length > 0,
            "Expected GM1100 metadata to be recorded by the preprocessor."
        );

        const ast = GMLParser.parse(sourceText, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, {
            sourceText,
            preprocessedFixMetadata: metadata
        });

        const statements = (ast.body ?? []).filter(
            (node) => node?.type !== "EmptyStatement"
        );
        const [declaration, statement] = statements;

        assert.ok(declaration);
        assert.strictEqual(declaration.type, "VariableDeclaration");
        assert.strictEqual(Array.isArray(declaration.declarations), true);
        assert.ok(statement);

        const declarationFixes = declaration._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            declarationFixes.some((entry) => entry.id === "GM1100"),
            true
        );

        const expressionFixes = (
            statement?._appliedFeatherDiagnostics ?? []
        ).concat(statement?.expression?._appliedFeatherDiagnostics ?? []);
        assert.strictEqual(
            expressionFixes.some((entry) => entry.id === "GM1100"),
            true
        );

        const programDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm1100Entries = programDiagnostics.filter(
            (entry) => entry.id === "GM1100"
        );

        assert.ok(
            gm1100Entries.length >= 1,
            "Expected GM1100 metadata to be recorded on the program node."
        );

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

        assert.strictEqual(
            ast.body.length,
            1,
            "Expected stray boolean literal to be removed from the program body."
        );

        const [ifStatement] = ast.body;
        assert.ok(ifStatement);
        assert.strictEqual(
            Array.isArray(ifStatement.consequent?.body)
                ? ifStatement.consequent.body.length
                : -1,
            0,
            "Expected stray boolean literal to be removed from block statements."
        );

        const rootDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const rootGM1016 = rootDiagnostics.filter((entry) => entry.id === "GM1016");
        assert.strictEqual(
            rootGM1016.length,
            2,
            "Expected GM1016 metadata to be recorded for each removed statement."
        );

        const blockDiagnostics =
      ifStatement.consequent?._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            blockDiagnostics.some((entry) => entry.id === "GM1016"),
            true,
            "Expected GM1016 metadata to be attached to the containing block."
        );

        for (const entry of rootGM1016) {
            assert.strictEqual(
                entry.automatic,
                true,
                "GM1016 fixes should be marked as automatic."
            );
            assert.ok(
                entry.range,
                "GM1016 fixes should capture the removed node's range."
            );
        }
    });

    it("preprocesses stray boolean literal statements flagged by GM1016", () => {
        const source = [
            "/// Feather GM1016 sample",
            "true;",
            "if (condition) {",
            "    false;",
            "    value = 1;",
            "}",
            ""
        ].join("\n");

        const { sourceText, metadata } = preprocessSourceForFeatherFixes(source);

        assert.notStrictEqual(
            sourceText,
            source,
            "Expected GM1016 preprocessor to remove boolean literal statements."
        );

        assert.ok(
            metadata?.GM1016?.length === 2,
            "Expected GM1016 metadata entries for each removed statement."
        );

        const ast = GMLParser.parse(sourceText, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, {
            sourceText,
            preprocessedFixMetadata: metadata
        });

        const statements = ast.body ?? [];

        assert.strictEqual(
            statements.length,
            1,
            "Expected only the conditional statement to remain at the top level."
        );

        const [ifStatement] = statements;
        assert.ok(ifStatement?.type === "IfStatement");

        const blockBody = ifStatement?.consequent?.body ?? [];

        assert.strictEqual(
            blockBody.length,
            1,
            "Expected nested boolean literal statements to be removed."
        );

        const rootDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm1016Fixes = rootDiagnostics.filter(
            (entry) => entry.id === "GM1016"
        );

        assert.strictEqual(
            gm1016Fixes.length,
            2,
            "Expected GM1016 metadata to be recorded for each removed literal."
        );

        for (const fix of gm1016Fixes) {
            assert.strictEqual(fix.automatic, true);
            assert.ok(fix.range);
        }

        const blockDiagnostics =
      ifStatement.consequent?._appliedFeatherDiagnostics ?? [];

        assert.strictEqual(
            blockDiagnostics.some((entry) => entry.id === "GM1016"),
            true,
            "Expected GM1016 metadata to be attached to the containing block."
        );
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
            (node) =>
                node?.type === "VariableDeclaration" &&
        node.declarations?.[0]?.id?.name === "count"
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
        const gm2044Entries = programDiagnostics.filter(
            (entry) => entry.id === "GM2044"
        );

        assert.ok(
            gm2044Entries.length >= 2,
            "Expected GM2044 metadata to be recorded at the program level."
        );
        assert.strictEqual(
            gm2044Entries.every((entry) => entry.automatic === true),
            true
        );

        const assignmentDiagnostics =
      innerAssignment._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            assignmentDiagnostics.some((entry) => entry.id === "GM2044"),
            true,
            "Expected inserted assignment to record GM2044 metadata."
        );
    });

    it("records metadata for GM2064 flagged struct properties", () => {
        const source = [
            "/// Create Event",
            "",
            "ins_companion = instance_create_layer(x, y, layer, obj_companion, {",
            "    intro_message: message",
            "});"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const assignment = ast.body?.[0];
        assert.ok(assignment);
        const callExpression = assignment.right;
        assert.ok(callExpression);
        const structArgument = callExpression.arguments?.[4];
        assert.ok(structArgument);
        const [property] = structArgument.properties ?? [];
        assert.ok(property);

        const propertyMetadata = property._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(propertyMetadata.length, 1);

        const [metadata] = propertyMetadata;
        assert.strictEqual(metadata.id, "GM2064");
        assert.strictEqual(metadata.target, "message");
        assert.strictEqual(metadata.automatic, false);

        const expectedMetadata = getFeatherDiagnosticById("GM2064");
        assert.ok(expectedMetadata);
        assert.strictEqual(metadata.title, expectedMetadata.title);
        assert.strictEqual(metadata.description, expectedMetadata.description);
        assert.strictEqual(metadata.correction, expectedMetadata.correction);

        const recordedFixes = ast._appliedFeatherDiagnostics ?? [];
        const gm2064Fixes = recordedFixes.filter((entry) => entry.id === "GM2064");
        assert.strictEqual(gm2064Fixes.length, 1);
        assert.strictEqual(gm2064Fixes[0].target, "message");
        assert.strictEqual(gm2064Fixes[0].automatic, false);
    });

    it("inserts a file_find_close call before nested file_find_first invocations flagged by GM2031", () => {
        const source = [
            "var _look_for_description = true;",
            "",
            "var _file = file_find_first(\"/game_data/*.bin\", fa_none);",
            "",
            "if (_look_for_description)",
            "{",
            "    _file2 = file_find_first(\"/game_data/*.json\", fa_none);",
            "}",
            "",
            "file_find_close();"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            appliedDiagnostics.some((entry) => entry.id === "GM2031"),
            true,
            "Expected GM2031 metadata to be recorded on the AST."
        );

        const ifStatement = ast.body?.find((node) => node?.type === "IfStatement");
        assert.ok(ifStatement, "Expected an if statement in the parsed AST.");

        const consequentBody = ifStatement?.consequent?.body ?? [];
        assert.strictEqual(consequentBody.length, 2);

        const [firstStatement, secondStatement] = consequentBody;
        assert.strictEqual(firstStatement?.type, "CallExpression");
        assert.strictEqual(firstStatement?.object?.name, "file_find_close");

        const closeDiagnostics = firstStatement?._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            closeDiagnostics.some((entry) => entry.id === "GM2031"),
            true,
            "Expected GM2031 metadata on the inserted file_find_close call."
        );

        assert.strictEqual(secondStatement?.type, "AssignmentExpression");
        assert.strictEqual(secondStatement?.right?.type, "CallExpression");
        assert.strictEqual(secondStatement?.right?.object?.name, "file_find_first");
    });

    it("hoists multiple call arguments flagged by GM2023 and records metadata", () => {
        const source =
            "vertex_position_3d(vb, buffer_read(buff, buffer_f32), buffer_read(buff, buffer_f32), buffer_read(buff, buffer_f32));";

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const body = Array.isArray(ast.body) ? ast.body : [];

        assert.strictEqual(body.length >= 4, true, "Expected temporaries to be hoisted before the call expression.");

        for (let index = 0; index < 3; index += 1) {
            const declaration = body[index];
            assert.ok(declaration);
            assert.strictEqual(declaration.type, "VariableDeclaration");

            const declarators = Array.isArray(declaration.declarations) ? declaration.declarations : [];
            assert.strictEqual(declarators.length, 1);

            const [declarator] = declarators;
            assert.strictEqual(declarator?.id?.type, "Identifier");
            assert.strictEqual(declarator?.id?.name, `__feather_call_arg_${index}`);
            assert.strictEqual(declarator?.init?.type, "CallExpression");

            const declarationDiagnostics = declaration._appliedFeatherDiagnostics ?? [];
            assert.strictEqual(
                declarationDiagnostics.some((entry) => entry.id === "GM2023"),
                true,
                "Expected GM2023 metadata on each hoisted declaration."
            );
        }

        const callStatement = body[body.length - 1];
        assert.ok(callStatement);
        assert.strictEqual(callStatement.type, "CallExpression");

        const args = Array.isArray(callStatement.arguments) ? callStatement.arguments : [];
        assert.strictEqual(args.length, 4);
        assert.strictEqual(args[0]?.type, "Identifier");
        assert.strictEqual(args[0]?.name, "vb");
        assert.strictEqual(args[1]?.name, "__feather_call_arg_0");
        assert.strictEqual(args[2]?.name, "__feather_call_arg_1");
        assert.strictEqual(args[3]?.name, "__feather_call_arg_2");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2023 = appliedDiagnostics.find((entry) => entry.id === "GM2023");

        assert.ok(gm2023, "Expected GM2023 metadata to be recorded on the AST.");
        assert.strictEqual(gm2023.automatic, true);
        assert.strictEqual(gm2023.target, "vertex_position_3d");

        const callDiagnostics = callStatement._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            callDiagnostics.some((entry) => entry.id === "GM2023"),
            true,
            "Expected GM2023 metadata on the transformed call expression."
        );
    });
});
