import assert from "node:assert/strict";
import test from "node:test";

import { gmlPluginComponents } from "../src/components/plugin-components.js";

void test("GML plugin component registry", async (t) => {
    await t.test("exposes validated defaults", () => {
        assert.ok(Object.isFrozen(gmlPluginComponents), "component bundle should be frozen");
        assert.ok(Object.isFrozen(gmlPluginComponents.parsers), "parsers map should be frozen");
        assert.ok(Object.isFrozen(gmlPluginComponents.printers), "printers map should be frozen");
        assert.ok(Object.isFrozen(gmlPluginComponents.options), "options map should be frozen");

        assert.ok(gmlPluginComponents.parsers["gml-parse"], "default parser should be registered");
        assert.ok(gmlPluginComponents.printers["gml-ast"], "default printer should be registered");
        assert.ok(
            Object.hasOwn(gmlPluginComponents.options, "optimizeLoopLengthHoisting"),
            "default options should be registered"
        );

        for (const removedOption of [
            "preserveLineBreaks",
            "maintainArrayIndentation",
            "maintainStructIndentation",
            "maintainWithIndentation",
            "maintainSwitchIndentation"
        ]) {
            assert.ok(
                !Object.hasOwn(gmlPluginComponents.options, removedOption),
                `${removedOption} should stay unregistered`
            );
        }
    });

    await t.test("components are immutable", () => {
        assert.throws(
            () => {
                (gmlPluginComponents.parsers as any)["modified-parser"] = {};
            },
            TypeError,
            "frozen parsers should reject new properties"
        );

        assert.throws(
            () => {
                (gmlPluginComponents.printers as any)["modified-printer"] = {};
            },
            TypeError,
            "frozen printers should reject new properties"
        );

        assert.throws(
            () => {
                (gmlPluginComponents.options as any)["modified-option"] = {};
            },
            TypeError,
            "frozen options should reject new properties"
        );
    });

    await t.test("component bundle is initialized at module load", () => {
        assert.ok(gmlPluginComponents, "component bundle should be available as module-level constant");
    });
});
