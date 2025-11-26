import test from "node:test";
import assert from "node:assert/strict";
import ScopeTracker from "../src/scopes/scope-tracker.js";
import { ScopeOverrideKeyword } from "../src/scopes/index.js";

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
    const {
        tracker,
        programScope,
        blockScope,
        declarationRange,
        referenceRange
    } = createTrackerWithDeclarationAndReference();

    const expected = buildDeclarationAndReferenceSnapshot({
        name: "foo",
        programScopeId: programScope.id,
        blockScopeId: blockScope.id,
        declarationRange,
        referenceRange
    });

    assert.deepStrictEqual(tracker.exportOccurrences(), expected);
});

test("exportOccurrences can omit references and returns cloned metadata", () => {
    const { tracker, scope, declarationRange } = createSingleScopeTracker("bar");

    const expected = [
        buildDeclarationScopeSnapshot({
            scopeId: scope.id,
            scopeKind: "program",
            name: "bar",
            declarationRange,
            classifications: ["identifier", "declaration"]
        })
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

test("getScopeOccurrences exports a single scope payload", () => {
    const {
        tracker,
        programScope,
        blockScope,
        declarationRange,
        referenceRange
    } = createTrackerWithDeclarationAndReference();

    const result = tracker.getScopeOccurrences(blockScope.id);

    const expected = buildReferenceScopeSnapshot({
        scopeId: blockScope.id,
        scopeKind: "block",
        name: "foo",
        referenceRange,
        declarationScopeId: programScope.id,
        declarationRange,
        classifications: [
            "identifier",
            "reference",
            "variable",
            "local"
        ]
    });

    assert.deepStrictEqual(result, expected);
});

test("getScopeOccurrences omits references when requested and clones metadata", () => {
    const { tracker, scope, declarationRange } = createSingleScopeTracker("bar");

    const occurrences = tracker.getScopeOccurrences(scope.id, {
        includeReferences: false
    });

    const expected = buildDeclarationScopeSnapshot({
        scopeId: scope.id,
        scopeKind: "program",
        name: "bar",
        declarationRange,
        classifications: ["identifier", "declaration"]
    });

    assert.deepStrictEqual(occurrences, expected);

    occurrences.identifiers[0].declarations[0].classifications.push("mutated");

    assert.deepStrictEqual(
        tracker.getScopeOccurrences(scope.id, { includeReferences: false }),
        expected
    );
});

test("getScopeOccurrences returns null for disabled or unknown scopes", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("program");
    tracker.exitScope();

    assert.strictEqual(tracker.getScopeOccurrences("unknown"), null);

    const disabled = new ScopeTracker({ enabled: false });
    assert.strictEqual(disabled.getScopeOccurrences("anything"), null);
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

test("getSymbolOccurrences returns cloned occurrence metadata", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("root");

    tracker.declare(
        "shared",
        { start: { line: 1, index: 0 }, end: { line: 1, index: 6 } },
        { kind: "variable", tags: ["global"] }
    );

    tracker.reference(
        "shared",
        { start: { line: 2, index: 0 }, end: { line: 2, index: 6 } },
        { kind: "variable" }
    );

    tracker.exitScope();

    const occurrences = tracker.getSymbolOccurrences("shared");
    const snapshot = structuredClone(occurrences);

    occurrences[0].occurrence.classifications.push("mutated");
    occurrences[0].occurrence.start.line = 99;

    assert.deepStrictEqual(tracker.getSymbolOccurrences("shared"), snapshot);
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

    const sortedSymbols = [...symbols].reduce((acc, item) => {
        const insertIndex = acc.findIndex((existing) => existing > item);
        return insertIndex === -1
            ? [...acc, item]
            : [...acc.slice(0, insertIndex), item, ...acc.slice(insertIndex)];
    }, []);
    assert.deepStrictEqual(sortedSymbols, ["param1", "param2"]);
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
    const { tracker, outerScope, innerScope } =
        createNestedFunctionAndBlockScopes();

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
    const { tracker, outerScope, innerScope } =
        createNestedFunctionAndBlockScopes();

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
    const innerNames = innerDefs
        .map((d) => d.name)
        .reduce((acc, item) => {
            const insertIndex = acc.findIndex((existing) => existing > item);
            return insertIndex === -1
                ? [...acc, item]
                : [
                      ...acc.slice(0, insertIndex),
                      item,
                      ...acc.slice(insertIndex)
                  ];
        }, []);
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

test("resolveIdentifier uses cached scope indices for efficient lookups", () => {
    const tracker = new ScopeTracker({ enabled: true });

    tracker.enterScope("root");
    tracker.declare("rootVar", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 7 }
    });

    const deepScopes = [];
    for (let i = 0; i < 50; i++) {
        const scope = tracker.enterScope(`scope-${i}`);
        deepScopes.push(scope);
    }

    const deepestScope = tracker.enterScope("deepest");
    tracker.declare("localVar", {
        start: { line: 100, index: 0 },
        end: { line: 100, index: 8 }
    });

    const iterations = 1000;
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
        const result = tracker.resolveIdentifier("rootVar", deepestScope.id);
        assert.strictEqual(result.name, "rootVar");

        const localResult = tracker.resolveIdentifier(
            "localVar",
            deepestScope.id
        );
        assert.strictEqual(localResult.name, "localVar");
    }

    const endTime = Date.now();
    const elapsedMs = endTime - startTime;

    assert.ok(
        elapsedMs < 100,
        `${iterations} resolveIdentifier calls took ${elapsedMs}ms with 50+ nested scopes. Expected < 100ms with cached indices.`
    );
});

type SourceLocation = {
    line: number;
    index: number;
};

type SourceRange = {
    start: SourceLocation;
    end: SourceLocation;
};

type ScopeSnapshot = {
    scopeId: string;
    scopeKind: string;
    identifiers: Array<{
        name: string;
        declarations: Array<{
            kind: string;
            name: string;
            scopeId: string;
            classifications: string[];
            declaration: {
                scopeId: string;
                start: SourceLocation;
                end: SourceLocation;
            };
            start: SourceLocation;
            end: SourceLocation;
        }>;
        references: Array<{
            kind: string;
            name: string;
            scopeId: string;
            classifications: string[];
            declaration: {
                scopeId: string;
                start: SourceLocation;
                end: SourceLocation;
            };
            start: SourceLocation;
            end: SourceLocation;
        }>;
    }>;
};

function createRange(
    startLine: number,
    startIndex: number,
    endLine: number,
    endIndex: number
): SourceRange {
    return {
        start: { line: startLine, index: startIndex },
        end: { line: endLine, index: endIndex }
    };
}

function cloneLocation(location: SourceLocation): SourceLocation {
    return { line: location.line, index: location.index };
}

function cloneRange(range: SourceRange): SourceRange {
    return {
        start: cloneLocation(range.start),
        end: cloneLocation(range.end)
    };
}

function buildDeclarationScopeSnapshot({
    scopeId,
    scopeKind,
    name,
    declarationRange,
    classifications
}: {
    scopeId: string;
    scopeKind: string;
    name: string;
    declarationRange: SourceRange;
    classifications: string[];
}): ScopeSnapshot {
    const declarationRangeClone = cloneRange(declarationRange);
    const metadataRangeClone = cloneRange(declarationRange);

    return {
        scopeId,
        scopeKind,
        identifiers: [
            {
                name,
                declarations: [
                    {
                        kind: "declaration",
                        name,
                        scopeId,
                        classifications: [...classifications],
                        declaration: {
                            scopeId,
                            start: cloneLocation(declarationRangeClone.start),
                            end: cloneLocation(declarationRangeClone.end)
                        },
                        start: cloneLocation(metadataRangeClone.start),
                        end: cloneLocation(metadataRangeClone.end)
                    }
                ],
                references: []
            }
        ]
    };
}

function buildReferenceScopeSnapshot({
    scopeId,
    scopeKind,
    name,
    referenceRange,
    declarationScopeId,
    declarationRange,
    classifications
}: {
    scopeId: string;
    scopeKind: string;
    name: string;
    referenceRange: SourceRange;
    declarationScopeId: string;
    declarationRange: SourceRange;
    classifications: string[];
}): ScopeSnapshot {
    const referenceRangeClone = cloneRange(referenceRange);
    const declarationRangeClone = cloneRange(declarationRange);

    return {
        scopeId,
        scopeKind,
        identifiers: [
            {
                name,
                declarations: [],
                references: [
                    {
                        kind: "reference",
                        name,
                        scopeId,
                        classifications: [...classifications],
                        declaration: {
                            scopeId: declarationScopeId,
                            start: cloneLocation(declarationRangeClone.start),
                            end: cloneLocation(declarationRangeClone.end)
                        },
                        start: cloneLocation(referenceRangeClone.start),
                        end: cloneLocation(referenceRangeClone.end)
                    }
                ]
            }
        ]
    };
}

function buildDeclarationAndReferenceSnapshot({
    name,
    programScopeId,
    blockScopeId,
    declarationRange,
    referenceRange
}: {
    name: string;
    programScopeId: string;
    blockScopeId: string;
    declarationRange: SourceRange;
    referenceRange: SourceRange;
}): ScopeSnapshot[] {
    return [
        buildDeclarationScopeSnapshot({
            scopeId: programScopeId,
            scopeKind: "program",
            name,
            declarationRange,
            classifications: ["identifier", "declaration", "variable", "local"]
        }),
        buildReferenceScopeSnapshot({
            scopeId: blockScopeId,
            scopeKind: "block",
            name,
            referenceRange,
            declarationScopeId: programScopeId,
            declarationRange,
            classifications: [
                "identifier",
                "reference",
                "variable",
                "local"
            ]
        })
    ];
}

function createTrackerWithDeclarationAndReference(name = "foo") {
    const tracker = new ScopeTracker({ enabled: true });
    const programScope = tracker.enterScope("program");
    const declarationRange = createRange(1, 0, 1, 3);

    tracker.declare(name, declarationRange, {
        kind: "variable",
        tags: ["local"]
    });

    const blockScope = tracker.enterScope("block");
    const referenceRange = createRange(2, 4, 2, 7);

    tracker.reference(name, referenceRange, { kind: "variable" });

    tracker.exitScope();
    tracker.exitScope();

    return {
        tracker,
        programScope,
        blockScope,
        declarationRange,
        referenceRange
    };
}

function createSingleScopeTracker(name = "bar") {
    const tracker = new ScopeTracker({ enabled: true });
    const scope = tracker.enterScope("program");
    const declarationRange = createRange(1, 0, 1, 3);

    tracker.declare(name, declarationRange);

    const referenceRange = createRange(2, 1, 2, 4);
    tracker.reference(name, referenceRange);

    tracker.exitScope();

    return {
        tracker,
        scope,
        declarationRange,
        referenceRange
    };
}

function createNestedFunctionAndBlockScopes() {
    const tracker = new ScopeTracker({ enabled: true });
    const outerScope = tracker.enterScope("function");

    tracker.declare("outerVar", createRange(1, 0, 1, 8));

    const innerScope = tracker.enterScope("block");
    tracker.declare("innerVar", createRange(3, 0, 3, 8));

    return { tracker, outerScope, innerScope };
}
