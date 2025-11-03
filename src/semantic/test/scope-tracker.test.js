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
