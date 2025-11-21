import assert from "node:assert/strict";
import test from "node:test";

import {
    isMissingModuleDependency,
    resolveModuleDefaultExport
} from "../src/dependencies.js";

test("resolveModuleDefaultExport returns the default export when present", () => {
    const namespace = { default: () => "value" };
    const resolved = resolveModuleDefaultExport(namespace);
    assert.strictEqual(typeof resolved, "function");
    if (typeof resolved !== "function") {
        assert.fail("Expected resolved export to be callable");
    }
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

test("isMissingModuleDependency detects ERR_MODULE_NOT_FOUND errors", () => {
    const error: Error & { code?: string } = new Error(
        "Cannot find module 'prettier'"
    );
    error.code = "ERR_MODULE_NOT_FOUND";

    assert.strictEqual(isMissingModuleDependency(error, "prettier"), true);
});

test("isMissingModuleDependency handles double-quoted module identifiers", () => {
    const error: Error & { code?: string } = new Error(
        'Cannot find module "fast-xml-parser"'
    );
    error.code = "ERR_MODULE_NOT_FOUND";

    assert.strictEqual(
        isMissingModuleDependency(error, "fast-xml-parser"),
        true
    );
});

test("isMissingModuleDependency returns false for unrelated errors", () => {
    const error: Error & { code?: string } = new Error("Operation failed");
    error.code = "EFAIL";

    assert.strictEqual(isMissingModuleDependency(error, "prettier"), false);
});

test("isMissingModuleDependency requires a non-empty module identifier", () => {
    const error: Error & { code?: string } = new Error(
        "Cannot find module ''"
    );
    error.code = "ERR_MODULE_NOT_FOUND";

    assert.throws(() => isMissingModuleDependency(error, "  "), /moduleId/);
});
