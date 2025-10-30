import assert from "node:assert/strict";
import test from "node:test";

import {
    gmlPluginComponentImplementations,
    getGmlPluginComponentImplementationProvider,
    resolveGmlPluginComponentImplementations,
    restoreDefaultGmlPluginComponentImplementations,
    setGmlPluginComponentImplementationProvider
} from "../src/component-providers/gml-plugin-component-implementation-registry.js";
import { gmlParserAdapter } from "../src/parsers/gml-parser-adapter.js";
import { print } from "../src/printer/print.js";
import {
    handleComments,
    printComment
} from "../src/comments/comment-printer.js";
import { identifierCaseOptions } from "gamemaker-language-semantic/identifier-case/options.js";
import { LogicalOperatorsStyle } from "../src/options/logical-operators-style.js";

function createCustomImplementationBundle() {
    const customParser = {
        ...gmlParserAdapter,
        parse: (text, options) => gmlParserAdapter.parse(text, options)
    };

    const customPrint = (...args) => print(...args);
    const customPrintComment = (...args) => printComment(...args);

    const customHandleComments = {
        ownLine: (...args) => handleComments.ownLine(...args),
        endOfLine: (...args) => handleComments.endOfLine(...args),
        remaining: (...args) => handleComments.remaining(...args)
    };

    return {
        gmlParserAdapter: customParser,
        print: customPrint,
        handleComments: customHandleComments,
        printComment: customPrintComment,
        identifierCaseOptions,
        LogicalOperatorsStyle
    };
}

test(
    "GML plugin component implementation registry",
    { concurrency: false },
    async (t) => {
        await t.test("exposes normalized defaults", () => {
            const resolved = resolveGmlPluginComponentImplementations();

            assert.strictEqual(
                resolved,
                gmlPluginComponentImplementations,
                "resolver should return the default implementation bundle"
            );

            assert.ok(
                Object.isFrozen(resolved),
                "implementation bundle should be frozen"
            );

            assert.strictEqual(resolved.gmlParserAdapter, gmlParserAdapter);
            assert.strictEqual(resolved.print, print);
            assert.strictEqual(resolved.printComment, printComment);
            assert.strictEqual(resolved.handleComments, handleComments);
            assert.strictEqual(
                resolved.identifierCaseOptions,
                identifierCaseOptions
            );
            assert.strictEqual(
                resolved.LogicalOperatorsStyle,
                LogicalOperatorsStyle
            );

            assert.strictEqual(
                getGmlPluginComponentImplementationProvider()(),
                resolved,
                "provider should return the cached implementation bundle"
            );
        });

        await t.test("rejects non-function providers", () => {
            assert.throws(
                () =>
                    setGmlPluginComponentImplementationProvider(
                        /** @type {any} */ ({})
                    ),
                /implementation providers must be functions/i
            );
        });

        await t.test("allows overriding implementation providers", () => {
            const bundle = createCustomImplementationBundle();

            try {
                const result = setGmlPluginComponentImplementationProvider(
                    () => bundle
                );

                assert.notStrictEqual(
                    result,
                    gmlPluginComponentImplementations,
                    "custom provider should replace the default implementation bundle"
                );

                assert.ok(
                    Object.isFrozen(result),
                    "custom bundle should be frozen"
                );

                assert.strictEqual(
                    result.gmlParserAdapter,
                    bundle.gmlParserAdapter,
                    "custom parser should be included in the normalized bundle"
                );
                assert.strictEqual(
                    result.print,
                    bundle.print,
                    "custom printer should be included in the normalized bundle"
                );
                assert.strictEqual(
                    result.printComment,
                    bundle.printComment,
                    "custom comment printer should be included in the normalized bundle"
                );
                assert.strictEqual(
                    result.handleComments.ownLine,
                    bundle.handleComments.ownLine,
                    "custom comment handlers should be included in the normalized bundle"
                );
            } finally {
                const restoreResult =
                    restoreDefaultGmlPluginComponentImplementations();

                assert.strictEqual(
                    restoreResult,
                    gmlPluginComponentImplementations,
                    "restoring defaults should return the canonical implementation bundle"
                );
            }
        });
    }
);
