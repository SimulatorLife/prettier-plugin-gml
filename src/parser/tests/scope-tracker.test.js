import test from "node:test";
import assert from "node:assert/strict";

import ScopeTracker from "../src/scope-tracker.js";
import { ScopeOverrideKeyword } from "../src/scope-override-keywords.js";

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
