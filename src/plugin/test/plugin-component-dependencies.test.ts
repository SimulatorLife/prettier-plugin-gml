import assert from "node:assert/strict";
import test from "node:test";

import {
    gmlPluginComponentDependencies,
    resolveGmlPluginComponentDependencies
} from "../src/component-providers/plugin-component-bundles.js";
import { createDefaultGmlPluginComponents } from "../src/component-providers/default-plugin-components.js";

const SAMPLE_SOURCE = "function example() { return 1; }";

test("dependency bundle is frozen and exposes expected contract keys", () => {
    assert.ok(
        Object.isFrozen(gmlPluginComponentDependencies),
        "dependency bundle should be frozen"
    );

    assert.deepStrictEqual(
        Object.keys(gmlPluginComponentDependencies).sort(),
        [
            "LogicalOperatorsStyle",
            "gmlParserAdapter",
            "handleComments",
            "identifierCaseOptions",
            "print",
            "printComment"
        ].sort()
    );
});

test("resolver returns the canonical dependency bundle", () => {
    const resolved = resolveGmlPluginComponentDependencies();

    assert.strictEqual(
        resolved,
        gmlPluginComponentDependencies,
        "resolver should return the default dependency bundle"
    );
});

test("default component factory wires the dependency bundle", async () => {
    const components = createDefaultGmlPluginComponents();

    const parser = components.parsers["gml-parse"];
    const printer = components.printers["gml-ast"];

    const dependencyBundle = gmlPluginComponentDependencies;

    const parserResult = await parser.parse(
        SAMPLE_SOURCE,
        {},
        {
            originalText: SAMPLE_SOURCE
        }
    );
    const dependencyResult = await dependencyBundle.gmlParserAdapter.parse(
        SAMPLE_SOURCE,
        { originalText: SAMPLE_SOURCE }
    );

    assert.deepStrictEqual(
        parserResult,
        dependencyResult,
        "parser wrapper should forward to the dependency implementation"
    );

    assert.strictEqual(printer.print, dependencyBundle.print);
    assert.strictEqual(printer.printComment, dependencyBundle.printComment);
    assert.strictEqual(printer.handleComments, dependencyBundle.handleComments);
});
