import assert from "node:assert/strict";

import { describe, it } from "node:test";

import GMLParser from "gamemaker-language-parser";

import {
    getNodeEndIndex,
    getNodeStartIndex
} from "../../shared/ast-locations.js";

import {
    getFeatherMetadata,
    getFeatherDiagnosticById
} from "../src/feather/metadata.js";
import {
    applyFeatherFixes,
    getFeatherDiagnosticFixers,
    preprocessSourceForFeatherFixes
} from "../src/ast-transforms/apply-feather-fixes.js";

function isEventInheritedCall(node) {
    if (!node || node.type !== "CallExpression") {
        return false;
    }

    const callee = node.object;

    return callee?.type === "Identifier" && callee.name === "event_inherited";
}

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
            ast._appliedFeatherDiagnostics.some(
                (entry) => entry.id === "GM1051"
            ),
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

    it("inserts the missing argument for GM1005 and records fix metadata", () => {
        const source = "draw_set_color();";

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [firstStatement] = ast.body ?? [];
        const callExpression =
            firstStatement?.type === "ExpressionStatement"
                ? firstStatement.expression
                : firstStatement;

        assert.ok(callExpression);
        assert.ok(Array.isArray(callExpression.arguments));
        assert.strictEqual(callExpression.arguments.length, 1);

        const [argument] = callExpression.arguments;
        assert.ok(argument);
        assert.strictEqual(argument.type, "Identifier");
        assert.strictEqual(argument.name, "c_black");

        const appliedFixes = callExpression._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            appliedFixes.some((entry) => entry.id === "GM1005"),
            true
        );

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        assert.strictEqual(
            ast._appliedFeatherDiagnostics.some(
                (entry) => entry.id === "GM1005"
            ),
            true
        );
    });

    it("removes duplicate enum members and records fix metadata", () => {
        const source = [
            "enum FRUIT {",
            "    APPLE,",
            "    apple,",
            "    BANANA,",
            "    BANANA",
            "}",
            "",
            "var result = FRUIT.BANANA;"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [enumDeclaration] = ast.body ?? [];
        assert.ok(enumDeclaration);
        assert.strictEqual(enumDeclaration.type, "EnumDeclaration");

        const members = Array.isArray(enumDeclaration.members)
            ? enumDeclaration.members
            : [];
        const memberNames = members.map((member) => member?.name?.name);

        assert.deepStrictEqual(
            memberNames,
            ["APPLE", "BANANA"],
            "Expected duplicate enum members to be removed."
        );

        const enumFixes = enumDeclaration._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(enumFixes.length, 2);
        assert.strictEqual(
            enumFixes.every((entry) => entry.id === "GM1004"),
            true
        );
        assert.deepStrictEqual(
            enumFixes.map((entry) => entry.target),
            ["apple", "BANANA"]
        );

        const recordedIds = new Set(
            (ast._appliedFeatherDiagnostics ?? []).map((entry) => entry.id)
        );
        assert.strictEqual(
            recordedIds.has("GM1004"),
            true,
            "Expected GM1004 fix metadata on the program node."
        );
    });

    it("replaces read-only built-in assignments with local variables", () => {
        const source = [
            "function demo() {",
            '    working_directory = @"PlayerData";',
            '    var first = file_find_first(working_directory + @"/Screenshots/*.png", fa_archive);',
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

        const [replacementDeclaration, callDeclaration, returnStatement] =
            blockBody;

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

        const statementFixes =
            replacementDeclaration._appliedFeatherDiagnostics;
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

    it("replaces file attribute additions with bitwise OR operations", () => {
        const source = [
            "function scanArchives() {",
            "    var attributes = fa_readonly + fa_archive;",
            '    return file_find_first(@"/User Content/*.doc", attributes);',
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [functionDeclaration] = ast.body ?? [];
        assert.ok(functionDeclaration);

        const declaration = functionDeclaration.body?.body?.[0];
        assert.ok(declaration);
        assert.strictEqual(declaration.type, "VariableDeclaration");

        const [declarator] = declaration.declarations ?? [];
        assert.ok(declarator);

        const initializer = declarator.init;
        assert.ok(initializer);
        assert.strictEqual(initializer.type, "BinaryExpression");
        assert.strictEqual(initializer.operator, "|");

        const appliedDiagnostics = Array.isArray(
            initializer._appliedFeatherDiagnostics
        )
            ? initializer._appliedFeatherDiagnostics
            : [];

        assert.strictEqual(
            appliedDiagnostics.some((entry) => entry.id === "GM1009"),
            true,
            "Expected GM1009 fix metadata for the converted file attribute addition."
        );
    });

    it("converts room navigation arithmetic into dedicated helpers", () => {
        const source = [
            "var next_room = room + 1;",
            "var previous_room = room - 1;",
            "room_goto(room + 1);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [nextDeclaration, previousDeclaration, gotoStatement] =
            ast.body ?? [];

        assert.ok(nextDeclaration);
        assert.strictEqual(nextDeclaration.type, "VariableDeclaration");

        const [nextDeclarator] = nextDeclaration.declarations ?? [];
        assert.ok(nextDeclarator);

        const nextInitializer = nextDeclarator.init;
        assert.ok(nextInitializer);
        assert.strictEqual(nextInitializer.type, "CallExpression");
        assert.strictEqual(nextInitializer.object?.name, "room_next");
        assert.ok(Array.isArray(nextInitializer.arguments));
        assert.strictEqual(nextInitializer.arguments.length, 1);

        const [nextArgument] = nextInitializer.arguments;
        assert.ok(nextArgument);
        assert.strictEqual(nextArgument.type, "Identifier");
        assert.strictEqual(nextArgument.name, "room");

        const nextFixes = Array.isArray(
            nextInitializer._appliedFeatherDiagnostics
        )
            ? nextInitializer._appliedFeatherDiagnostics
            : [];

        assert.strictEqual(
            nextFixes.some((entry) => entry.id === "GM1009"),
            true,
            "Expected GM1009 fix metadata for the converted room_next helper."
        );

        assert.ok(previousDeclaration);
        assert.strictEqual(previousDeclaration.type, "VariableDeclaration");

        const [previousDeclarator] = previousDeclaration.declarations ?? [];
        assert.ok(previousDeclarator);

        const previousInitializer = previousDeclarator.init;
        assert.ok(previousInitializer);
        assert.strictEqual(previousInitializer.type, "CallExpression");
        assert.strictEqual(previousInitializer.object?.name, "room_previous");
        assert.ok(Array.isArray(previousInitializer.arguments));
        assert.strictEqual(previousInitializer.arguments.length, 1);

        const [previousArgument] = previousInitializer.arguments;
        assert.ok(previousArgument);
        assert.strictEqual(previousArgument.type, "Identifier");
        assert.strictEqual(previousArgument.name, "room");

        const previousFixes = Array.isArray(
            previousInitializer._appliedFeatherDiagnostics
        )
            ? previousInitializer._appliedFeatherDiagnostics
            : [];

        assert.strictEqual(
            previousFixes.some((entry) => entry.id === "GM1009"),
            true,
            "Expected GM1009 fix metadata for the converted room_previous helper."
        );

        const expressionStatement =
            gotoStatement?.type === "ExpressionStatement"
                ? gotoStatement.expression
                : gotoStatement;

        assert.ok(expressionStatement);
        assert.strictEqual(expressionStatement.type, "CallExpression");
        assert.strictEqual(expressionStatement.object?.name, "room_goto_next");
        assert.ok(Array.isArray(expressionStatement.arguments));
        assert.strictEqual(expressionStatement.arguments.length, 0);

        const gotoFixes = Array.isArray(
            expressionStatement._appliedFeatherDiagnostics
        )
            ? expressionStatement._appliedFeatherDiagnostics
            : [];

        assert.strictEqual(
            gotoFixes.some((entry) => entry.id === "GM1009"),
            true,
            "Expected GM1009 fix metadata for the converted room_goto helper."
        );
    });

    it("annotates invalid assignment targets with GM1007 metadata", () => {
        const source = [
            "var origin = new Point(0, 0);",
            "",
            "new Point(0, 0) = 1;"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const assignment = ast.body?.find(
            (node) =>
                node?.type === "AssignmentExpression" &&
                node.left?.type === "NewExpression"
        );

        assert.ok(
            assignment,
            "Expected to locate the invalid assignment expression."
        );

        const assignmentFixes = assignment._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(assignmentFixes));
        assert.strictEqual(assignmentFixes.length, 1);

        const [fix] = assignmentFixes;
        assert.strictEqual(fix.id, "GM1007");
        assert.strictEqual(fix.automatic, false);
        assert.strictEqual(fix.target, "new Point(0, 0)");
        assert.ok(fix.range);
        assert.strictEqual(typeof fix.range.start, "number");
        assert.strictEqual(typeof fix.range.end, "number");
        assert.ok(fix.range.end > fix.range.start);

        const programFixes = ast._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(programFixes));
        assert.strictEqual(
            programFixes.some((entry) => entry.id === "GM1007"),
            true,
            "Expected program-level metadata to include GM1007."
        );
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

        const assignmentFixes =
            promotedAssignment?._appliedFeatherDiagnostics ?? [];
        assert.ok(
            assignmentFixes.some(
                (entry) => entry.id === "GM1013" && entry.automatic === true
            ),
            "Expected promoted assignment to record GM1013 metadata."
        );

        const memberFixes =
            damageExpression.right?._appliedFeatherDiagnostics ?? [];
        assert.ok(
            memberFixes.some(
                (entry) => entry.id === "GM1013" && entry.automatic === true
            ),
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

    it("coerces string literal operands flagged by GM1010", () => {
        const source = 'result = 5 + "5";';

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [assignment] = ast.body ?? [];
        assert.ok(assignment);
        assert.strictEqual(assignment.type, "AssignmentExpression");

        const binary = assignment.right;
        assert.ok(binary);
        assert.strictEqual(binary.type, "BinaryExpression");
        assert.strictEqual(binary.operator, "+");

        const coerced = binary.right;
        assert.ok(coerced);
        assert.strictEqual(coerced.type, "CallExpression");
        assert.strictEqual(coerced.object?.type, "Identifier");
        assert.strictEqual(coerced.object?.name, "real");
        assert.ok(Array.isArray(coerced.arguments));
        assert.strictEqual(coerced.arguments.length, 1);
        assert.strictEqual(coerced.arguments[0]?.type, "Literal");
        assert.strictEqual(coerced.arguments[0]?.value, '"5"');

        const metadata = binary._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(metadata));
        assert.strictEqual(metadata.length, 1);
        assert.strictEqual(metadata[0].id, "GM1010");
        assert.strictEqual(metadata[0].target, "+");
        assert.strictEqual(metadata[0].automatic, true);

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        assert.strictEqual(
            ast._appliedFeatherDiagnostics.some(
                (entry) => entry.id === "GM1010"
            ),
            true,
            "Expected GM1010 metadata to be recorded on the program node."
        );
    });

    it("leaves non-numeric string operands unchanged when coercion is unnecessary", () => {
        const source = [
            'var base = @"PlayerData";',
            'var combined = base + @"/Screenshots/*.png";',
            'var appended = base + "/Manual";'
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [, combinedDeclaration, appendedDeclaration] = ast.body ?? [];

        const combinedInit = combinedDeclaration?.declarations?.[0]?.init;
        assert.ok(combinedInit);
        assert.strictEqual(combinedInit.type, "BinaryExpression");
        assert.strictEqual(combinedInit.right?.type, "Literal");
        assert.strictEqual(combinedInit.right?.value, '@"/Screenshots/*.png"');

        const appendedInit = appendedDeclaration?.declarations?.[0]?.init;
        assert.ok(appendedInit);
        assert.strictEqual(appendedInit.type, "BinaryExpression");
        assert.strictEqual(appendedInit.right?.type, "Literal");
        assert.strictEqual(appendedInit.right?.value, '"/Manual"');

        const combinedMetadata = combinedInit._appliedFeatherDiagnostics ?? [];
        const appendedMetadata = appendedInit._appliedFeatherDiagnostics ?? [];

        assert.strictEqual(combinedMetadata.length, 0);
        assert.strictEqual(appendedMetadata.length, 0);
    });

    it("converts string length property access into string_length calls", () => {
        const source = "var result = string(value).length;";

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        const declaration = ast.body?.[0]?.declarations?.[0];
        const originalInit = declaration?.init;

        assert.ok(originalInit);
        assert.strictEqual(originalInit.type, "MemberDotExpression");

        applyFeatherFixes(ast, { sourceText: source });

        const updatedInit = declaration?.init;

        assert.ok(updatedInit);
        assert.strictEqual(updatedInit.type, "CallExpression");
        assert.strictEqual(updatedInit.object?.type, "Identifier");
        assert.strictEqual(updatedInit.object?.name, "string_length");
        assert.ok(Array.isArray(updatedInit.arguments));
        assert.strictEqual(updatedInit.arguments.length, 1);
        assert.strictEqual(updatedInit.arguments[0], originalInit.object);

        const appliedFixes = updatedInit._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(appliedFixes));
        const gm1012Fix = appliedFixes.find((entry) => entry.id === "GM1012");
        assert.ok(gm1012Fix);
        assert.strictEqual(gm1012Fix.target, "length");
    });

    it("corrects GM1021 typoed function calls using metadata guidance", () => {
        const source = [
            "function make_game(_genre) { /* ... */ }",
            "",
            'make_gaem("RPG");',
            "",
            "var _x = clam(x, 0, 100);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const typoCall = ast.body?.find(
            (node) => node?.type === "CallExpression"
        );
        const variableDeclaration = ast.body?.find(
            (node) => node?.type === "VariableDeclaration"
        );
        const clampCall = variableDeclaration?.declarations?.[0]?.init;

        assert.ok(typoCall);
        assert.strictEqual(typoCall.type, "CallExpression");
        assert.strictEqual(typoCall.object?.name, "make_game");

        assert.ok(clampCall);
        assert.strictEqual(clampCall.type, "CallExpression");
        assert.strictEqual(clampCall.object?.name, "clamp");

        const typoFixes = typoCall._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(typoFixes));
        assert.strictEqual(typoFixes.length, 1);
        assert.strictEqual(typoFixes[0].id, "GM1021");
        assert.strictEqual(typoFixes[0].target, "make_gaem");
        assert.strictEqual(typoFixes[0].replacement, "make_game");
        assert.strictEqual(typeof typoFixes[0].automatic, "boolean");
        assert.strictEqual(typoFixes[0].automatic, true);
        assert.ok(typoFixes[0].range);
        assert.strictEqual(typeof typoFixes[0].range.start, "number");
        assert.strictEqual(typeof typoFixes[0].range.end, "number");

        const clampFixes = clampCall._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(clampFixes));
        assert.strictEqual(clampFixes.length, 1);
        assert.strictEqual(clampFixes[0].id, "GM1021");
        assert.strictEqual(clampFixes[0].target, "clam");
        assert.strictEqual(clampFixes[0].replacement, "clamp");
        assert.strictEqual(clampFixes[0].automatic, true);

        const appliedFixes = ast._appliedFeatherDiagnostics ?? [];
        const gm1021Entries = appliedFixes.filter(
            (entry) => entry?.id === "GM1021"
        );

        assert.strictEqual(gm1021Entries.length >= 2, true);
        gm1021Entries.forEach((entry) => {
            assert.strictEqual(entry.automatic, true);
        });
    });

    it("renames deprecated built-in variables and records fix metadata", () => {
        const source = [
            "score = 0;",
            "score = score + 1;",
            "player.score = score;",
            "var local_score = score;"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [
            firstAssignment,
            secondAssignment,
            memberAssignment,
            declaration
        ] = ast.body ?? [];

        assert.ok(firstAssignment);
        assert.strictEqual(firstAssignment.type, "AssignmentExpression");
        assert.strictEqual(firstAssignment.left?.name, "points");
        assert.strictEqual(firstAssignment.right?.value, "0");

        assert.ok(secondAssignment);
        assert.strictEqual(secondAssignment.type, "AssignmentExpression");
        assert.strictEqual(secondAssignment.left?.name, "points");
        assert.strictEqual(secondAssignment.right?.type, "BinaryExpression");
        assert.strictEqual(secondAssignment.right?.left?.name, "points");

        assert.ok(memberAssignment);
        assert.strictEqual(memberAssignment.type, "AssignmentExpression");
        assert.strictEqual(memberAssignment.left?.property?.name, "score");
        assert.strictEqual(memberAssignment.right?.name, "points");

        assert.ok(declaration);
        assert.strictEqual(declaration.type, "VariableDeclaration");
        const [declarator] = declaration.declarations ?? [];
        assert.strictEqual(declarator?.id?.name, "local_score");
        assert.strictEqual(declarator?.init?.name, "points");

        const identifierMetadata =
            firstAssignment.left?._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(identifierMetadata));
        assert.strictEqual(identifierMetadata.length > 0, true);
        assert.strictEqual(identifierMetadata[0].id, "GM1024");
        assert.strictEqual(identifierMetadata[0].target, "score");

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        assert.strictEqual(
            ast._appliedFeatherDiagnostics.some(
                (entry) => entry.id === "GM1024"
            ),
            true
        );
    });

    it("replaces deprecated constants highlighted by GM1023", () => {
        const source = [
            "if (os_type == os_win32)",
            "{",
            "    return os_win32;",
            "}",
            ""
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [ifStatement] = ast.body ?? [];
        const comparison = ifStatement?.test?.expression;
        const conditionConstant = comparison?.right;
        const returnStatement = ifStatement?.consequent?.body?.[0];
        const returnArgument = returnStatement?.argument;

        assert.ok(conditionConstant);
        assert.strictEqual(conditionConstant.type, "Identifier");
        assert.strictEqual(conditionConstant.name, "os_windows");

        assert.ok(returnArgument);
        assert.strictEqual(returnArgument.type, "Identifier");
        assert.strictEqual(returnArgument.name, "os_windows");

        const identifierFixes = returnArgument._appliedFeatherDiagnostics ?? [];
        assert.ok(Array.isArray(identifierFixes));

        const gm1023Fix = identifierFixes.find(
            (entry) => entry.id === "GM1023"
        );
        assert.ok(
            gm1023Fix,
            "Expected GM1023 fix metadata to be attached to the identifier."
        );
        assert.strictEqual(gm1023Fix.target, "os_windows");
        assert.strictEqual(gm1023Fix.automatic, true);

        const programFixes = ast._appliedFeatherDiagnostics ?? [];
        assert.ok(
            programFixes.some((entry) => entry.id === "GM1023"),
            "Expected GM1023 fix metadata to be attached to the program node."
        );
    });

    it("rewrites postfix increment statements flagged by GM1026", () => {
        const source = "pi++;";

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [variableDeclaration, incDecStatement] = ast.body ?? [];

        assert.ok(variableDeclaration);
        assert.strictEqual(variableDeclaration.type, "VariableDeclaration");
        assert.strictEqual(variableDeclaration.kind, "var");

        const [declarator] = variableDeclaration.declarations ?? [];
        assert.ok(declarator);
        assert.strictEqual(declarator.type, "VariableDeclarator");
        assert.strictEqual(declarator.init?.type, "Identifier");
        assert.strictEqual(declarator.init?.name, "pi");

        const identifierName = declarator.id?.name;
        assert.ok(typeof identifierName === "string");
        assert.ok(identifierName.startsWith("__featherFix_pi"));

        assert.ok(incDecStatement);
        assert.strictEqual(incDecStatement.type, "IncDecStatement");
        assert.strictEqual(incDecStatement.prefix, false);
        assert.strictEqual(incDecStatement.operator, "++");
        assert.strictEqual(incDecStatement.argument?.type, "Identifier");
        assert.strictEqual(incDecStatement.argument?.name, identifierName);

        const declarationMetadata =
            variableDeclaration._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(declarationMetadata));
        assert.strictEqual(
            declarationMetadata.some((entry) => entry.id === "GM1026"),
            true
        );

        const statementMetadata = incDecStatement._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(statementMetadata));
        assert.strictEqual(
            statementMetadata.some((entry) => entry.id === "GM1026"),
            true
        );

        const programMetadata = ast._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(programMetadata));
        const gm1026 = programMetadata.find((entry) => entry.id === "GM1026");
        assert.ok(gm1026);
        assert.strictEqual(gm1026.automatic, true);
    });

    it("renames reserved identifiers and records fix metadata", () => {
        const source = [
            "#macro image_index 1",
            "",
            "var image_index = 1;",
            "static draw_text = 2;"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [macro, varDeclaration, staticDeclaration] = ast.body ?? [];

        assert.ok(macro?.name);
        assert.strictEqual(macro.name.name, "_image_index");
        assert.strictEqual(
            macro._featherMacroText?.trimEnd(),
            "#macro _image_index 1"
        );
        assert.ok(Array.isArray(macro.name._appliedFeatherDiagnostics));
        assert.strictEqual(
            macro.name._appliedFeatherDiagnostics[0].id,
            "GM1030"
        );
        assert.strictEqual(
            macro.name._appliedFeatherDiagnostics[0].target,
            "image_index"
        );

        const varDeclarator = varDeclaration?.declarations?.[0];
        assert.ok(varDeclarator?.id);
        assert.strictEqual(varDeclarator.id.name, "_image_index");
        assert.ok(Array.isArray(varDeclarator.id._appliedFeatherDiagnostics));
        assert.strictEqual(
            varDeclarator.id._appliedFeatherDiagnostics[0].id,
            "GM1030"
        );
        assert.strictEqual(
            varDeclarator.id._appliedFeatherDiagnostics[0].target,
            "image_index"
        );

        const staticDeclarator = staticDeclaration?.declarations?.[0];
        assert.ok(staticDeclarator?.id);
        assert.strictEqual(staticDeclarator.id.name, "_draw_text");
        assert.ok(
            Array.isArray(staticDeclarator.id._appliedFeatherDiagnostics)
        );
        assert.strictEqual(
            staticDeclarator.id._appliedFeatherDiagnostics[0].id,
            "GM1030"
        );
        assert.strictEqual(
            staticDeclarator.id._appliedFeatherDiagnostics[0].target,
            "draw_text"
        );

        const appliedFixes = ast._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            appliedFixes.some((entry) => entry.id === "GM1030"),
            true,
            "Expected GM1030 fix metadata to be attached to the program node."
        );
    });

    it("converts numeric string call arguments into numeric literals for GM1029", () => {
        const source =
            'draw_sprite(sprite_index, image_index, "1234", "5678");';

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [callExpression] = ast.body ?? [];
        assert.ok(callExpression);

        const args = Array.isArray(callExpression?.arguments)
            ? callExpression.arguments
            : [];

        assert.strictEqual(args.length, 4);
        assert.strictEqual(args[2]?.type, "Literal");
        assert.strictEqual(args[3]?.type, "Literal");
        assert.strictEqual(args[2]?.value, "1234");
        assert.strictEqual(args[3]?.value, "5678");

        const literalMetadata = args[2]?._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(literalMetadata));
        assert.strictEqual(literalMetadata.length, 1);

        const [metadata] = literalMetadata;
        const diagnostic = getFeatherDiagnosticById("GM1029");

        assert.strictEqual(metadata?.id, "GM1029");
        assert.strictEqual(metadata?.automatic, true);
        assert.strictEqual(metadata?.title, diagnostic?.title ?? null);
        assert.strictEqual(
            metadata?.description,
            diagnostic?.description ?? null
        );
        assert.strictEqual(
            metadata?.correction,
            diagnostic?.correction ?? null
        );
        assert.ok(metadata?.range);
        assert.strictEqual(typeof metadata.range.start, "number");
        assert.strictEqual(typeof metadata.range.end, "number");
    });

    it("normalizes multidimensional array indexing and records metadata", () => {
        const source = [
            "function fetch_value(_grid, _row, _column, _depth)",
            "{",
            "    var primary = _grid[_row, _column];",
            "    var tertiary = _grid[_row, _column, _depth];",
            "    return primary + tertiary;",
            "}",
            "",
            "var nested = matrix[0, 1, 2, 3];"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const functionDeclaration = ast.body?.[0];
        assert.ok(functionDeclaration?.body?.body);

        const [primaryDeclaration, tertiaryDeclaration, returnStatement] =
            functionDeclaration.body.body;

        const primaryInit = primaryDeclaration?.declarations?.[0]?.init;
        const tertiaryInit = tertiaryDeclaration?.declarations?.[0]?.init;

        assert.strictEqual(primaryInit?.type, "MemberIndexExpression");
        assert.strictEqual(primaryInit?.property?.length, 1);
        assert.strictEqual(primaryInit?.object?.type, "MemberIndexExpression");
        assert.strictEqual(primaryInit.object.property?.length, 1);
        assert.ok(Array.isArray(primaryInit._appliedFeatherDiagnostics));

        assert.strictEqual(tertiaryInit?.type, "MemberIndexExpression");
        assert.strictEqual(tertiaryInit?.property?.length, 1);
        assert.strictEqual(tertiaryInit?.object?.type, "MemberIndexExpression");
        assert.strictEqual(tertiaryInit.object.property?.length, 1);
        assert.strictEqual(
            tertiaryInit.object?.object?.type,
            "MemberIndexExpression"
        );
        assert.ok(Array.isArray(tertiaryInit._appliedFeatherDiagnostics));

        const globalDeclaration = ast.body?.[1]?.declarations?.[0];
        const nestedInit = globalDeclaration?.init;

        assert.strictEqual(nestedInit?.type, "MemberIndexExpression");
        assert.strictEqual(nestedInit?.property?.length, 1);
        assert.strictEqual(nestedInit?.object?.type, "MemberIndexExpression");
        assert.strictEqual(nestedInit?.object?.property?.length, 1);
        assert.strictEqual(
            nestedInit?.object?.object?.type,
            "MemberIndexExpression"
        );
        assert.strictEqual(
            nestedInit?.object?.object?.object?.type,
            "MemberIndexExpression"
        );
        assert.ok(Array.isArray(nestedInit._appliedFeatherDiagnostics));

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        const normalizedFixes = ast._appliedFeatherDiagnostics.filter(
            (entry) => entry.id === "GM1036"
        );
        assert.strictEqual(normalizedFixes.length >= 3, true);

        for (const entry of normalizedFixes) {
            assert.strictEqual(entry.automatic, true);
        }

        assert.ok(returnStatement);
    });

    it("converts instance creation asset strings to identifiers and records metadata", () => {
        const source = 'instance_create_depth(x, y, -100, "obj_player");';

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        const [callExpression] = ast.body ?? [];
        assert.ok(callExpression);
        const originalArgument = callExpression?.arguments?.[3];
        assert.ok(originalArgument);
        assert.strictEqual(originalArgument.type, "Literal");

        applyFeatherFixes(ast, { sourceText: source });

        const updatedArgument = callExpression.arguments?.[3];
        assert.ok(updatedArgument);
        assert.strictEqual(updatedArgument.type, "Identifier");
        assert.strictEqual(updatedArgument.name, "obj_player");

        const metadata = updatedArgument._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(metadata));
        assert.strictEqual(metadata.length, 1);
        const [entry] = metadata;
        assert.strictEqual(entry.id, "GM1041");
        assert.strictEqual(entry.target, "obj_player");
        assert.strictEqual(entry.automatic, true);
        assert.ok(entry.range);
        assert.strictEqual(typeof entry.range.start, "number");
        assert.strictEqual(typeof entry.range.end, "number");

        const programFixes = ast._appliedFeatherDiagnostics ?? [];
        assert.ok(Array.isArray(programFixes));
        assert.ok(
            programFixes.some(
                (detail) =>
                    detail.id === "GM1041" &&
                    detail.automatic === true &&
                    detail.target === "obj_player"
            )
        );
    });

    it("replaces invalid delete statements and records fix metadata", () => {
        const source = [
            "var values = [2, 403, 202, 303, 773, 573];",
            "",
            "delete values;"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        assert.ok(Array.isArray(ast.body));
        assert.strictEqual(ast.body.length >= 2, true);

        const assignment = ast.body[1];
        assert.ok(assignment);
        assert.strictEqual(assignment.type, "AssignmentExpression");
        assert.ok(assignment.left);
        assert.strictEqual(assignment.left.type, "Identifier");
        assert.strictEqual(assignment.left.name, "values");
        assert.ok(assignment.right);
        assert.strictEqual(assignment.right.type, "Literal");
        assert.strictEqual(assignment.right.value, "undefined");

        const assignmentFixes = assignment._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(assignmentFixes));
        assert.strictEqual(assignmentFixes.length >= 1, true);
        assert.strictEqual(
            assignmentFixes.some((entry) => entry.id === "GM1052"),
            true,
            "Expected delete fixer metadata to be recorded on the assignment node."
        );

        const recordedFix = assignmentFixes.find(
            (entry) => entry.id === "GM1052"
        );
        assert.ok(recordedFix);
        assert.strictEqual(recordedFix.target, "values");
        assert.strictEqual(recordedFix.automatic, true);

        assert.ok(Array.isArray(ast._appliedFeatherDiagnostics));
        assert.strictEqual(
            ast._appliedFeatherDiagnostics.some(
                (entry) => entry.id === "GM1052"
            ),
            true,
            "Expected delete fixer metadata to be recorded on the program node."
        );
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

    it("removes duplicate function parameters and records metadata", () => {
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
        assert.deepStrictEqual(
            params.map((param) =>
                param?.type === "Identifier"
                    ? param.name
                    : (param?.left?.name ?? null)
            ),
            ["value", "other"]
        );

        const fnMetadata = fn._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(fnMetadata.length, 2);
        fnMetadata.forEach((entry) => {
            assert.strictEqual(entry.id, "GM1059");
            assert.strictEqual(entry.target, "value");
            assert.strictEqual(entry.automatic, true);
        });

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

    it("removes duplicate constructor parameters flagged by GM1059", () => {
        const source = [
            "function Example(value, other, value) constructor {",
            "    return value + other;",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [ctor] = ast.body ?? [];
        assert.ok(ctor);
        assert.strictEqual(ctor.type, "ConstructorDeclaration");

        const params = Array.isArray(ctor.params) ? ctor.params : [];
        assert.deepStrictEqual(
            params.map((param) =>
                param?.type === "Identifier"
                    ? param.name
                    : (param?.left?.name ?? null)
            ),
            ["value", "other"]
        );

        const ctorMetadata = ctor._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(ctorMetadata.length, 1);
        const [metadataEntry] = ctorMetadata;
        assert.ok(metadataEntry);
        assert.strictEqual(metadataEntry.id, "GM1059");
        assert.strictEqual(metadataEntry.target, "value");
        assert.strictEqual(metadataEntry.automatic, true);

        const rootMetadata = ast._appliedFeatherDiagnostics ?? [];
        const gm1059Metadata = rootMetadata.filter(
            (entry) => entry.id === "GM1059"
        );
        assert.strictEqual(gm1059Metadata.length, 1);
        const [rootEntry] = gm1059Metadata;
        assert.ok(rootEntry);
        assert.strictEqual(rootEntry.target, "value");
        assert.strictEqual(rootEntry.automatic, true);
    });

    it("adds missing enum members and records fix metadata", () => {
        const source = [
            "enum FRUIT {",
            "    NONE,",
            "    ORANGE,",
            "    SIZEOF",
            "}",
            "",
            "var best = FRUIT.KIWI;"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [enumDeclaration] = ast.body ?? [];
        assert.ok(enumDeclaration);

        const members = Array.isArray(enumDeclaration.members)
            ? enumDeclaration.members
            : [];
        const memberNames = members.map((member) => member?.name?.name);

        assert.deepStrictEqual(memberNames, [
            "NONE",
            "ORANGE",
            "KIWI",
            "SIZEOF"
        ]);

        const kiwiMember = members.find(
            (member) => member?.name?.name === "KIWI"
        );
        assert.ok(kiwiMember);

        const memberFixes = kiwiMember._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(memberFixes));
        assert.strictEqual(memberFixes.length, 1);
        assert.strictEqual(memberFixes[0].id, "GM1014");
        assert.strictEqual(memberFixes[0].target, "FRUIT.KIWI");

        const enumFixes = enumDeclaration._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(enumFixes));
        assert.strictEqual(
            enumFixes.some((entry) => entry.id === "GM1014"),
            true
        );

        const programFixes = ast._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(programFixes));
        assert.strictEqual(
            programFixes.some((entry) => entry.id === "GM1014"),
            true
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

        const recordedIds = new Set(
            ast._appliedFeatherDiagnostics.map((entry) => entry.id)
        );
        const diagnostics = getFeatherMetadata().diagnostics ?? [];

        assert.strictEqual(
            recordedIds.size,
            diagnostics.length,
            "Expected manual Feather fix metadata to be captured for every diagnostic."
        );

        ["GM2054", "GM2020", "GM2042", "GM1042"].forEach((id) => {
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

    it("inserts surface target resets for GM2046 sequences and records metadata", () => {
        const source = [
            "/// Draw Event",
            "",
            "surface_set_target(sf);",
            "draw_clear_alpha(c_blue, 1);",
            "draw_circle(50, 50, 20, false);",
            "vertex_submit(vb, pr_trianglelist, surface_get_texture(sf));"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const body = Array.isArray(ast.body) ? ast.body : [];
        const setIndex = body.findIndex(
            (node) =>
                node?.type === "CallExpression" &&
                node.object?.name === "surface_set_target"
        );
        const resetIndex = body.findIndex(
            (node) =>
                node?.type === "CallExpression" &&
                node.object?.name === "surface_reset_target"
        );

        assert.ok(
            setIndex >= 0,
            "Expected surface_set_target call to be present in the AST."
        );
        assert.ok(
            resetIndex > setIndex,
            "Expected surface_reset_target to be inserted after the setter."
        );

        const resetCall = body[resetIndex];
        assert.ok(Array.isArray(resetCall?.arguments));
        assert.strictEqual(
            resetCall.arguments.length,
            0,
            "Reset call should not include arguments."
        );

        const vertexCall = body[resetIndex + 1];
        assert.strictEqual(
            vertexCall?.object?.name,
            "vertex_submit",
            "Expected reset call to appear before vertex submission."
        );

        const appliedDiagnostics = Array.isArray(ast._appliedFeatherDiagnostics)
            ? ast._appliedFeatherDiagnostics
            : [];
        const gm2046 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2046"
        );

        assert.ok(
            gm2046,
            "Expected GM2046 metadata to be recorded on the AST."
        );
        assert.strictEqual(gm2046.automatic, true);
        assert.strictEqual(gm2046.target, "sf");

        const resetDiagnostics = Array.isArray(
            resetCall?._appliedFeatherDiagnostics
        )
            ? resetCall._appliedFeatherDiagnostics
            : [];

        assert.strictEqual(
            resetDiagnostics.some((entry) => entry.id === "GM2046"),
            true,
            "Expected GM2046 metadata to be attached to the inserted reset call."
        );
    });

    it("captures metadata for deprecated function calls flagged by GM1017", () => {
        const source = [
            "/// @deprecated Use start_new_game instead.",
            "function make_game() {",
            "    return 1;",
            "}",
            "",
            "make_game();"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const callExpression = ast.body?.find(
            (node) => node?.type === "CallExpression"
        );

        assert.ok(
            callExpression,
            "Expected the sample program to include a call expression."
        );

        const fixes = callExpression._appliedFeatherDiagnostics;

        assert.ok(Array.isArray(fixes));
        assert.strictEqual(fixes.length, 1);

        const [fix] = fixes;

        assert.strictEqual(fix.id, "GM1017");
        assert.strictEqual(fix.target, "make_game");
        assert.strictEqual(fix.automatic, false);
        assert.ok(fix.range);
        assert.strictEqual(fix.range.start, getNodeStartIndex(callExpression));
        assert.strictEqual(fix.range.end, getNodeEndIndex(callExpression));

        const metadata = getFeatherMetadata();
        const diagnostic = metadata.diagnostics?.find(
            (entry) => entry?.id === "GM1017"
        );

        assert.ok(diagnostic);
        assert.strictEqual(fix.correction, diagnostic?.correction ?? null);

        const programFixIds = new Set(
            (ast._appliedFeatherDiagnostics ?? []).map((entry) => entry.id)
        );

        assert.strictEqual(
            programFixIds.has("GM1017"),
            true,
            "Expected the program node to record GM1017 fix metadata."
        );
    });

    it("corrects mismatched data structure accessors using metadata", () => {
        const metadata = getFeatherMetadata();
        const diagnostic = (metadata?.diagnostics ?? []).find(
            (entry) => entry?.id === "GM1028"
        );

        assert.ok(
            diagnostic,
            "Expected metadata for diagnostic GM1028 to exist."
        );
        assert.ok(
            typeof diagnostic.badExample === "string" &&
                diagnostic.badExample.includes("[?"),
            "Expected GM1028 bad example to include the incorrect accessor token."
        );
        assert.ok(
            typeof diagnostic.goodExample === "string" &&
                diagnostic.goodExample.includes("[|"),
            "Expected GM1028 good example to include the corrected accessor token."
        );

        const source = [
            "lst_instances = ds_list_create();",
            "",
            "if (instance_place_list(x, y, obj_enemy, lst_instances, true))",
            "{",
            "    var _ins = lst_instances[? 0];",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const ifStatement = (ast.body ?? []).find(
            (node) => node?.type === "IfStatement"
        );
        const declaration = ifStatement?.consequent?.body?.[0];
        const declarator = declaration?.declarations?.[0];
        const accessorExpression = declarator?.init;

        assert.ok(accessorExpression, "Expected accessor expression to exist.");
        assert.strictEqual(accessorExpression.type, "MemberIndexExpression");
        assert.strictEqual(accessorExpression.accessor, "[|");

        const accessorFixes = Array.isArray(
            accessorExpression._appliedFeatherDiagnostics
        )
            ? accessorExpression._appliedFeatherDiagnostics
            : [];

        assert.strictEqual(
            accessorFixes.some((entry) => entry.id === "GM1028"),
            true,
            "Expected GM1028 fix metadata to be attached to the accessor expression."
        );

        const appliedFixes = Array.isArray(ast._appliedFeatherDiagnostics)
            ? ast._appliedFeatherDiagnostics
            : [];

        assert.strictEqual(
            appliedFixes.some((entry) => entry.id === "GM1028"),
            true,
            "Expected GM1028 fix metadata to be attached to the root program node."
        );
    });

    it("normalizes argument built-ins flagged by GM1032", () => {
        const metadata = getFeatherMetadata();
        const diagnostic = (metadata?.diagnostics ?? []).find(
            (entry) => entry?.id === "GM1032"
        );

        assert.ok(
            diagnostic,
            "Expected GM1032 diagnostic metadata to be available."
        );

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

            if (
                node.type === "Identifier" &&
                typeof node.name === "string" &&
                /^argument\d+$/.test(node.name)
            ) {
                trackedIdentifiers.push({
                    node,
                    originalName: node.name
                });
            }

            for (const value of Object.values(node)) {
                if (value && typeof value === "object") {
                    collectArgumentIdentifiers(value);
                }
            }
        };

        collectArgumentIdentifiers(ast);

        applyFeatherFixes(ast, { sourceText: source });

        const changedIdentifiers = trackedIdentifiers.filter(
            (entry) => entry.node.name !== entry.originalName
        );

        assert.strictEqual(
            changedIdentifiers.length > 0,
            true,
            "Expected some argument built-ins to be renamed."
        );

        const changedNames = changedIdentifiers
            .map((entry) => entry.node.name)
            .sort();
        const expectedNames = [
            "argument0",
            "argument1",
            "argument1",
            "argument2"
        ].sort();

        assert.deepStrictEqual(
            changedNames,
            expectedNames,
            "Argument built-ins should be reindexed without gaps starting from argument0."
        );

        for (const entry of changedIdentifiers) {
            const metadataEntries = entry.node._appliedFeatherDiagnostics;

            assert.ok(
                Array.isArray(metadataEntries),
                "Each rewritten argument identifier should include metadata."
            );
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

    it("records duplicate semicolon fixes for GM1033", () => {
        const source = [
            "var value = 1;;",
            "var other = 2;",
            "",
            "function demo() {",
            "    ;;",
            "    var local = 3;;",
            "    switch (local) {",
            "        case 1:;;",
            "            break;",
            "    }",
            "}"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const metadata = Array.isArray(ast._appliedFeatherDiagnostics)
            ? ast._appliedFeatherDiagnostics
            : [];

        const gm1033Fixes = metadata.filter((entry) => entry.id === "GM1033");

        assert.ok(
            gm1033Fixes.length > 0,
            "Expected duplicate semicolons to be detected."
        );

        for (const fix of gm1033Fixes) {
            assert.strictEqual(
                typeof fix.range?.start === "number" &&
                    typeof fix.range?.end === "number",
                true,
                "Expected each GM1033 fix to include a range."
            );
        }
    });

    it("moves argument references into the preceding function body", () => {
        const source = [
            "function args()",
            "{",
            "}",
            "",
            "var _first_parameter = argument[0];",
            "var _argument_total = argument_count;"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        const [functionDeclaration, firstStatement, secondStatement] =
            ast.body ?? [];

        assert.ok(functionDeclaration);
        assert.strictEqual(functionDeclaration.type, "FunctionDeclaration");
        assert.strictEqual(typeof firstStatement, "object");
        assert.strictEqual(typeof secondStatement, "object");

        applyFeatherFixes(ast, { sourceText: source });

        assert.ok(Array.isArray(ast.body));
        assert.strictEqual(ast.body.length > 0, true);
        assert.strictEqual(ast.body[0], functionDeclaration);

        const functionBody = functionDeclaration?.body;
        assert.ok(functionBody);
        assert.strictEqual(functionBody.type, "BlockStatement");
        assert.ok(Array.isArray(functionBody.body));
        assert.strictEqual(functionBody.body.length >= 2, true);
        assert.strictEqual(
            functionBody.body[functionBody.body.length - 2],
            firstStatement
        );
        assert.strictEqual(
            functionBody.body[functionBody.body.length - 1],
            secondStatement
        );

        const firstFixes = firstStatement?._appliedFeatherDiagnostics;
        const secondFixes = secondStatement?._appliedFeatherDiagnostics;

        assert.ok(Array.isArray(firstFixes));
        assert.strictEqual(firstFixes.length, 1);
        assert.strictEqual(firstFixes[0].id, "GM1034");
        assert.strictEqual(firstFixes[0].target, "argument");

        assert.ok(Array.isArray(secondFixes));
        assert.strictEqual(secondFixes.length, 1);
        assert.strictEqual(secondFixes[0].id, "GM1034");
        assert.strictEqual(secondFixes[0].target, "argument_count");

        const programFixes = ast._appliedFeatherDiagnostics ?? [];
        const gm1034Fixes = programFixes.filter(
            (entry) => entry.id === "GM1034"
        );
        assert.strictEqual(gm1034Fixes.length, 2);
    });

    it("removes duplicate macro declarations and records fix metadata", () => {
        const source = [
            "#macro dbg show_debug_message",
            "#macro other value",
            "#macro dbg show_debug_message",
            "",
            'dbg("hi");'
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const macros = Array.isArray(ast.body)
            ? ast.body.filter((node) => node?.type === "MacroDeclaration")
            : [];

        assert.strictEqual(
            macros.length,
            2,
            "Expected duplicate macro to be removed."
        );

        const recordedFixes = Array.isArray(ast._appliedFeatherDiagnostics)
            ? ast._appliedFeatherDiagnostics
            : [];

        assert.ok(recordedFixes.some((entry) => entry.id === "GM1038"));
        assert.ok(
            recordedFixes.some(
                (entry) =>
                    entry.id === "GM1038" &&
                    entry.target === "dbg" &&
                    entry.automatic !== false
            ),
            "Expected GM1038 fix metadata with automatic flag and target name."
        );
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

        const [baseFunction, childConstructor, orphanConstructor] =
            ast.body ?? [];

        applyFeatherFixes(ast, { sourceText: source });

        assert.ok(baseFunction);
        assert.strictEqual(baseFunction.type, "ConstructorDeclaration");
        assert.strictEqual(baseFunction.parent, null);

        const baseFixes = baseFunction._appliedFeatherDiagnostics;
        assert.ok(Array.isArray(baseFixes));
        assert.strictEqual(baseFixes.length > 0, true);
        assert.strictEqual(
            baseFixes.some((entry) => entry.id === "GM1054"),
            true
        );

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
            ast._appliedFeatherDiagnostics.some(
                (entry) => entry.id === "GM1056"
            ),
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

        const separatorStatements = (ast.body ?? []).filter(
            (node) => node?.type === "EmptyStatement"
        );
        assert.strictEqual(
            separatorStatements.length,
            0,
            "Expected GM2056 fix to avoid inserting separator statements."
        );

        const statements = (ast.body ?? []).filter(
            (node) => node?.type !== "EmptyStatement"
        );
        const [setRepeatCall, submitCall, resetCall] = statements;

        assert.ok(setRepeatCall);
        assert.ok(submitCall);
        assert.ok(resetCall);
        assert.strictEqual(resetCall.type, "CallExpression");
        assert.strictEqual(resetCall.object?.name, "gpu_set_texrepeat");

        const args = Array.isArray(resetCall.arguments)
            ? resetCall.arguments
            : [];
        assert.strictEqual(args.length > 0, true);
        assert.strictEqual(args[0]?.type, "Literal");
        assert.strictEqual(args[0]?.value, "false");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2056 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2056"
        );

        assert.ok(
            gm2056,
            "Expected GM2056 metadata to be recorded on the AST."
        );
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
            'draw_text(0, 0, "Hello!");'
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const statements = (ast.body ?? []).filter(
            (node) => node?.type !== "EmptyStatement"
        );
        const [disableCall, drawCall, resetCall] = statements;

        assert.ok(disableCall);
        assert.ok(drawCall);
        assert.ok(resetCall);
        assert.strictEqual(resetCall.type, "CallExpression");
        assert.strictEqual(resetCall.object?.name, "gpu_set_blendenable");

        const args = Array.isArray(resetCall.arguments)
            ? resetCall.arguments
            : [];
        assert.strictEqual(args.length > 0, true);
        assert.strictEqual(args[0]?.type, "Literal");
        assert.strictEqual(args[0]?.value, "true");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2048 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2048"
        );

        assert.ok(
            gm2048,
            "Expected GM2048 metadata to be recorded on the AST."
        );
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

    it("resets fog flagged by GM2050 and records metadata", () => {
        const source = [
            "gpu_set_fog(true, c_aqua, 0, 1000);",
            "",
            "draw_self();"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const statements = (ast.body ?? []).filter(
            (node) => node?.type !== "EmptyStatement"
        );
        const [setFogCall, fogResetCall, drawCall] = statements;

        assert.ok(setFogCall);
        assert.ok(fogResetCall);
        assert.ok(drawCall);
        assert.strictEqual(fogResetCall.type, "CallExpression");
        assert.strictEqual(fogResetCall.object?.name, "gpu_set_fog");

        const args = Array.isArray(fogResetCall.arguments)
            ? fogResetCall.arguments
            : [];
        assert.strictEqual(args.length, 4);
        assert.strictEqual(args[0]?.type, "Literal");
        assert.strictEqual(args[0]?.value, "false");
        assert.strictEqual(args[1]?.type, "Identifier");
        assert.strictEqual(args[1]?.name, "c_black");
        assert.strictEqual(args[2]?.type, "Literal");
        assert.strictEqual(args[2]?.value, "0");
        assert.strictEqual(args[3]?.type, "Literal");
        assert.strictEqual(args[3]?.value, "1");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2050 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2050"
        );

        assert.ok(
            gm2050,
            "Expected GM2050 metadata to be recorded on the AST."
        );
        assert.strictEqual(gm2050.automatic, true);
        assert.strictEqual(gm2050.target, "gpu_set_fog");
        assert.ok(gm2050.range);

        const resetMetadata = fogResetCall._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            resetMetadata.some((entry) => entry.id === "GM2050"),
            true,
            "Expected GM2050 metadata to be recorded on the inserted reset call."
        );
    });

    it("resets alpha test enable flagged by GM2053 and records metadata", () => {
        const source = [
            "/// Draw Event",
            "",
            "gpu_set_alphatestenable(true);",
            "",
            "draw_self();"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const statements = (ast.body ?? []).filter(
            (node) => node?.type !== "EmptyStatement"
        );
        const [enableCall, drawCall, resetCall] = statements;

        assert.ok(enableCall);
        assert.ok(drawCall);
        assert.ok(resetCall);
        assert.strictEqual(enableCall.type, "CallExpression");
        assert.strictEqual(enableCall.object?.name, "gpu_set_alphatestenable");

        assert.strictEqual(drawCall.type, "CallExpression");
        assert.strictEqual(drawCall.object?.name, "draw_self");

        assert.strictEqual(resetCall.type, "CallExpression");
        assert.strictEqual(resetCall.object?.name, "gpu_set_alphatestenable");

        const args = Array.isArray(resetCall.arguments)
            ? resetCall.arguments
            : [];
        assert.strictEqual(args.length > 0, true);
        const [firstArg] = args;
        assert.ok(firstArg);
        assert.strictEqual(firstArg.type, "Literal");
        assert.strictEqual(
            firstArg.value === false || firstArg.value === "false",
            true
        );

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2053 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2053"
        );

        assert.ok(
            gm2053,
            "Expected GM2053 metadata to be recorded on the AST."
        );
        assert.strictEqual(gm2053.automatic, true);
        assert.strictEqual(gm2053.target, "gpu_set_alphatestenable");
        assert.ok(gm2053.range);

        const resetMetadata = resetCall._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            resetMetadata.some((entry) => entry.id === "GM2053"),
            true,
            "Expected GM2053 metadata to be recorded on the inserted reset call."
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
        const gm1063 = appliedDiagnostics.find(
            (entry) => entry.id === "GM1063"
        );

        assert.ok(
            gm1063,
            "Expected GM1063 metadata to be recorded on the AST."
        );
        assert.strictEqual(gm1063.automatic, true);
        assert.strictEqual(gm1063.target, "tex");
        assert.ok(gm1063.range);

        const ternaryDiagnostics =
            fixedTernary._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            ternaryDiagnostics.some((entry) => entry.id === "GM1063"),
            true
        );
    });

    it("resets gpu_set_cullmode calls flagged by GM2051 and records metadata", () => {
        const source = [
            "/// Draw Event",
            "",
            "gpu_set_cullmode(cull_clockwise);",
            "",
            "vertex_submit(vb, pr_trianglelist, tex);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const body = ast.body ?? [];
        assert.strictEqual(body.length >= 3, true);

        const resetCall = body[1];
        assert.ok(resetCall);
        assert.strictEqual(resetCall.type, "CallExpression");
        assert.strictEqual(resetCall.object?.name, "gpu_set_cullmode");
        assert.strictEqual(resetCall.arguments?.[0]?.name, "cull_noculling");

        const callDiagnostics = resetCall._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            callDiagnostics.some((entry) => entry.id === "GM2051"),
            true
        );

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2051 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2051"
        );
        assert.ok(
            gm2051,
            "Expected GM2051 metadata to be recorded on the AST."
        );
        assert.strictEqual(gm2051.automatic, true);
        assert.ok(gm2051.range);
    });

    it("normalizes simple syntax errors flagged by GM1100 and records metadata", () => {
        const source = ["var _this * something;", "", "    = 48;"].join("\n");

        const { sourceText, metadata } =
            preprocessSourceForFeatherFixes(source);

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
        const [declaration] = statements;

        assert.ok(declaration);
        assert.strictEqual(declaration.type, "VariableDeclaration");
        assert.strictEqual(Array.isArray(declaration.declarations), true);

        const declarationFixes = declaration._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            declarationFixes.some((entry) => entry.id === "GM1100"),
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
            assert.strictEqual(
                entry.description?.includes("syntax error"),
                true
            );
        }
    });

    it("normalizes zero denominators flagged by GM1015 and records metadata", () => {
        const source = [
            "var total = 10 / 0;",
            "total /= 0;",
            "total = total % (0);",
            "total %= (-0);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [declaration, assignment, moduloAssignment, moduloCompound] =
            ast.body ?? [];

        const binary = declaration?.declarations?.[0]?.init;
        assert.strictEqual(binary?.type, "BinaryExpression");
        assert.strictEqual(binary?.right?.type, "Literal");
        assert.strictEqual(binary?.right?.value, "1");

        assert.strictEqual(assignment?.type, "AssignmentExpression");
        assert.strictEqual(assignment?.right?.type, "Literal");
        assert.strictEqual(assignment?.right?.value, "1");

        const moduloBinary = moduloAssignment?.right;
        assert.strictEqual(moduloBinary?.type, "BinaryExpression");
        assert.strictEqual(
            moduloBinary?.right?.type,
            "ParenthesizedExpression"
        );
        assert.strictEqual(moduloBinary?.right?.expression?.type, "Literal");
        assert.strictEqual(moduloBinary?.right?.expression?.value, "1");

        const moduloCompoundRight = moduloCompound?.right;
        assert.strictEqual(
            moduloCompoundRight?.type,
            "ParenthesizedExpression"
        );
        const moduloCompoundUnary = moduloCompoundRight?.expression;
        assert.strictEqual(moduloCompoundUnary?.type, "UnaryExpression");
        assert.strictEqual(moduloCompoundUnary?.argument?.type, "Literal");
        assert.strictEqual(moduloCompoundUnary?.argument?.value, "1");

        const binaryFixes = binary?._appliedFeatherDiagnostics ?? [];
        const divideAssignFixes = assignment?._appliedFeatherDiagnostics ?? [];
        const moduloBinaryFixes =
            moduloBinary?._appliedFeatherDiagnostics ?? [];
        const moduloCompoundFixes =
            moduloCompound?._appliedFeatherDiagnostics ?? [];

        assert.strictEqual(
            binaryFixes.some((fix) => fix.id === "GM1015"),
            true
        );
        assert.strictEqual(
            divideAssignFixes.some((fix) => fix.id === "GM1015"),
            true
        );
        assert.strictEqual(
            moduloBinaryFixes.some((fix) => fix.id === "GM1015"),
            true
        );
        assert.strictEqual(
            moduloCompoundFixes.some((fix) => fix.id === "GM1015"),
            true
        );

        const applied = ast._appliedFeatherDiagnostics ?? [];
        const gm1015Fixes = applied.filter((entry) => entry.id === "GM1015");

        assert.strictEqual(gm1015Fixes.length >= 4, true);

        for (const entry of gm1015Fixes) {
            assert.strictEqual(entry.target, "0");
            assert.notStrictEqual(entry.range, null);
            assert.strictEqual(entry.automatic, true);
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
        const rootGM1016 = rootDiagnostics.filter(
            (entry) => entry.id === "GM1016"
        );
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

        const { sourceText, metadata } =
            preprocessSourceForFeatherFixes(source);

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
        assert.strictEqual(
            totalDeclaration.declarations?.[0]?.id?.name,
            "total"
        );

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
        const gm2064Fixes = recordedFixes.filter(
            (entry) => entry.id === "GM2064"
        );
        assert.strictEqual(gm2064Fixes.length, 1);
        assert.strictEqual(gm2064Fixes[0].target, "message");
        assert.strictEqual(gm2064Fixes[0].automatic, false);
    });

    it("inserts a file_find_close call before nested file_find_first invocations flagged by GM2031", () => {
        const source = [
            "var _look_for_description = true;",
            "",
            'var _file = file_find_first("/game_data/*.bin", fa_none);',
            "",
            "if (_look_for_description)",
            "{",
            '    _file2 = file_find_first("/game_data/*.json", fa_none);',
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

        const ifStatement = ast.body?.find(
            (node) => node?.type === "IfStatement"
        );
        assert.ok(ifStatement, "Expected an if statement in the parsed AST.");

        const consequentBody = ifStatement?.consequent?.body ?? [];
        assert.strictEqual(consequentBody.length, 2);

        const [firstStatement, secondStatement] = consequentBody;
        assert.strictEqual(firstStatement?.type, "CallExpression");
        assert.strictEqual(firstStatement?.object?.name, "file_find_close");

        const closeDiagnostics =
            firstStatement?._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            closeDiagnostics.some((entry) => entry.id === "GM2031"),
            true,
            "Expected GM2031 metadata on the inserted file_find_close call."
        );

        assert.strictEqual(secondStatement?.type, "AssignmentExpression");
        assert.strictEqual(secondStatement?.right?.type, "CallExpression");
        assert.strictEqual(
            secondStatement?.right?.object?.name,
            "file_find_first"
        );
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

        assert.strictEqual(
            body.length >= 4,
            true,
            "Expected temporaries to be hoisted before the call expression."
        );

        for (let index = 0; index < 3; index += 1) {
            const declaration = body[index];
            assert.ok(declaration);
            assert.strictEqual(declaration.type, "VariableDeclaration");

            const declarators = Array.isArray(declaration.declarations)
                ? declaration.declarations
                : [];
            assert.strictEqual(declarators.length, 1);

            const [declarator] = declarators;
            assert.strictEqual(declarator?.id?.type, "Identifier");
            assert.strictEqual(
                declarator?.id?.name,
                `__feather_call_arg_${index}`
            );
            assert.strictEqual(declarator?.init?.type, "CallExpression");

            const declarationDiagnostics =
                declaration._appliedFeatherDiagnostics ?? [];
            assert.strictEqual(
                declarationDiagnostics.some((entry) => entry.id === "GM2023"),
                true,
                "Expected GM2023 metadata on each hoisted declaration."
            );
        }

        const callStatement = body[body.length - 1];
        assert.ok(callStatement);
        assert.strictEqual(callStatement.type, "CallExpression");

        const args = Array.isArray(callStatement.arguments)
            ? callStatement.arguments
            : [];
        assert.strictEqual(args.length, 4);
        assert.strictEqual(args[0]?.type, "Identifier");
        assert.strictEqual(args[0]?.name, "vb");
        assert.strictEqual(args[1]?.name, "__feather_call_arg_0");
        assert.strictEqual(args[2]?.name, "__feather_call_arg_1");
        assert.strictEqual(args[3]?.name, "__feather_call_arg_2");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2023 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2023"
        );

        assert.ok(
            gm2023,
            "Expected GM2023 metadata to be recorded on the AST."
        );
        assert.strictEqual(gm2023.automatic, true);
        assert.strictEqual(gm2023.target, "vertex_position_3d");

        const callDiagnostics = callStatement._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            callDiagnostics.some((entry) => entry.id === "GM2023"),
            true,
            "Expected GM2023 metadata on the transformed call expression."
        );
    });

    it("coalesces undefined fallbacks flagged by GM2061", () => {
        const source = [
            "array = modify_array(array);",
            "",
            "if (array == undefined) array = [];"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const body = Array.isArray(ast.body) ? ast.body : [];
        assert.strictEqual(body.length, 1);

        const [assignment] = body;
        assert.ok(assignment);
        assert.strictEqual(assignment.type, "AssignmentExpression");
        assert.strictEqual(assignment.operator, "=");

        const coalesced = assignment.right;
        assert.ok(coalesced);
        assert.strictEqual(coalesced.type, "BinaryExpression");
        assert.strictEqual(coalesced.operator, "??");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2061 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2061"
        );
        assert.ok(
            gm2061,
            "Expected GM2061 metadata to be recorded on the AST."
        );
        assert.strictEqual(gm2061.automatic, true);
        assert.strictEqual(gm2061.target, "array");
        assert.ok(gm2061.range);

        const assignmentDiagnostics =
            assignment._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            assignmentDiagnostics.some((entry) => entry.id === "GM2061"),
            true
        );
    });

    it("replaces undefined guards with nullish assignment for GM2061", () => {
        const source = "if (value == undefined) value = compute();";

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const body = Array.isArray(ast.body) ? ast.body : [];
        assert.strictEqual(body.length, 1);

        const [assignment] = body;
        assert.ok(assignment);
        assert.strictEqual(assignment.type, "AssignmentExpression");
        assert.strictEqual(assignment.operator, "??=");

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2061 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2061"
        );
        assert.ok(
            gm2061,
            "Expected GM2061 metadata to be recorded on the AST."
        );
        assert.strictEqual(gm2061.target, "value");

        const assignmentDiagnostics =
            assignment._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            assignmentDiagnostics.some((entry) => entry.id === "GM2061"),
            true
        );
    });

    it("resets colour write enable after disabling channels and records metadata", () => {
        const source = [
            "/// Draw Event",
            "",
            "gpu_set_colourwriteenable(true, true, true, false);",
            "",
            "draw_sprite(sprite_index, 0, x, y);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const body = (ast.body ?? []).filter(
            (node) => node?.type !== "EmptyStatement"
        );
        assert.ok(
            body.length >= 3,
            "Expected colour write enable reset to be inserted."
        );

        const [disableCall, drawCall, resetCall] = body;

        assert.strictEqual(disableCall?.type, "CallExpression");
        assert.strictEqual(
            disableCall?.object?.name,
            "gpu_set_colourwriteenable"
        );
        assert.strictEqual(drawCall?.type, "CallExpression");
        assert.strictEqual(drawCall?.object?.name, "draw_sprite");
        assert.strictEqual(resetCall?.type, "CallExpression");
        assert.strictEqual(
            resetCall?.object?.name,
            "gpu_set_colourwriteenable"
        );

        const resetArgs = Array.isArray(resetCall?.arguments)
            ? resetCall.arguments
            : [];
        assert.strictEqual(resetArgs.length >= 4, true);
        for (let index = 0; index < 4; index += 1) {
            const argument = resetArgs[index];
            assert.strictEqual(argument?.type, "Literal");
            assert.strictEqual(argument?.value, "true");
        }

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2052 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2052"
        );

        assert.ok(
            gm2052,
            "Expected GM2052 metadata to be recorded on the AST."
        );
        assert.strictEqual(gm2052.automatic, true);
        assert.ok(gm2052.range);

        const callDiagnostics = resetCall?._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            callDiagnostics.some((entry) => entry.id === "GM2052"),
            true
        );
    });

    it("resets gpu_set_cullmode calls flagged by GM2051 and records metadata", () => {
        const source = [
            "/// Draw Event",
            "",
            "gpu_set_cullmode(cull_clockwise);",
            "",
            "vertex_submit(vb, pr_trianglelist, tex);"
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const body = ast.body ?? [];
        assert.strictEqual(body.length >= 3, true);

        const resetCall = body[1];
        assert.ok(resetCall);
        assert.strictEqual(resetCall.type, "CallExpression");
        assert.strictEqual(resetCall.object?.name, "gpu_set_cullmode");
        assert.strictEqual(resetCall.arguments?.[0]?.name, "cull_noculling");

        const callDiagnostics = resetCall._appliedFeatherDiagnostics ?? [];
        assert.strictEqual(
            callDiagnostics.some((entry) => entry.id === "GM2051"),
            true
        );

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2051 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2051"
        );
        assert.ok(
            gm2051,
            "Expected GM2051 metadata to be recorded on the AST."
        );
        assert.strictEqual(gm2051.automatic, true);
        assert.ok(gm2051.range);
    });

    it("balances gpu_push_state/gpu_pop_state pairs flagged by GM2042", () => {
        const source = [
            "if (situation_1)",
            "{",
            "    gpu_push_state();",
            "    gpu_push_state();",
            "",
            '    draw_text(x, y, "Hi");',
            "",
            "    gpu_pop_state();",
            "}",
            "",
            "if (situation_2)",
            "{",
            "    gpu_push_state();",
            "",
            "    draw_circle(x, y, 10, false);",
            "",
            "    gpu_pop_state();",
            "    gpu_pop_state();",
            "}",
            ""
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const [firstIf, secondIf] = ast.body ?? [];
        assert.ok(firstIf?.consequent?.type === "BlockStatement");
        assert.ok(secondIf?.consequent?.type === "BlockStatement");

        const firstBlockStatements = firstIf.consequent.body ?? [];
        const secondBlockStatements = secondIf.consequent.body ?? [];

        const firstBlockPushes = firstBlockStatements.filter(
            (node) =>
                node?.type === "CallExpression" &&
                node.object?.name === "gpu_push_state"
        );
        const firstBlockPops = firstBlockStatements.filter(
            (node) =>
                node?.type === "CallExpression" &&
                node.object?.name === "gpu_pop_state"
        );

        assert.strictEqual(firstBlockPushes.length, 2);
        assert.strictEqual(firstBlockPops.length, 2);

        const secondBlockPushes = secondBlockStatements.filter(
            (node) =>
                node?.type === "CallExpression" &&
                node.object?.name === "gpu_push_state"
        );
        const secondBlockPops = secondBlockStatements.filter(
            (node) =>
                node?.type === "CallExpression" &&
                node.object?.name === "gpu_pop_state"
        );

        assert.strictEqual(secondBlockPushes.length, 1);
        assert.strictEqual(secondBlockPops.length, 1);

        const appliedDiagnostics = ast._appliedFeatherDiagnostics ?? [];
        const gm2042 = appliedDiagnostics.find(
            (entry) => entry.id === "GM2042"
        );

        assert.ok(
            gm2042,
            "Expected GM2042 metadata to be recorded on the AST."
        );
        assert.strictEqual(gm2042.automatic, true);
    });

    it("removes orphaned event_inherited calls flagged by GM2040 and records metadata", () => {
        const source = [
            "/// Room Start Event",
            "",
            "if (should_run)",
            "{",
            "    event_inherited();",
            '    show_debug_message("branch");',
            "}",
            "",
            "event_inherited();",
            "",
            'show_debug_message("Ready");'
        ].join("\n");

        const ast = GMLParser.parse(source, {
            getLocations: true,
            simplifyLocations: false
        });

        applyFeatherFixes(ast, { sourceText: source });

        const statements = Array.isArray(ast.body) ? ast.body : [];
        assert.strictEqual(
            statements.some((statement) => isEventInheritedCall(statement)),
            false,
            "Expected top-level event_inherited calls to be removed."
        );

        const branch = statements.find(
            (statement) => statement?.type === "IfStatement"
        );
        assert.ok(branch);

        const branchBody = Array.isArray(branch?.consequent?.body)
            ? branch.consequent.body
            : [];
        assert.strictEqual(
            branchBody.some((statement) => isEventInheritedCall(statement)),
            false,
            "Expected event_inherited calls inside blocks to be removed."
        );

        const appliedDiagnostics = Array.isArray(ast._appliedFeatherDiagnostics)
            ? ast._appliedFeatherDiagnostics
            : [];
        const gm2040Fixes = appliedDiagnostics.filter(
            (entry) => entry.id === "GM2040"
        );

        assert.strictEqual(
            gm2040Fixes.length,
            2,
            "Expected two GM2040 fixes to be recorded."
        );

        for (const entry of gm2040Fixes) {
            assert.strictEqual(
                entry.automatic,
                true,
                "GM2040 fixes should be automatic."
            );
            assert.strictEqual(entry.target, "event_inherited");
            assert.ok(
                entry.range,
                "GM2040 fixes should include range metadata."
            );
        }
    });
});
