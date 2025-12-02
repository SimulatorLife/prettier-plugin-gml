import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Parser } from "@gml-modules/parser";
import { Semantic } from "../index.js";

const { GMLParser } = Parser;

function collectIdentifiers(node: any) {
    const identifiers: any[] = [];
    const visited = new Set();

    function visit(value: any) {
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

function groupIdentifiersByName(identifiers: any[]) {
    const map = new Map<string, any[]>();

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

function parseWithMetadata(source: string) {
    return GMLParser.parse(source, {
        simplifyLocations: false,
        scopeTrackerOptions: {
            enabled: true,
            createScopeTracker: () => new Semantic.SemanticScopeCoordinator()
        }
    });
}

void describe("Parser Integration with Semantic Scope Tracker", () => {
    void it("annotates scopes for functions and loops", () => {
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
        assert.ok(counterNodes, "Expected counter identifiers to be present.");
        const counterDeclaration = counterNodes.find((node: any) =>
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

        const counterReferences = counterNodes.filter((node: any) =>
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
        const iDeclaration = iNodes.find((node: any) =>
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

        const iReferences = iNodes.filter((node: any) =>
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

    void it("uses a distinct scope for with statements", () => {
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
        const valueDeclaration = valueNodes.find((node: any) =>
            node.classifications.includes("declaration")
        );
        assert.ok(valueDeclaration, "Expected a declaration node for value.");

        const localNodes = byName.get("local");
        assert.ok(
            localNodes,
            "Expected local identifiers to be present inside with scope."
        );
        const localDeclaration = localNodes.find((node: any) =>
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

        const localReferences = localNodes.filter((node: any) =>
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
            (node: any) =>
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

    void it("marks macros as global declarations", () => {
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

    void it("associates enum members with their declarations", () => {
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
        const colorsDeclaration = colorsNodes.find((node: any) =>
            node.classifications.includes("declaration")
        );
        assert.ok(
            colorsDeclaration,
            "Expected a declaration for the enum name."
        );
        assert.ok(colorsDeclaration.classifications.includes("enum"));

        const colorsReference = colorsNodes.find((node: any) =>
            node.classifications.includes("reference")
        );
        assert.ok(colorsReference, "Expected a reference to the enum name.");
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
        const greenDeclaration = greenNodes.find((node: any) =>
            node.classifications.includes("declaration")
        );
        assert.ok(
            greenDeclaration,
            "Expected a declaration for the enum member."
        );
        assert.ok(greenDeclaration.classifications.includes("enum-member"));

        const greenReference = greenNodes.find((node: any) =>
            node.classifications.includes("reference")
        );
        assert.ok(greenReference, "Expected a reference to the enum member.");
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

    void it("parses enum member initializers referencing other enums", () => {
        const source = `
enum eTransitionState {
  idle,
  complete,
  delaying
}

enum eTransitionType {
  start = eTransitionState.idle,
  finish = eTransitionState.complete
}
`;

        const ast = parseWithMetadata(source);
        assert.ok(ast, "Parser returned no AST when parsing enum source.");

        const transitionEnum = ast.body.find((node: any) => {
            return (
                node &&
                node.type === "EnumDeclaration" &&
                node.name?.name === "eTransitionType"
            );
        });
        assert.ok(
            transitionEnum,
            "Expected to locate the eTransitionType enum declaration."
        );

        const members = transitionEnum.members;
        assert.ok(Array.isArray(members), "Enum members should be an array.");
        assert.strictEqual(
            members.length,
            2,
            "Expected the transition enum to define two members."
        );

        const [startMember, finishMember] = members;
        assert.ok(
            startMember?.initializer,
            "Expected the start member to include an initializer."
        );
        assert.strictEqual(
            startMember.initializer.type,
            "MemberDotExpression",
            "Start member initializer should be parsed as a member access expression."
        );
        assert.strictEqual(
            startMember.initializer.object?.name,
            "eTransitionState",
            "Member access should reference the transition state enum."
        );
        assert.strictEqual(
            startMember.initializer.property?.name,
            "idle",
            "Member access should point at the idle enum member."
        );
        assert.strictEqual(
            startMember.initializer._enumInitializerText,
            "eTransitionState.idle",
            "Initializer text should capture the referenced enum member."
        );

        assert.ok(
            finishMember?.initializer,
            "Expected the finish member to include an initializer."
        );
        assert.strictEqual(
            finishMember.initializer.type,
            "MemberDotExpression",
            "Finish member initializer should be parsed as a member access expression."
        );
        assert.strictEqual(
            finishMember.initializer.property?.name,
            "complete",
            "Finish initializer should target the complete enum member."
        );
    });

    void it("tracks struct member scopes independently from methods", () => {
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
        const healthDeclaration = healthNodes.find((node: any) =>
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
        const amountDeclaration = amountNodes.find((node: any) =>
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

        const healthReferences = healthNodes.filter((node: any) =>
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

        const amountReferences = amountNodes.filter((node: any) =>
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
