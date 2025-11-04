import test from "node:test";
import assert from "node:assert/strict";

import ScopeTracker from "../src/scopes/scope-tracker.js";
import { ScopeOverrideKeyword } from "../src/scopes/scope-override-keywords.js";

test("resolveScopeOverride returns the root scope when using the global keyword", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("root");
    tracker.enterScope("child");

    const result = tracker.resolveScopeOverride(ScopeOverrideKeyword.GLOBAL);

    assert.strictEqual(result, rootScope);
});

test("resolveScopeOverride returns a scope that matches an explicit identifier", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("root");
    const explicitScope = tracker.enterScope("explicit");

    const result = tracker.resolveScopeOverride(explicitScope.id);

    assert.strictEqual(result, explicitScope);
});

test("resolveScopeOverride throws when given an unknown string keyword", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("root");

    assert.throws(
        () => tracker.resolveScopeOverride("GLOBAL"),
        (error) => {
            assert.ok(error instanceof RangeError);
            assert.match(
                error.message,
                /Unknown scope override string 'GLOBAL'.*scope identifier\./
            );
            return true;
        }
    );
});

test("exportOccurrences captures declarations and references by scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const programScope = tracker.enterScope("program");
    const declarationNode = {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 3 }
    };

    tracker.declare("foo", declarationNode, {
        kind: "variable",
        tags: ["local"]
    });

    const blockScope = tracker.enterScope("block");
    const referenceNode = {
        start: { line: 2, index: 4 },
        end: { line: 2, index: 7 }
    };

    tracker.reference("foo", referenceNode, {
        kind: "variable"
    });

    tracker.exitScope();
    tracker.exitScope();

    assert.deepStrictEqual(tracker.exportOccurrences(), [
        {
            scopeId: programScope.id,
            scopeKind: "program",
            identifiers: [
                {
                    name: "foo",
                    declarations: [
                        {
                            kind: "declaration",
                            name: "foo",
                            scopeId: programScope.id,
                            classifications: [
                                "identifier",
                                "declaration",
                                "variable",
                                "local"
                            ],
                            declaration: {
                                scopeId: programScope.id,
                                start: { line: 1, index: 0 },
                                end: { line: 1, index: 3 }
                            },
                            start: { line: 1, index: 0 },
                            end: { line: 1, index: 3 }
                        }
                    ],
                    references: []
                }
            ]
        },
        {
            scopeId: blockScope.id,
            scopeKind: "block",
            identifiers: [
                {
                    name: "foo",
                    declarations: [],
                    references: [
                        {
                            kind: "reference",
                            name: "foo",
                            scopeId: blockScope.id,
                            classifications: [
                                "identifier",
                                "reference",
                                "variable",
                                "local"
                            ],
                            declaration: {
                                scopeId: programScope.id,
                                start: { line: 1, index: 0 },
                                end: { line: 1, index: 3 }
                            },
                            start: { line: 2, index: 4 },
                            end: { line: 2, index: 7 }
                        }
                    ]
                }
            ]
        }
    ]);
});

test("exportOccurrences can omit references and returns cloned metadata", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");
    const declarationNode = {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 3 }
    };

    tracker.declare("bar", declarationNode);

    const referenceNode = {
        start: { line: 2, index: 1 },
        end: { line: 2, index: 4 }
    };

    tracker.reference("bar", referenceNode);

    tracker.exitScope();

    const expected = [
        {
            scopeId: scope.id,
            scopeKind: "program",
            identifiers: [
                {
                    name: "bar",
                    declarations: [
                        {
                            kind: "declaration",
                            name: "bar",
                            scopeId: scope.id,
                            classifications: ["identifier", "declaration"],
                            declaration: {
                                scopeId: scope.id,
                                start: { line: 1, index: 0 },
                                end: { line: 1, index: 3 }
                            },
                            start: { line: 1, index: 0 },
                            end: { line: 1, index: 3 }
                        }
                    ],
                    references: []
                }
            ]
        }
    ];

    const occurrences = tracker.exportOccurrences({ includeReferences: false });

    assert.deepStrictEqual(occurrences, expected);

    occurrences[0].identifiers[0].declarations[0].classifications.push(
        "mutated"
    );

    assert.deepStrictEqual(
        tracker.exportOccurrences({ includeReferences: false }),
        expected
    );
});

test("getSymbolOccurrences finds all occurrences of a symbol across scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("root");

    tracker.declare(
        "shared",
        { start: { line: 1, index: 0 }, end: { line: 1, index: 6 } },
        { kind: "variable", tags: ["global"] }
    );

    const childScope = tracker.enterScope("child");

    tracker.reference(
        "shared",
        { start: { line: 3, index: 0 }, end: { line: 3, index: 6 } },
        { kind: "variable" }
    );

    tracker.declare(
        "local",
        { start: { line: 4, index: 0 }, end: { line: 4, index: 5 } },
        { kind: "variable", tags: ["local"] }
    );

    tracker.exitScope();
    tracker.exitScope();

    const sharedOccurrences = tracker.getSymbolOccurrences("shared");
    const localOccurrences = tracker.getSymbolOccurrences("local");

    assert.strictEqual(sharedOccurrences.length, 2);
    assert.strictEqual(
        sharedOccurrences.filter((o) => o.kind === "declaration").length,
        1
    );
    assert.strictEqual(
        sharedOccurrences.filter((o) => o.kind === "reference").length,
        1
    );

    assert.strictEqual(localOccurrences.length, 1);
    assert.strictEqual(localOccurrences[0].kind, "declaration");
    assert.strictEqual(localOccurrences[0].scopeId, childScope.id);
});

test("getSymbolOccurrences returns empty array when disabled", () => {
    const tracker = new ScopeTracker({ enabled: false });

    const result = tracker.getSymbolOccurrences("any");

    assert.deepStrictEqual(result, []);
});

test("getSymbolOccurrences returns empty array for non-existent symbol", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("root");
    tracker.declare("exists", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 6 }
    });
    tracker.exitScope();

    const result = tracker.getSymbolOccurrences("nonexistent");

    assert.deepStrictEqual(result, []);
});

test("getScopeSymbols returns all unique symbol names in a scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("function");

    tracker.declare("param1", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 6 }
    });
    tracker.declare("param2", {
        start: { line: 1, index: 8 },
        end: { line: 1, index: 14 }
    });
    tracker.reference("param1", {
        start: { line: 3, index: 0 },
        end: { line: 3, index: 6 }
    });

    tracker.exitScope();

    const symbols = tracker.getScopeSymbols(scope.id);

    assert.deepStrictEqual([...symbols].sort(), ["param1", "param2"]);
});

test("getScopeSymbols returns empty array for non-existent scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("root");
    tracker.exitScope();

    const result = tracker.getScopeSymbols("nonexistent-scope");

    assert.deepStrictEqual(result, []);
});

test("getScopeSymbols returns empty array when disabled", () => {
    const tracker = new ScopeTracker({ enabled: false });

    const result = tracker.getScopeSymbols("any-scope");

    assert.deepStrictEqual(result, []);
});

test("resolveIdentifier finds declaration in current scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("block");

    tracker.declare("localVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 8 }
    });

    const result = tracker.resolveIdentifier("localVar", scope.id);

    assert.ok(result);
    assert.strictEqual(result.name, "localVar");
    assert.strictEqual(result.scopeId, scope.id);
});

test("resolveIdentifier walks up scope chain to find declaration", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const outerScope = tracker.enterScope("function");

    tracker.declare("outerVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 8 }
    });

    const innerScope = tracker.enterScope("block");

    tracker.declare("innerVar", {
        start: { line: 3, index: 0 },
        end: { line: 3, index: 8 }
    });

    const outerResult = tracker.resolveIdentifier("outerVar", innerScope.id);
    const innerResult = tracker.resolveIdentifier("innerVar", innerScope.id);

    assert.ok(outerResult);
    assert.strictEqual(outerResult.name, "outerVar");
    assert.strictEqual(outerResult.scopeId, outerScope.id);

    assert.ok(innerResult);
    assert.strictEqual(innerResult.name, "innerVar");
    assert.strictEqual(innerResult.scopeId, innerScope.id);
});

test("resolveIdentifier respects shadowing", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("outer");

    tracker.declare("shadowed", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 8 }
    });

    const innerScope = tracker.enterScope("inner");

    tracker.declare("shadowed", {
        start: { line: 3, index: 0 },
        end: { line: 3, index: 8 }
    });

    const result = tracker.resolveIdentifier("shadowed", innerScope.id);

    assert.ok(result);
    assert.strictEqual(result.scopeId, innerScope.id);
    assert.strictEqual(result.start.line, 3);
});

test("resolveIdentifier uses current scope when scopeId omitted", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("outer");

    tracker.declare("var1", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 4 }
    });

    const innerScope = tracker.enterScope("inner");

    tracker.declare("var2", {
        start: { line: 2, index: 0 },
        end: { line: 2, index: 4 }
    });

    const result1 = tracker.resolveIdentifier("var1");
    const result2 = tracker.resolveIdentifier("var2");

    assert.ok(result1);
    assert.strictEqual(result1.name, "var1");

    assert.ok(result2);
    assert.strictEqual(result2.name, "var2");
    assert.strictEqual(result2.scopeId, innerScope.id);
});

test("resolveIdentifier returns null for non-existent identifier", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("block");

    tracker.declare("exists", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 6 }
    });

    const result = tracker.resolveIdentifier("nonexistent", scope.id);

    assert.strictEqual(result, null);
});

test("resolveIdentifier returns null when disabled", () => {
    const tracker = new ScopeTracker({ enabled: false });

    const result = tracker.resolveIdentifier("any");

    assert.strictEqual(result, null);
});

test("getScopeChain returns chain from scope to root", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");
    const functionScope = tracker.enterScope("function");
    const blockScope = tracker.enterScope("block");

    const chain = tracker.getScopeChain(blockScope.id);

    assert.deepStrictEqual(chain, [
        { id: blockScope.id, kind: "block" },
        { id: functionScope.id, kind: "function" },
        { id: rootScope.id, kind: "program" }
    ]);
});

test("getScopeChain returns single entry for root scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");

    const chain = tracker.getScopeChain(rootScope.id);

    assert.deepStrictEqual(chain, [{ id: rootScope.id, kind: "program" }]);
});

test("getScopeChain returns empty array for non-existent scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const result = tracker.getScopeChain("nonexistent-scope");

    assert.deepStrictEqual(result, []);
});

test("getScopeChain returns empty array when disabled", () => {
    const tracker = new ScopeTracker({ enabled: false });

    const result = tracker.getScopeChain("any-scope");

    assert.deepStrictEqual(result, []);
});

test("getScopeChain works after exiting scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");
    const functionScope = tracker.enterScope("function");
    const blockScope = tracker.enterScope("block");
    tracker.exitScope();
    tracker.exitScope();

    const chain = tracker.getScopeChain(blockScope.id);

    assert.deepStrictEqual(chain, [
        { id: blockScope.id, kind: "block" },
        { id: functionScope.id, kind: "function" },
        { id: rootScope.id, kind: "program" }
    ]);
});

test("getScopeDefinitions returns declarations defined in specific scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const outerScope = tracker.enterScope("function");

    tracker.declare("outerVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 8 }
    });

    const innerScope = tracker.enterScope("block");

    tracker.declare("innerVar", {
        start: { line: 3, index: 0 },
        end: { line: 3, index: 8 }
    });

    tracker.declare("anotherInner", {
        start: { line: 4, index: 0 },
        end: { line: 4, index: 12 }
    });

    const outerDefs = tracker.getScopeDefinitions(outerScope.id);
    const innerDefs = tracker.getScopeDefinitions(innerScope.id);

    assert.strictEqual(outerDefs.length, 1);
    assert.strictEqual(outerDefs[0].name, "outerVar");
    assert.strictEqual(outerDefs[0].metadata.scopeId, outerScope.id);

    assert.strictEqual(innerDefs.length, 2);
    const innerNames = innerDefs.map((d) => d.name).sort();
    assert.deepStrictEqual(innerNames, ["anotherInner", "innerVar"]);
});

test("getScopeDefinitions returns empty array for non-existent scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const result = tracker.getScopeDefinitions("nonexistent-scope");

    assert.deepStrictEqual(result, []);
});

test("getScopeDefinitions returns empty array when disabled", () => {
    const tracker = new ScopeTracker({ enabled: false });

    const result = tracker.getScopeDefinitions("any-scope");

    assert.deepStrictEqual(result, []);
});

test("getScopeDefinitions returns cloned metadata", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("function");

    tracker.declare("testVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 7 }
    });

    const defs1 = tracker.getScopeDefinitions(scope.id);
    defs1[0].metadata.mutated = true;

    const defs2 = tracker.getScopeDefinitions(scope.id);

    assert.strictEqual(defs2[0].metadata.mutated, undefined);
});

test("getScopeDepth returns 0 for root scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");

    const depth = tracker.getScopeDepth(rootScope.id);

    assert.strictEqual(depth, 0);
});

test("getScopeDepth returns correct depth for nested scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");
    const functionScope = tracker.enterScope("function");
    const blockScope = tracker.enterScope("block");
    const innerBlockScope = tracker.enterScope("block");

    assert.strictEqual(tracker.getScopeDepth(rootScope.id), 0);
    assert.strictEqual(tracker.getScopeDepth(functionScope.id), 1);
    assert.strictEqual(tracker.getScopeDepth(blockScope.id), 2);
    assert.strictEqual(tracker.getScopeDepth(innerBlockScope.id), 3);
});

test("getScopeDepth returns null for non-existent scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const depth = tracker.getScopeDepth("nonexistent-scope");

    assert.strictEqual(depth, null);
});

test("getScopeDepth returns null when disabled", () => {
    const tracker = new ScopeTracker({ enabled: false });

    const depth = tracker.getScopeDepth("any-scope");

    assert.strictEqual(depth, null);
});

test("getScopeDepth works after exiting scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");
    const functionScope = tracker.enterScope("function");
    tracker.exitScope();

    const rootDepth = tracker.getScopeDepth(rootScope.id);
    const functionDepth = tracker.getScopeDepth(functionScope.id);

    assert.strictEqual(rootDepth, 0);
    assert.strictEqual(functionDepth, 1);
});

test("getDescendantScopes returns all nested scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");
    const functionScope = tracker.enterScope("function");
    const blockScope1 = tracker.enterScope("block");
    tracker.exitScope();
    const blockScope2 = tracker.enterScope("block");
    const innerBlockScope = tracker.enterScope("block");

    const descendants = tracker.getDescendantScopes(rootScope.id);

    assert.strictEqual(descendants.length, 4);
    assert.deepStrictEqual(
        descendants.map((d) => d.id),
        [functionScope.id, blockScope1.id, blockScope2.id, innerBlockScope.id]
    );
});

test("getDescendantScopes returns scopes ordered by depth", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");
    const functionScope = tracker.enterScope("function");
    const blockScope = tracker.enterScope("block");
    const innerBlockScope = tracker.enterScope("block");

    const descendants = tracker.getDescendantScopes(rootScope.id);

    assert.strictEqual(descendants.length, 3);
    assert.strictEqual(descendants[0].depth, 1);
    assert.strictEqual(descendants[1].depth, 2);
    assert.strictEqual(descendants[2].depth, 3);
    assert.deepStrictEqual(
        descendants.map((d) => d.id),
        [functionScope.id, blockScope.id, innerBlockScope.id]
    );
});

test("getDescendantScopes returns empty array for leaf scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");
    const leafScope = tracker.enterScope("block");

    const descendants = tracker.getDescendantScopes(leafScope.id);

    assert.deepStrictEqual(descendants, []);
});

test("getDescendantScopes returns only direct subtree", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");
    const branchA = tracker.enterScope("function");
    const branchAChild = tracker.enterScope("block");
    tracker.exitScope();
    tracker.exitScope();
    const branchB = tracker.enterScope("function");
    const branchBChild = tracker.enterScope("block");

    const descendantsA = tracker.getDescendantScopes(branchA.id);
    const descendantsB = tracker.getDescendantScopes(branchB.id);

    assert.strictEqual(descendantsA.length, 1);
    assert.strictEqual(descendantsA[0].id, branchAChild.id);

    assert.strictEqual(descendantsB.length, 1);
    assert.strictEqual(descendantsB[0].id, branchBChild.id);
});

test("getDescendantScopes returns empty array for non-existent scope", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");

    const descendants = tracker.getDescendantScopes("nonexistent-scope");

    assert.deepStrictEqual(descendants, []);
});

test("getDescendantScopes returns empty array when disabled", () => {
    const tracker = new ScopeTracker({ enabled: false });

    const descendants = tracker.getDescendantScopes("any-scope");

    assert.deepStrictEqual(descendants, []);
});

test("getDescendantScopes includes scope kind and depth", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");
    const functionScope = tracker.enterScope("function");
    const blockScope = tracker.enterScope("block");

    const descendants = tracker.getDescendantScopes(rootScope.id);

    assert.strictEqual(descendants.length, 2);
    assert.deepStrictEqual(descendants[0], {
        id: functionScope.id,
        kind: "function",
        depth: 1
    });
    assert.deepStrictEqual(descendants[1], {
        id: blockScope.id,
        kind: "block",
        depth: 2
    });
});
