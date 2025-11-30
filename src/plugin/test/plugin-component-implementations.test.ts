import assert from "node:assert/strict";
import test from "node:test";

import {
    gmlPluginComponentImplementations,
    resolveGmlPluginComponentImplementations
} from "../src/components/plugin-component-bundles.js";
import { gmlParserAdapter } from "../src/parsers/index.js";
import { print } from "../src/printer/index.js";
import { Semantic } from "@gml-modules/semantic";
import { LogicalOperatorsStyle } from "../src/options/logical-operators-style.js";
import { Parser } from "@gml-modules/parser";

test("default implementation bundle is frozen and reuses canonical references", () => {
    assert.ok(
        Object.isFrozen(gmlPluginComponentImplementations),
        "implementation bundle should be frozen"
    );

    assert.strictEqual(
        gmlPluginComponentImplementations.gmlParserAdapter,
        gmlParserAdapter
    );
    assert.strictEqual(gmlPluginComponentImplementations.print, print);
    assert.strictEqual(
        gmlPluginComponentImplementations.printComment,
        Parser.printComment
    );
    assert.strictEqual(
        gmlPluginComponentImplementations.handleComments,
        Parser.handleComments
    );
    assert.strictEqual(
        gmlPluginComponentImplementations.identifierCaseOptions,
        Semantic.identifierCaseOptions
    );
    assert.strictEqual(
        gmlPluginComponentImplementations.LogicalOperatorsStyle,
        LogicalOperatorsStyle
    );
});

test("resolver returns the canonical implementation bundle", () => {
    const resolved = resolveGmlPluginComponentImplementations();

    assert.strictEqual(
        resolved,
        gmlPluginComponentImplementations,
        "resolver should return the default implementation bundle"
    );
});
