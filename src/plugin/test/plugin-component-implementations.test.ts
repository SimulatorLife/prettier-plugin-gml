import assert from "node:assert/strict";
import test from "node:test";

import { handleComments, printComment } from "../src/comments/index.js";
import { gmlPluginComponentImplementations } from "../src/components/plugin-component-bundles.js";
import { LogicalOperatorsStyle } from "../src/options/logical-operators-style.js";
import { gmlParserAdapter } from "../src/parsers/index.js";
import { print } from "../src/printer/index.js";

void test("default implementation bundle is frozen and reuses canonical references", () => {
    assert.ok(Object.isFrozen(gmlPluginComponentImplementations), "implementation bundle should be frozen");

    assert.strictEqual(gmlPluginComponentImplementations.gmlParserAdapter, gmlParserAdapter);
    assert.strictEqual(gmlPluginComponentImplementations.print, print);
    assert.strictEqual(gmlPluginComponentImplementations.printComment, printComment);
    assert.strictEqual(gmlPluginComponentImplementations.handleComments, handleComments);
    assert.deepStrictEqual(gmlPluginComponentImplementations.identifierCaseOptions, {});
    assert.ok(
        Object.isFrozen(gmlPluginComponentImplementations.identifierCaseOptions),
        "identifier-case option map should be immutable"
    );
    assert.strictEqual(gmlPluginComponentImplementations.LogicalOperatorsStyle, LogicalOperatorsStyle);
});
