import assert from "node:assert/strict";
import test from "node:test";

import { handleComments, printComment } from "../src/comments/index.js";
import { defaultGmlPluginComponentImplementations } from "../src/components/default-component-instances.js";
import { LogicalOperatorsStyle } from "../src/options/logical-operators-style.js";
import { gmlParserAdapter } from "../src/parsers/index.js";
import { print } from "../src/printer/index.js";

void test("default implementation bundle is frozen and reuses canonical references", () => {
    assert.ok(Object.isFrozen(defaultGmlPluginComponentImplementations), "implementation bundle should be frozen");

    assert.strictEqual(defaultGmlPluginComponentImplementations.gmlParserAdapter, gmlParserAdapter);
    assert.strictEqual(defaultGmlPluginComponentImplementations.print, print);
    assert.strictEqual(defaultGmlPluginComponentImplementations.printComment, printComment);
    assert.strictEqual(defaultGmlPluginComponentImplementations.handleComments, handleComments);
    assert.deepStrictEqual(defaultGmlPluginComponentImplementations.identifierCaseOptions, {});
    assert.ok(
        Object.isFrozen(defaultGmlPluginComponentImplementations.identifierCaseOptions),
        "identifier-case option map should be immutable"
    );
    assert.strictEqual(defaultGmlPluginComponentImplementations.LogicalOperatorsStyle, LogicalOperatorsStyle);
});
