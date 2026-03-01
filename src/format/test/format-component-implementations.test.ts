import assert from "node:assert/strict";
import test from "node:test";

import { handleComments, printComment } from "../src/comments/index.js";
import { defaultGmlFormatComponentImplementations } from "../src/components/default-component-instances.js";
import { LogicalOperatorsStyle } from "../src/options/logical-operators-style.js";
import { gmlParserAdapter } from "../src/parsers/index.js";
import { print } from "../src/printer/index.js";

void test("default implementation bundle is frozen and reuses canonical references", () => {
    assert.ok(Object.isFrozen(defaultGmlFormatComponentImplementations), "implementation bundle should be frozen");

    assert.strictEqual(defaultGmlFormatComponentImplementations.gmlParserAdapter, gmlParserAdapter);
    assert.strictEqual(defaultGmlFormatComponentImplementations.print, print);
    assert.strictEqual(defaultGmlFormatComponentImplementations.printComment, printComment);
    assert.strictEqual(defaultGmlFormatComponentImplementations.handleComments, handleComments);
    assert.strictEqual(defaultGmlFormatComponentImplementations.LogicalOperatorsStyle, LogicalOperatorsStyle);
});

void test("default implementation bundle satisfies the component contract shape", () => {
    const bundle = defaultGmlFormatComponentImplementations;

    assert.equal(typeof bundle.gmlParserAdapter, "object", "gmlParserAdapter must be an object");
    assert.ok(bundle.gmlParserAdapter !== null, "gmlParserAdapter must not be null");
    assert.equal(typeof bundle.handleComments, "object", "handleComments must be an object");
    assert.ok(bundle.handleComments !== null, "handleComments must not be null");
    assert.equal(typeof bundle.LogicalOperatorsStyle, "object", "LogicalOperatorsStyle must be an object");
    assert.ok(bundle.LogicalOperatorsStyle !== null, "LogicalOperatorsStyle must not be null");

    assert.equal(typeof bundle.print, "function", "print must be a function");
    assert.equal(typeof bundle.printComment, "function", "printComment must be a function");

    assert.deepStrictEqual(
        Object.keys(bundle).toSorted(),
        ["LogicalOperatorsStyle", "gmlParserAdapter", "handleComments", "print", "printComment"].toSorted(),
        "bundle must expose exactly the five contract fields"
    );
});
