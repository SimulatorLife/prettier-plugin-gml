import assert from "node:assert/strict";
import test from "node:test";

import { defaultGmlPluginComponentDependencies } from "../src/component-providers/default-plugin-component-dependencies.js";
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
    const resolved = defaultGmlPluginComponentDependencies;

    assert.ok(
        Object.isFrozen(resolved),
        "default dependency bundle should be frozen"
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

test("default dependency bundle maintains a stable reference", () => {
    const first = defaultGmlPluginComponentDependencies;
    const second = defaultGmlPluginComponentDependencies;

    assert.strictEqual(
        first,
        second,
        "default dependency bundle should be a shared singleton"
    );
});
