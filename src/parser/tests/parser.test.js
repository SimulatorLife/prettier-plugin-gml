import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it } from "node:test";

import GMLParser from "../gml-parser.js";
import GameMakerASTBuilder from "../src/gml-ast-builder.js";
import { getLineBreakCount } from "../../shared/utils/line-breaks.js";
import { getNodeStartIndex } from "../../shared/ast.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const fixturesDirectory = path.join(currentDirectory, "input");
const fixtureExtension = ".gml";
const fileEncoding = "utf8";

async function loadFixtures() {
    const entries = await fs.readdir(fixturesDirectory, {
        withFileTypes: true
    });

    return entries
        .filter(
            (entry) => entry.isFile() && entry.name.endsWith(fixtureExtension)
        )
        .map((entry) => entry.name)
        .sort();
}

async function readFixture(fileName) {
    const filePath = path.join(fixturesDirectory, fileName);
    const source = await fs.readFile(filePath, fileEncoding);

    if (typeof source !== "string") {
        throw new TypeError(
            `Expected fixture '${fileName}' to be read as a string.`
        );
    }

    return source;
}

function hasLocationInformation(node) {
    if (node === null || typeof node !== "object") {
        return false;
    }

    if (Object.hasOwn(node, "start") || Object.hasOwn(node, "end")) {
        return true;
    }

    for (const value of Object.values(node)) {
        if (hasLocationInformation(value)) {
            return true;
        }
    }

    return false;
}

function parseFixture(source, { suppressErrors = false, options } = {}) {
    if (!suppressErrors) {
        return GMLParser.parse(source, options);
    }

    const originalError = console.error;

    try {
        console.error = () => {};
        return GMLParser.parse(source, options);
    } finally {
        console.error = originalError;
    }
}

function collectIdentifiers(node) {
    const identifiers = [];
    const visited = new Set();

    function visit(value) {
        if (value === null || typeof value !== "object") {
            return;
        }

        if (visited.has(value)) {
            return;
        }

        visited.add(value);

        if (Array.isArray(value)) {
            for (const item of value) {
                visit(item);
            }
            return;
        }

        if (value.type === "Identifier") {
            identifiers.push(value);
        }

        for (const [key, child] of Object.entries(value)) {
            if (key === "start" || key === "end" || key === "declaration") {
                continue;
            }
            visit(child);
        }
    }

    visit(node);
    return identifiers;
}

function groupIdentifiersByName(identifiers) {
    const map = new Map();

    for (const identifier of identifiers) {
        if (!identifier || typeof identifier.name !== "string") {
            continue;
        }

        if (!map.has(identifier.name)) {
            map.set(identifier.name, []);
        }

        map.get(identifier.name).push(identifier);
    }

    return map;
}

function parseWithMetadata(source) {
    return GMLParser.parse(source, {
        getIdentifierMetadata: true,
        simplifyLocations: false
    });
}

const fixtureNames = await loadFixtures();
const expectedFailures = new Set([
    // Known parser gaps where the grammar currently rejects otherwise valid fixtures.
    "character_controller_step.gml",
    "cursed_gml.gml",
    "equals.gml",
    "expressions.gml",
    "loungeware.gml",
    "snap_deep_copy.gml"
]);
const successfulFixture = fixtureNames.find(
    (fixtureName) => !expectedFailures.has(fixtureName)
);

describe("GameMaker parser fixtures", () => {
    for (const fixtureName of fixtureNames) {
        it(`parses ${fixtureName}`, async () => {
            const source = await readFixture(fixtureName);
            const shouldFail = expectedFailures.has(fixtureName);

            if (shouldFail) {
                assert.throws(
                    () => parseFixture(source, { suppressErrors: true }),
                    /Syntax Error/,
                    `Parser unexpectedly produced an AST for ${fixtureName}.`
                );
                return;
            }

            const ast = parseFixture(source);

            assert.ok(ast, `Parser returned no AST for ${fixtureName}.`);
            assert.strictEqual(
                ast.type,
                "Program",
                `Unexpected root node type for ${fixtureName}.`
            );
            assert.ok(
                Array.isArray(ast.body),
                `AST body for ${fixtureName} is not an array.`
            );
        });
    }

    it("parses integer literals with leading zeros", () => {
        const source = "function example() {\n    var value = 007;\n}";

        assert.doesNotThrow(() => parseFixture(source));
    });

    it("omits location metadata when disabled", async () => {
        const fixtureName = successfulFixture;

        assert.ok(
            fixtureName,
            "Expected at least one parser fixture to be present."
        );

        const source = await readFixture(fixtureName);
        const astWithoutLocations = parseFixture(source, {
            options: { getLocations: false }
        });

        assert.ok(
            astWithoutLocations,
            "Parser returned no AST when locations were disabled."
        );
        assert.strictEqual(
            hasLocationInformation(astWithoutLocations),
            false,
            "AST unexpectedly contains location metadata when getLocations is false."
        );
    });

    it("does not mutate inherited nodes when stripping location metadata", () => {
        const prototypeNode = {
            inherited: {
                start: { index: 1 },
                end: { index: 2 }
            }
        };

        const ast = Object.create(prototypeNode);
        ast.own = {
            start: { index: 3 },
            end: { index: 4 }
        };

        const parser = new GMLParser("", {});
        const prototypeSnapshot = structuredClone(prototypeNode);

        parser.removeLocationInfo(ast);

        assert.deepStrictEqual(
            prototypeNode,
            prototypeSnapshot,
            "Expected prototype nodes to remain untouched when stripping locations."
        );
        assert.deepStrictEqual(
            ast.own,
            {},
            "Expected own nodes to have location metadata removed."
        );
    });

    it("counts CRLF sequences as a single line break", () => {
        assert.strictEqual(
            getLineBreakCount("\r\n"),
            1,
            "Expected CRLF sequences to count as a single line break."
        );
    });

    it("builds identifier locations from available token offsets", () => {
        const builder = new GameMakerASTBuilder();
        const location = builder.createIdentifierLocation({
            line: 3,
            column: 7,
            start: 42,
            stop: 45
        });

        assert.deepStrictEqual(location, {
            start: { line: 3, index: 42, column: 7 },
            end: { line: 3, index: 46, column: 11 }
        });
    });

    it("falls back to startIndex and stopIndex when primary offsets are missing", () => {
        const builder = new GameMakerASTBuilder();
        const location = builder.createIdentifierLocation({
            line: 2,
            startIndex: 5,
            stopIndex: 9
        });

        assert.deepStrictEqual(location, {
            start: { line: 2, index: 5 },
            end: { line: 2, index: 10 }
        });
    });

    it("tracks comment locations correctly when using CRLF", () => {
        const source = "/*first\r\nsecond*/";
        const ast = GMLParser.parse(source, {
            getComments: true,
            getLocations: true,
            simplifyLocations: false
        });

        assert.ok(
            ast,
            "Parser returned no AST when parsing CRLF comment source."
        );
        assert.ok(
            Array.isArray(ast.comments),
            "Expected parser to return comments array."
        );
        const [comment] = ast.comments;

        assert.ok(comment, "Expected at least one comment to be returned.");
        assert.strictEqual(
            comment.start.line,
            1,
            "Comment start line should be unaffected by CRLF."
        );
        assert.strictEqual(
            comment.end.line,
            2,
            "Comment end line should advance by a single line for a CRLF sequence."
        );
    });

    it("captures the full range of member access expressions", () => {
        const source =
            "function demo(arg = namespace.value) {\n  return arg;\n}\n";
        const ast = parseFixture(source, {
            options: { getLocations: true, simplifyLocations: false }
        });

        assert.ok(
            ast,
            "Parser returned no AST when parsing member access source."
        );
        const [fn] = ast.body;
        assert.ok(
            fn && fn.type === "FunctionDeclaration",
            "Expected a function declaration."
        );

        const [param] = fn.params;
        assert.ok(
            param && param.type === "DefaultParameter",
            "Expected a default parameter."
        );
        const memberExpression = param.right;
        assert.ok(
            memberExpression && memberExpression.type === "MemberDotExpression",
            "Expected a member access default value."
        );

        const expectedStart = source.indexOf("namespace");
        assert.ok(
            expectedStart !== -1,
            "Unable to locate member expression start in source."
        );
        assert.strictEqual(
            getNodeStartIndex(memberExpression),
            expectedStart,
            "Member expression start should include the object portion."
        );
    });

    it("retains 'globalvar' declarations in the AST", () => {
        const source = "globalvar foo, bar;\nfoo = 1;\n";
        const ast = parseFixture(source, { options: { getLocations: true } });

        assert.ok(ast, "Parser returned no AST when parsing globalvar source.");
        const [statement] = ast.body;

        assert.ok(statement, "Expected a globalvar statement to be present.");
        assert.strictEqual(
            statement.type,
            "GlobalVarStatement",
            "Expected a GlobalVarStatement node in the AST."
        );
        assert.strictEqual(
            statement.kind,
            "globalvar",
            "GlobalVarStatement should preserve the 'globalvar' keyword."
        );
        assert.ok(
            Array.isArray(statement.declarations),
            "GlobalVarStatement should expose declarations."
        );
        assert.strictEqual(
            statement.declarations.length,
            2,
            "Expected two global declarations."
        );
        assert.deepStrictEqual(
            statement.declarations.map((declaration) => declaration?.id?.name),
            ["foo", "bar"],
            "Global declarations should retain their names."
        );
    });

    describe("identifier metadata", () => {
        it("annotates scopes for functions and loops", () => {
            const source = `
function demo(param) {
  var counter = param;
  for (var i = 0; i < 3; i += 1) {
    counter += i;
  }
  return counter;
}
`;

            const ast = parseWithMetadata(source);
            assert.ok(
                ast,
                "Parser returned no AST when gathering identifier metadata."
            );

            const identifiers = collectIdentifiers(ast);
            const byName = groupIdentifiersByName(identifiers);

            const counterNodes = byName.get("counter");
            assert.ok(
                counterNodes,
                "Expected counter identifiers to be present."
            );
            const counterDeclaration = counterNodes.find((node) =>
                node.classifications.includes("declaration")
            );
            assert.ok(
                counterDeclaration,
                "Expected a declaration node for counter."
            );
            assert.ok(
                counterDeclaration.classifications.includes("variable"),
                "Counter declaration should be classified as a variable."
            );
            assert.ok(counterDeclaration.declaration);
            assert.ok(counterDeclaration.scopeId);
            assert.strictEqual(
                counterDeclaration.scopeId,
                counterDeclaration.declaration.scopeId,
                "Declaration metadata should record the scope of the declaration itself."
            );

            const counterReferences = counterNodes.filter((node) =>
                node.classifications.includes("reference")
            );
            assert.strictEqual(
                counterReferences.length,
                2,
                "Expected two references to the counter variable."
            );
            for (const reference of counterReferences) {
                assert.strictEqual(
                    reference.scopeId,
                    counterDeclaration.scopeId,
                    "Counter references should share the function scope."
                );
                assert.ok(
                    reference.declaration,
                    "References should record declaration metadata."
                );
                assert.deepStrictEqual(
                    reference.declaration.start,
                    counterDeclaration.start,
                    "Reference metadata should point to the declaration start position."
                );
                assert.deepStrictEqual(
                    reference.declaration.end,
                    counterDeclaration.end,
                    "Reference metadata should point to the declaration end position."
                );
                assert.ok(
                    reference.classifications.includes("variable"),
                    "References should inherit variable classification tags."
                );
            }

            const iNodes = byName.get("i");
            assert.ok(iNodes, "Expected loop identifiers to be present.");
            const iDeclaration = iNodes.find((node) =>
                node.classifications.includes("declaration")
            );
            assert.ok(
                iDeclaration,
                "Expected a declaration node for the loop variable."
            );
            assert.ok(
                iDeclaration.classifications.includes("variable"),
                "Loop variable should be classified as a variable."
            );
            assert.strictEqual(
                iDeclaration.scopeId,
                counterDeclaration.scopeId,
                "Loop initializer should share the surrounding function scope."
            );

            const iReferences = iNodes.filter((node) =>
                node.classifications.includes("reference")
            );
            assert.ok(
                iReferences.length > 0,
                "Expected references to the loop variable."
            );
            for (const reference of iReferences) {
                assert.ok(reference.declaration);
                assert.strictEqual(
                    reference.declaration.scopeId,
                    iDeclaration.scopeId,
                    "Loop references should resolve to the loop declaration scope."
                );
                assert.ok(
                    reference.classifications.includes("variable"),
                    "Loop references should inherit the variable classification."
                );
            }
        });

        it("uses a distinct scope for with statements", () => {
            const source = `
var value = 1;
with (target) {
  var local = value;
  local += local;
}
`;

            const ast = parseWithMetadata(source);
            assert.ok(
                ast,
                "Parser returned no AST when parsing with statement source."
            );

            const identifiers = collectIdentifiers(ast);
            const byName = groupIdentifiersByName(identifiers);

            const valueNodes = byName.get("value");
            assert.ok(valueNodes, "Expected value identifiers to be present.");
            const valueDeclaration = valueNodes.find((node) =>
                node.classifications.includes("declaration")
            );
            assert.ok(
                valueDeclaration,
                "Expected a declaration node for value."
            );

            const localNodes = byName.get("local");
            assert.ok(
                localNodes,
                "Expected local identifiers to be present inside with scope."
            );
            const localDeclaration = localNodes.find((node) =>
                node.classifications.includes("declaration")
            );
            assert.ok(
                localDeclaration,
                "Expected a declaration for the with-scoped variable."
            );
            assert.notStrictEqual(
                localDeclaration.scopeId,
                valueDeclaration.scopeId,
                "With-scoped declarations should not share the global scope."
            );

            const localReferences = localNodes.filter((node) =>
                node.classifications.includes("reference")
            );
            assert.strictEqual(
                localReferences.length,
                2,
                "Expected two references to the with-scoped variable."
            );
            for (const reference of localReferences) {
                assert.strictEqual(
                    reference.scopeId,
                    localDeclaration.scopeId,
                    "References inside the with block should share the with scope."
                );
                assert.ok(reference.declaration);
                assert.strictEqual(
                    reference.declaration.scopeId,
                    localDeclaration.scopeId,
                    "With references should resolve to the local declaration scope."
                );
            }

            const valueReferenceInWith = valueNodes.find(
                (node) =>
                    node.classifications.includes("reference") &&
                    node.scopeId === localDeclaration.scopeId
            );
            assert.ok(
                valueReferenceInWith,
                "Expected the with block to reference the outer scoped variable."
            );
            assert.ok(valueReferenceInWith.declaration);
            assert.strictEqual(
                valueReferenceInWith.declaration.scopeId,
                valueDeclaration.scopeId,
                "Outer variable references should resolve to their original scope."
            );
        });

        it("marks macros as global declarations", () => {
            const source = "#macro MAX_ENEMIES 8";
            const ast = parseWithMetadata(source);

            assert.ok(ast, "Parser returned no AST when parsing macro source.");

            const identifiers = collectIdentifiers(ast);
            assert.strictEqual(
                identifiers.length,
                1,
                "Expected a single identifier representing the macro name."
            );
            const [macro] = identifiers;

            assert.strictEqual(macro.name, "MAX_ENEMIES");
            assert.ok(macro.classifications.includes("macro"));
            assert.ok(macro.classifications.includes("global"));
            assert.ok(macro.classifications.includes("declaration"));
            assert.ok(
                macro.scopeId,
                "Macro declarations should record a scope identifier."
            );
            assert.ok(
                macro.scopeId.startsWith("scope-"),
                "Macro declarations should be assigned to the global scope."
            );
        });

        it("associates enum members with their declarations", () => {
            const source = `
enum Colors {
  Red = 1,
  Green
}
var shade = Colors.Green;
`;

            const ast = parseWithMetadata(source);
            assert.ok(ast, "Parser returned no AST when parsing enum source.");

            const identifiers = collectIdentifiers(ast);
            const byName = groupIdentifiersByName(identifiers);

            const colorsNodes = byName.get("Colors");
            assert.ok(colorsNodes, "Expected enum identifiers to be present.");
            const colorsDeclaration = colorsNodes.find((node) =>
                node.classifications.includes("declaration")
            );
            assert.ok(
                colorsDeclaration,
                "Expected a declaration for the enum name."
            );
            assert.ok(colorsDeclaration.classifications.includes("enum"));

            const colorsReference = colorsNodes.find((node) =>
                node.classifications.includes("reference")
            );
            assert.ok(
                colorsReference,
                "Expected a reference to the enum name."
            );
            assert.ok(colorsReference.declaration);
            assert.deepStrictEqual(
                colorsReference.declaration.start,
                colorsDeclaration.start,
                "Enum references should resolve to the enum declaration."
            );
            assert.ok(colorsReference.classifications.includes("enum"));

            const greenNodes = byName.get("Green");
            assert.ok(
                greenNodes,
                "Expected enum member identifiers to be present."
            );
            const greenDeclaration = greenNodes.find((node) =>
                node.classifications.includes("declaration")
            );
            assert.ok(
                greenDeclaration,
                "Expected a declaration for the enum member."
            );
            assert.ok(greenDeclaration.classifications.includes("enum-member"));

            const greenReference = greenNodes.find((node) =>
                node.classifications.includes("reference")
            );
            assert.ok(
                greenReference,
                "Expected a reference to the enum member."
            );
            assert.ok(greenReference.declaration);
            assert.strictEqual(
                greenReference.declaration.scopeId,
                greenDeclaration.scopeId,
                "Enum member references should resolve within the enum scope."
            );
            assert.ok(greenReference.classifications.includes("enum-member"));
            assert.ok(
                greenReference.classifications.includes("property"),
                "Member access should retain property classification tags."
            );
        });

        it("tracks struct member scopes independently from methods", () => {
            const source = `
function Player() constructor {
  var health = 100;
  function heal(amount) {
    health += amount;
  }
}
`;

            const ast = parseWithMetadata(source);
            assert.ok(
                ast,
                "Parser returned no AST when parsing struct constructor source."
            );

            const identifiers = collectIdentifiers(ast);
            const byName = groupIdentifiersByName(identifiers);

            const healthNodes = byName.get("health");
            assert.ok(
                healthNodes,
                "Expected struct member identifiers to be present."
            );
            const healthDeclaration = healthNodes.find((node) =>
                node.classifications.includes("declaration")
            );
            assert.ok(
                healthDeclaration,
                "Expected a declaration for the struct member."
            );

            const amountNodes = byName.get("amount");
            assert.ok(
                amountNodes,
                "Expected function parameter identifiers to be present."
            );
            const amountDeclaration = amountNodes.find((node) =>
                node.classifications.includes("declaration")
            );
            assert.ok(
                amountDeclaration,
                "Expected a declaration for the method parameter."
            );
            assert.notStrictEqual(
                healthDeclaration.scopeId,
                amountDeclaration.scopeId,
                "Struct members should reside outside the method scope."
            );

            const healthReferences = healthNodes.filter((node) =>
                node.classifications.includes("reference")
            );
            assert.ok(
                healthReferences.length > 0,
                "Expected references to the struct member."
            );
            for (const reference of healthReferences) {
                assert.ok(reference.declaration);
                assert.strictEqual(
                    reference.declaration.scopeId,
                    healthDeclaration.scopeId,
                    "Struct member references should resolve to the constructor scope."
                );
                assert.strictEqual(
                    reference.scopeId,
                    amountDeclaration.scopeId,
                    "Struct member references should occur within the method scope."
                );
                assert.ok(reference.classifications.includes("variable"));
            }

            const amountReferences = amountNodes.filter((node) =>
                node.classifications.includes("reference")
            );
            assert.ok(
                amountReferences.length > 0,
                "Expected references to the parameter."
            );
            for (const reference of amountReferences) {
                assert.ok(reference.declaration);
                assert.strictEqual(
                    reference.declaration.scopeId,
                    amountDeclaration.scopeId,
                    "Parameter references should resolve to the method scope."
                );
                assert.ok(reference.classifications.includes("parameter"));
            }
        });
    });
});
