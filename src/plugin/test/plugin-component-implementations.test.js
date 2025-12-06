import assert from "node:assert/strict";
import test from "node:test";

import { defaultGmlPluginComponentImplementations } from "../src/component-providers/default-plugin-component-implementations.js";
import { gmlParserAdapter } from "../src/parsers/index.js";
import { print } from "../src/printer/index.js";
import { handleComments, printComment } from "../src/comments/public-api.js";
import { identifierCaseOptions } from "gamemaker-language-semantic/identifier-case/options.js";
import { LogicalOperatorsStyle } from "../src/options/logical-operators-style.js";

test("default implementation bundle is frozen and reuses canonical references", () => {
    assert.ok(
        Object.isFrozen(defaultGmlPluginComponentImplementations),
        "implementation bundle should be frozen"
    );

    assert.strictEqual(
        defaultGmlPluginComponentImplementations.gmlParserAdapter,
        gmlParserAdapter
    );
    assert.strictEqual(defaultGmlPluginComponentImplementations.print, print);
    assert.strictEqual(
        defaultGmlPluginComponentImplementations.printComment,
        printComment
    );
    assert.strictEqual(
        defaultGmlPluginComponentImplementations.handleComments,
        handleComments
    );
    assert.strictEqual(
        defaultGmlPluginComponentImplementations.identifierCaseOptions,
        identifierCaseOptions
    );
    assert.strictEqual(
        defaultGmlPluginComponentImplementations.LogicalOperatorsStyle,
        LogicalOperatorsStyle
    );
});
