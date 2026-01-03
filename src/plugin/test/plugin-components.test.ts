import assert from "node:assert/strict";
import test from "node:test";

import { gmlPluginComponents, resolveGmlPluginComponents } from "../src/components/plugin-components.js";

void test("GML plugin component registry", async (t) => {
    await t.test("exposes validated defaults", () => {
        const resolved = resolveGmlPluginComponents();

        assert.strictEqual(resolved, gmlPluginComponents, "resolver should return the shared default bundle");

        assert.ok(Object.isFrozen(resolved), "component bundle should be frozen");
        assert.ok(Object.isFrozen(resolved.parsers), "parsers map should be frozen");
        assert.ok(Object.isFrozen(resolved.printers), "printers map should be frozen");
        assert.ok(Object.isFrozen(resolved.options), "options map should be frozen");

        assert.ok(resolved.parsers["gml-parse"], "default parser should be registered");
        assert.ok(resolved.printers["gml-ast"], "default printer should be registered");
        assert.ok(
            Object.hasOwn(resolved.options, "optimizeLoopLengthHoisting"),
            "default options should be registered"
        );

        for (const removedOption of [
            "preserveLineBreaks",
            "maintainArrayIndentation",
            "maintainStructIndentation",
            "maintainWithIndentation",
            "maintainSwitchIndentation"
        ]) {
            assert.ok(!Object.hasOwn(resolved.options, removedOption), `${removedOption} should stay unregistered`);
        }

        assert.strictEqual(resolveGmlPluginComponents(), resolved, "resolver should reuse the same object reference");
    });

    await t.test("components are immutable", () => {
        const resolved = resolveGmlPluginComponents();

        assert.throws(
            () => {
                (resolved.parsers as any)["modified-parser"] = {};
            },
            TypeError,
            "frozen parsers should reject new properties"
        );

        assert.throws(
            () => {
                (resolved.printers as any)["modified-printer"] = {};
            },
            TypeError,
            "frozen printers should reject new properties"
        );

        assert.throws(
            () => {
                (resolved.options as any)["modified-option"] = {};
            },
            TypeError,
            "frozen options should reject new properties"
        );
    });

    await t.test("component bundle is initialized at module load", () => {
        // Verify that gmlPluginComponents is available immediately
        assert.ok(gmlPluginComponents, "component bundle should be available as module-level constant");

        assert.strictEqual(
            gmlPluginComponents,
            resolveGmlPluginComponents(),
            "constant export and resolver should return the same object"
        );
    });
});
