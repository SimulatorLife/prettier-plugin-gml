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
