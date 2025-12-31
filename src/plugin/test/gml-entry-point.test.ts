import assert from "node:assert/strict";
import test from "node:test";

import { gmlPluginComponents } from "../src/components/plugin-components.js";
import * as gmlPlugin from "../src/index.js";

void test("GML entry point exports static plugin components", () => {
    // Verify that the entry point properly exposes parsers
    const parserKeys = Object.keys(gmlPlugin.parsers);
    assert.ok(
        parserKeys.includes("gml-parse"),
        "parsers export should include gml-parse"
    );
    assert.ok(
        parserKeys.includes("gmlParserAdapter"),
        "parsers export should include gmlParserAdapter"
    );

    // Verify that the entry point properly exposes printers
    const printerKeys = Object.keys(gmlPlugin.printers);
    assert.ok(
        printerKeys.includes("gml-ast"),
        "printers export should include gml-ast"
    );

    // Verify that the entry point properly exposes options
    const optionKeys = Object.keys(gmlPlugin.options);
    assert.ok(
        optionKeys.includes("optimizeLoopLengthHoisting"),
        "options export should include plugin options"
    );

    // Verify default options are properly set
    assert.ok(gmlPlugin.defaultOptions, "default options should be exported");
    assert.ok(
        typeof gmlPlugin.defaultOptions === "object",
        "default options should be an object"
    );

    // Verify that the exports are consistent with the component bundle
    assert.strictEqual(
        gmlPlugin.parsers,
        gmlPluginComponents.parsers,
        "parsers export should reference the component bundle parsers"
    );
    assert.strictEqual(
        gmlPlugin.printers,
        gmlPluginComponents.printers,
        "printers export should reference the component bundle printers"
    );
    assert.strictEqual(
        gmlPlugin.options,
        gmlPluginComponents.options,
        "options export should reference the component bundle options"
    );
});

void test("GML entry point exports are immutable", () => {
    // Verify parsers cannot be mutated
    assert.throws(
        () => {
            (gmlPlugin.parsers as any)["malicious-parser"] = {};
        },
        TypeError,
        "parsers should be frozen"
    );

    // Verify printers cannot be mutated
    assert.throws(
        () => {
            (gmlPlugin.printers as any)["malicious-printer"] = {};
        },
        TypeError,
        "printers should be frozen"
    );

    // Verify options cannot be mutated
    assert.throws(
        () => {
            (gmlPlugin.options as any)["malicious-option"] = {};
        },
        TypeError,
        "options should be frozen"
    );
});
