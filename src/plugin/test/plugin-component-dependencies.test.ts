import assert from "node:assert/strict";
import test from "node:test";

import {
    gmlPluginComponentDependencies,
    resolveGmlPluginComponentDependencies
} from "../src/components/plugin-component-bundles.js";
import { createDefaultGmlPluginComponents } from "../src/components/default-plugin-components.js";

const SAMPLE_SOURCE = "function example() { return 1; }";

void test("dependency bundle is frozen and exposes expected contract keys", () => {
    assert.ok(Object.isFrozen(gmlPluginComponentDependencies), "dependency bundle should be frozen");

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

void test("resolver returns the canonical dependency bundle", () => {
    const resolved = resolveGmlPluginComponentDependencies();

    assert.strictEqual(
        resolved,
        gmlPluginComponentDependencies,
        "resolver should return the default dependency bundle"
    );
});

void test("default component factory wires the dependency bundle", async () => {
    const components = createDefaultGmlPluginComponents();

    const parser = components.parsers["gml-parse"];
    const printer = components.printers["gml-ast"];

    const dependencyBundle = gmlPluginComponentDependencies;

    const parserResult = await parser.parse(SAMPLE_SOURCE, {
        originalText: SAMPLE_SOURCE
    } as any);
    const dependencyResult = await dependencyBundle.gmlParserAdapter.parse(SAMPLE_SOURCE, {
        originalText: SAMPLE_SOURCE
    } as any);

    assert.deepStrictEqual(
        parserResult,
        dependencyResult,
        "parser wrapper should forward to the dependency implementation"
    );

    assert.strictEqual(printer.print, dependencyBundle.print);
    assert.strictEqual(printer.printComment, dependencyBundle.printComment);
    assert.strictEqual(printer.handleComments, dependencyBundle.handleComments);
});
