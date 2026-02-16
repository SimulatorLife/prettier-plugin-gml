import assert from "node:assert/strict";
import test from "node:test";

import { gmlPluginComponents } from "../src/components/plugin-components.js";
import { Plugin } from "../src/index.js";

void test("GML entry point exports static plugin components", () => {
    const parserKeys = Object.keys(Plugin.parsers);
    assert.ok(parserKeys.includes("gml-parse"));
    assert.ok(parserKeys.includes("gmlParserAdapter"));

    const printerKeys = Object.keys(Plugin.printers);
    assert.ok(printerKeys.includes("gml-ast"));

    const optionKeys = Object.keys(Plugin.options);
    assert.ok(optionKeys.includes("logicalOperatorsStyle"));
    assert.ok(!optionKeys.includes("optimizeLoopLengthHoisting"));
    assert.ok(!optionKeys.includes("condenseStructAssignments"));
    assert.ok(!optionKeys.includes("applyFeatherFixes"));

    assert.ok(Plugin.defaultOptions);
    assert.ok(typeof Plugin.setIdentifierCaseRuntime === "function");

    assert.strictEqual(Plugin.parsers, gmlPluginComponents.parsers);
    assert.strictEqual(Plugin.printers, gmlPluginComponents.printers);
    assert.strictEqual(Plugin.options, gmlPluginComponents.options);
});

void test("GML entry point does not export semantic/refactor runtime hook setters", () => {
    assert.ok(!Object.hasOwn(Plugin, "setSemanticSafetyRuntime"));
    assert.ok(!Object.hasOwn(Plugin, "setRefactorRuntime"));
    assert.ok(!Object.hasOwn(Plugin, "restoreDefaultSemanticSafetyRuntime"));
    assert.ok(!Object.hasOwn(Plugin, "restoreDefaultRefactorRuntime"));
});
