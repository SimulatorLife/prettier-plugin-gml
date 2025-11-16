import assert from "node:assert/strict";
import test from "node:test";

import {
    gmlPluginComponentImplementations,
    resolveGmlPluginComponentImplementations
} from "../src/component-providers/plugin-component-bundles.js";
import { gmlParserAdapter } from "../src/parsers/index.js";
import { print } from "../src/printer/index.js";
import { handleComments, printComment } from "../src/comments/public-api.js";
import { IdentifierCase } from "@gml-modules/semantic";
const { identifierCaseOptions } = IdentifierCase;
import { LogicalOperatorsStyle } from "../src/options/logical-operators-style.js";

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
        printComment
    );
    assert.strictEqual(
        gmlPluginComponentImplementations.handleComments,
        handleComments
    );
    assert.strictEqual(
        gmlPluginComponentImplementations.identifierCaseOptions,
        identifierCaseOptions
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
