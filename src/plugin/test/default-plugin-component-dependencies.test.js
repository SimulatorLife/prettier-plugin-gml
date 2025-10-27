import assert from "node:assert/strict";
import test from "node:test";

import {
    createDefaultGmlPluginComponentDependencies,
    defaultGmlPluginComponentDependencies
} from "../src/component-providers/default-plugin-component-dependencies.js";
import { gmlParserAdapter } from "../src/parsers/gml-parser-adapter.js";
import { print } from "../src/printer/print.js";
import {
    handleComments,
    printComment
} from "../src/comments/comment-printer.js";
import { identifierCaseOptions } from "gamemaker-language-semantic/identifier-case/options.js";
import { LogicalOperatorsStyle } from "../src/options/logical-operators-style.js";

const REQUIRED_KEYS = [
    "gmlParserAdapter",
    "print",
    "handleComments",
    "printComment",
    "identifierCaseOptions",
    "LogicalOperatorsStyle"
];

test("default dependency bundle exposes canonical components", () => {
    const resolved = createDefaultGmlPluginComponentDependencies();

    assert.ok(
        Object.isFrozen(resolved),
        "default dependency bundle should be frozen"
    );
    assert.strictEqual(
        resolved,
        defaultGmlPluginComponentDependencies,
        "factory should return the cached default dependency bundle"
    );

    assert.strictEqual(resolved.gmlParserAdapter, gmlParserAdapter);
    assert.strictEqual(resolved.print, print);
    assert.strictEqual(resolved.printComment, printComment);
    assert.strictEqual(resolved.handleComments, handleComments);
    assert.strictEqual(resolved.identifierCaseOptions, identifierCaseOptions);
    assert.strictEqual(resolved.LogicalOperatorsStyle, LogicalOperatorsStyle);

    for (const key of REQUIRED_KEYS) {
        assert.ok(
            Object.hasOwn(resolved, key),
            `dependency bundle should expose ${key}`
        );
    }
});

test("default dependency bundle is memoized", () => {
    const first = createDefaultGmlPluginComponentDependencies();
    const second = createDefaultGmlPluginComponentDependencies();

    assert.strictEqual(
        first,
        second,
        "default dependency factory should reuse the frozen bundle"
    );
});
