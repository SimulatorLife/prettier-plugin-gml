import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ScopeTracker } from "../src/scopes/scope-tracker.js";

void test("ScopeTracker bounds lookup cache entries with LRU eviction", () => {
    const tracker = new ScopeTracker({ enabled: true, lookupCacheMaxEntries: 3 });
    tracker.enterScope("program");

    tracker.declare("alpha", {
        name: "alpha",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 5, index: 5 }
    });

    tracker.declare("beta", {
        name: "beta",
        start: { line: 2, column: 0, index: 6 },
        end: { line: 2, column: 4, index: 10 }
    });

    tracker.declare("gamma", {
        name: "gamma",
        start: { line: 3, column: 0, index: 11 },
        end: { line: 3, column: 5, index: 16 }
    });

    tracker.lookup("alpha");
    tracker.lookup("beta");
    tracker.lookup("gamma");
    tracker.lookup("delta");

    const internalLookupCache = (tracker as any).lookupCache as Map<string, unknown>;
    assert.equal(internalLookupCache.size, 3);
    assert.equal(internalLookupCache.has("alpha"), false);
    assert.equal(internalLookupCache.has("delta"), true);
});

void test("ScopeTracker bounds identifier resolution cache entries", () => {
    const tracker = new ScopeTracker({
        enabled: true,
        identifierCacheMaxTrackedNames: 2,
        identifierCacheMaxScopesPerName: 2
    });
    const rootScope = tracker.enterScope("program");

    tracker.declare("one", {
        name: "one",
        start: { line: 1, column: 0, index: 0 },
        end: { line: 1, column: 3, index: 3 }
    });

    tracker.declare("two", {
        name: "two",
        start: { line: 2, column: 0, index: 4 },
        end: { line: 2, column: 3, index: 7 }
    });

    tracker.declare("three", {
        name: "three",
        start: { line: 3, column: 0, index: 8 },
        end: { line: 3, column: 5, index: 13 }
    });

    tracker.resolveIdentifier("one", rootScope.id);
    tracker.resolveIdentifier("two", rootScope.id);
    tracker.resolveIdentifier("three", rootScope.id);

    const internalIdentifierCache = (tracker as any).identifierCache as {
        cache: Map<string, Map<string, unknown>>;
    };

    assert.ok(internalIdentifierCache.cache.size <= 2);
    assert.equal(internalIdentifierCache.cache.has("one"), false);
});
