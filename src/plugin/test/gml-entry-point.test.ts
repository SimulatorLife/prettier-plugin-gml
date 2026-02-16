import assert from "node:assert/strict";
import test from "node:test";

import { gmlPluginComponents } from "../src/components/plugin-components.js";
import * as gmlPlugin from "../src/index.js";

void test("GML entry point exports static plugin components", () => {
    const parserKeys = Object.keys(gmlPlugin.parsers);
    assert.ok(parserKeys.includes("gml-parse"));
    assert.ok(parserKeys.includes("gmlParserAdapter"));

    const printerKeys = Object.keys(gmlPlugin.printers);
    assert.ok(printerKeys.includes("gml-ast"));

    const optionKeys = Object.keys(gmlPlugin.options);
    assert.ok(optionKeys.includes("logicalOperatorsStyle"));
    assert.ok(!optionKeys.includes("optimizeLoopLengthHoisting"));
    assert.ok(!optionKeys.includes("condenseStructAssignments"));
    assert.ok(!optionKeys.includes("applyFeatherFixes"));

    assert.ok(gmlPlugin.defaultOptions);
    assert.ok(typeof gmlPlugin.setIdentifierCaseRuntime === "function");

    assert.strictEqual(gmlPlugin.parsers, gmlPluginComponents.parsers);
    assert.strictEqual(gmlPlugin.printers, gmlPluginComponents.printers);
    assert.strictEqual(gmlPlugin.options, gmlPluginComponents.options);
});

void test("GML entry point does not export semantic/refactor runtime hook setters", () => {
    assert.ok(!Object.hasOwn(gmlPlugin, "setSemanticSafetyRuntime"));
    assert.ok(!Object.hasOwn(gmlPlugin, "setRefactorRuntime"));
    assert.ok(!Object.hasOwn(gmlPlugin, "restoreDefaultSemanticSafetyRuntime"));
    assert.ok(!Object.hasOwn(gmlPlugin, "restoreDefaultRefactorRuntime"));
});
