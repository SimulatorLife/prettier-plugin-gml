import test from "node:test";
import assert from "node:assert/strict";

import ScopeTracker from "../src/scopes/scope-tracker.js";

test("getScopesForSymbol returns scopes containing a symbol", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const rootScope = tracker.enterScope("program");

    tracker.declare(
        "shared",
        { start: { line: 1, index: 0 }, end: { line: 1, index: 6 } },
        { kind: "variable", tags: ["global"] }
    );

    const childScope1 = tracker.enterScope("function");

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

    const childScope2 = tracker.enterScope("block");

    tracker.reference(
        "shared",
        { start: { line: 6, index: 0 }, end: { line: 6, index: 6 } },
        { kind: "variable" }
    );

    tracker.exitScope();
    tracker.exitScope();

    const sharedScopes = tracker.getScopesForSymbol("shared");
    const localScopes = tracker.getScopesForSymbol("local");

    assert.strictEqual(sharedScopes.length, 3);
    assert.ok(sharedScopes.includes(rootScope.id));
    assert.ok(sharedScopes.includes(childScope1.id));
    assert.ok(sharedScopes.includes(childScope2.id));

    assert.strictEqual(localScopes.length, 1);
    assert.ok(localScopes.includes(childScope1.id));
});

test("getScopesForSymbol returns empty array for non-existent symbol", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("root");

    tracker.declare("exists", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 6 }
    });

    tracker.exitScope();

    const result = tracker.getScopesForSymbol("nonexistent");

    assert.deepStrictEqual(result, []);
});

test("getScopesForSymbol returns empty array when disabled", () => {
    const tracker = new ScopeTracker({ enabled: false });

    const result = tracker.getScopesForSymbol("any");

    assert.deepStrictEqual(result, []);
});

test("getScopesForSymbol returns empty array for null name", () => {
    const tracker = new ScopeTracker({ enabled: true });
    tracker.enterScope("root");

    tracker.declare("test", {
        start: { line: 1, index: 0 },
        end: { line: 1, index: 4 }
    });

    tracker.exitScope();

    const result = tracker.getScopesForSymbol(null);

    assert.deepStrictEqual(result, []);
});

test("getScopesForSymbol provides O(1) lookup for hot reload invalidation", () => {
    const tracker = new ScopeTracker({ enabled: true });

    const numScopes = 100;
    const scopes = [];

    tracker.enterScope("root");

    for (let i = 0; i < numScopes; i++) {
        const scope = tracker.enterScope(`scope-${i}`);
        scopes.push(scope);

        if (i % 10 === 0) {
            tracker.declare(
                "hotSymbol",
                { start: { line: i, index: 0 }, end: { line: i, index: 9 } },
                { kind: "variable" }
            );
        }

        tracker.exitScope();
    }

    tracker.exitScope();

    const startTime = Date.now();
    const result = tracker.getScopesForSymbol("hotSymbol");
    const endTime = Date.now();

    assert.strictEqual(result.length, 10);

    const lookupTime = endTime - startTime;
    assert.ok(
        lookupTime < 10,
        `Lookup took ${lookupTime}ms, expected < 10ms for O(1) performance`
    );
});

test("getScopesForSymbol handles symbols with both declarations and references", () => {
    const tracker = new ScopeTracker({ enabled: true });
    const scope1 = tracker.enterScope("program");

    tracker.declare(
        "var1",
        { start: { line: 1, index: 0 }, end: { line: 1, index: 4 } },
        { kind: "variable" }
    );

    const scope2 = tracker.enterScope("block");

    tracker.reference("var1", {
        start: { line: 2, index: 0 },
        end: { line: 2, index: 4 }
    });

    tracker.declare(
        "var1",
        { start: { line: 3, index: 0 }, end: { line: 3, index: 4 } },
        { kind: "variable" }
    );

    tracker.exitScope();
    tracker.exitScope();

    const result = tracker.getScopesForSymbol("var1");

    assert.strictEqual(result.length, 2);
    assert.ok(result.includes(scope1.id));
    assert.ok(result.includes(scope2.id));
});
