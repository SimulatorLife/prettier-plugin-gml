import assert from "node:assert/strict";
import test from "node:test";

import * as pluginEntry from "../src/index.js";

void test("formatter no longer exposes semantic/refactor runtime hooks", () => {
    assert.ok(!Object.hasOwn(pluginEntry, "setSemanticSafetyRuntime"));
    assert.ok(!Object.hasOwn(pluginEntry, "setRefactorRuntime"));
    assert.ok(!Object.hasOwn(pluginEntry, "restoreDefaultSemanticSafetyRuntime"));
    assert.ok(!Object.hasOwn(pluginEntry, "restoreDefaultRefactorRuntime"));
});
