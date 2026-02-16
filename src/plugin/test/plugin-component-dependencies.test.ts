import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultGmlPluginComponents } from "../src/components/default-plugin-components.js";
import {
    gmlPluginComponentDependencies,
    gmlPluginComponentImplementations
} from "../src/components/plugin-component-bundles.js";

const SAMPLE_SOURCE = "function example() { return 1; }";

void test("dependency bundle is frozen and exposes expected contract keys", () => {
    assert.ok(Object.isFrozen(gmlPluginComponentDependencies), "dependency bundle should be frozen");
    assert.strictEqual(
        gmlPluginComponentDependencies,
        gmlPluginComponentImplementations,
        "dependency bundle should alias the implementation bundle"
    );

    assert.deepStrictEqual(
        Object.keys(gmlPluginComponentDependencies).toSorted(),
        [
            "LogicalOperatorsStyle",
            "gmlParserAdapter",
            "handleComments",
            "identifierCaseOptions",
            "print",
            "printComment"
        ].toSorted()
    );
});

void test("default component factory wires the dependency bundle", async () => {
    const components = createDefaultGmlPluginComponents();

    const parser = components.parsers["gml-parse"];

    const dependencyBundle = gmlPluginComponentDependencies;

    assert.strictEqual(
        parser,
        dependencyBundle.gmlParserAdapter,
        "gml-parse should reference the canonical parser adapter directly"
    );

    const parserResult = await parser.parse(SAMPLE_SOURCE, {
        originalText: SAMPLE_SOURCE
    } as any);
    const dependencyResult = await dependencyBundle.gmlParserAdapter.parse(SAMPLE_SOURCE, {
        originalText: SAMPLE_SOURCE
    } as any);

    assert.deepStrictEqual(parserResult, dependencyResult, "parser results should match the canonical parser adapter");
});
