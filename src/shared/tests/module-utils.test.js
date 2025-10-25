import assert from "node:assert/strict";
import test from "node:test";

import { resolveModuleDefaultExport } from "../utils/module.js";

test("resolveModuleDefaultExport returns the default export when present", () => {
    const namespace = { default: () => "value" };
    const resolved = resolveModuleDefaultExport(namespace);
    assert.strictEqual(typeof resolved, "function");
    assert.strictEqual(resolved(), "value");
});

test("resolveModuleDefaultExport preserves falsy defaults", () => {
    const namespace = { default: 0 };
    assert.strictEqual(resolveModuleDefaultExport(namespace), 0);
});

test("resolveModuleDefaultExport falls back to the module for nullish defaults", () => {
    const namespaceWithNull = { default: null, extra: true };
    assert.strictEqual(
        resolveModuleDefaultExport(namespaceWithNull),
        namespaceWithNull
    );

    const namespaceWithUndefined = { default: undefined, value: 42 };
    assert.strictEqual(
        resolveModuleDefaultExport(namespaceWithUndefined),
        namespaceWithUndefined
    );
});

test("resolveModuleDefaultExport tolerates primitive and null modules", () => {
    assert.strictEqual(resolveModuleDefaultExport(null), null);
    assert.strictEqual(resolveModuleDefaultExport(), undefined);
    assert.strictEqual(resolveModuleDefaultExport("module"), "module");
});
