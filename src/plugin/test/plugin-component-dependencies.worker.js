import assert from "node:assert/strict";
import { parentPort, workerData } from "node:worker_threads";

// Ensure the plugin module resolves its default component bundle before any tests
// override the dependency provider. The component registry caches the initial
// bundle, so loading the plugin eagerly prevents concurrent tests from
// observing temporary dependency overrides.
import "../src/gml.js";

import {
    gmlPluginComponentDependencies,
    getGmlPluginComponentDependencyProvider,
    resolveGmlPluginComponentDependencies,
    restoreDefaultGmlPluginComponentDependencies,
    setGmlPluginComponentDependencyProvider
} from "../src/component-providers/gml-plugin-component-dependency-registry.js";
import { createDefaultGmlPluginComponentDependencies } from "../src/component-providers/default-plugin-component-dependencies.js";
import { createDefaultGmlPluginComponents } from "../src/component-providers/default-plugin-components.js";

function createCustomDependencyBundle() {
    const defaults = createDefaultGmlPluginComponentDependencies();

    const parseCalls = [];
    const printCalls = [];
    const printCommentCalls = [];
    const handleCalls = { ownLine: 0, endOfLine: 0, remaining: 0 };

    const customParser = {
        ...defaults.gmlParserAdapter,
        parse: (text, options) => {
            parseCalls.push({ text, options });
            return defaults.gmlParserAdapter.parse(text, options);
        }
    };

    const customPrint = (path, ...rest) => {
        printCalls.push(path);
        return defaults.print(path, ...rest);
    };
    const customPrintComment = (commentPath, ...rest) => {
        printCommentCalls.push(commentPath);
        return defaults.printComment(commentPath, ...rest);
    };
    const wrapHandle =
        (key) =>
        (...args) => {
            handleCalls[key] += 1;
            return defaults.handleComments[key](...args);
        };
    const customHandleComments = {
        ownLine: wrapHandle("ownLine"),
        endOfLine: wrapHandle("endOfLine"),
        remaining: wrapHandle("remaining")
    };

    return {
        dependencies: {
            ...defaults,
            gmlParserAdapter: customParser,
            print: customPrint,
            printComment: customPrintComment,
            handleComments: customHandleComments
        },
        log: {
            parseCalls,
            printCalls,
            printCommentCalls,
            handleCalls
        }
    };
}

async function run() {
    const { task } = workerData;

    switch (task) {
        case "exposes-defaults": {
            const resolved = resolveGmlPluginComponentDependencies();

            assert.strictEqual(
                resolved,
                gmlPluginComponentDependencies,
                "resolver should return the default dependency bundle"
            );

            assert.ok(
                Object.isFrozen(resolved),
                "dependency bundle should be frozen"
            );
            for (const key of Object.keys(resolved)) {
                assert.ok(
                    Object.hasOwn(resolved, key),
                    `default bundle should expose ${key}`
                );
            }

            assert.strictEqual(
                getGmlPluginComponentDependencyProvider()(),
                resolved,
                "provider should return the cached dependency bundle"
            );
            break;
        }

        case "rejects-non-function": {
            assert.throws(
                () =>
                    setGmlPluginComponentDependencyProvider(
                        /** @type {any} */ ({})
                    ),
                /dependency providers must be functions/i
            );
            break;
        }

        case "allows-overrides": {
            const bundle = createCustomDependencyBundle();

            try {
                const result = setGmlPluginComponentDependencyProvider(
                    () => bundle.dependencies
                );

                assert.notStrictEqual(
                    result,
                    gmlPluginComponentDependencies,
                    "custom provider should replace the default bundle"
                );
                assert.ok(
                    Object.isFrozen(result),
                    "custom bundle should be frozen"
                );
                assert.deepStrictEqual(
                    Object.keys(result),
                    Object.keys(gmlPluginComponentDependencies),
                    "custom bundle should expose the same dependency keys"
                );

                assert.strictEqual(
                    result.gmlParserAdapter.parse,
                    bundle.dependencies.gmlParserAdapter.parse,
                    "custom parser should be included in the normalized bundle"
                );
                assert.strictEqual(
                    result.print,
                    bundle.dependencies.print,
                    "custom printer should be included in the normalized bundle"
                );
                assert.strictEqual(
                    result.printComment,
                    bundle.dependencies.printComment,
                    "custom comment printer should be included in the normalized bundle"
                );
                assert.strictEqual(
                    result.handleComments.ownLine,
                    bundle.dependencies.handleComments.ownLine,
                    "custom comment handlers should be included in the normalized bundle"
                );
            } finally {
                const restoreResult =
                    restoreDefaultGmlPluginComponentDependencies();

                assert.strictEqual(
                    restoreResult,
                    gmlPluginComponentDependencies,
                    "restoring defaults should return the canonical dependency bundle"
                );
            }
            break;
        }

        case "components-use-overrides": {
            const bundle = createCustomDependencyBundle();

            try {
                setGmlPluginComponentDependencyProvider(
                    () => bundle.dependencies
                );

                const components = createDefaultGmlPluginComponents();
                const parser = components.parsers["gml-parse"];
                const printer = components.printers["gml-ast"];

                parser.parse("function example() { return 1; }", {}, {});

                assert.strictEqual(
                    printer.print,
                    bundle.dependencies.print,
                    "component printer should reference the dependency override"
                );
                assert.strictEqual(
                    printer.printComment,
                    bundle.dependencies.printComment,
                    "component comment printer should reference the dependency override"
                );
                assert.strictEqual(
                    printer.handleComments.ownLine,
                    bundle.dependencies.handleComments.ownLine,
                    "ownLine comment handler should reference the dependency override"
                );
                assert.strictEqual(
                    printer.handleComments.endOfLine,
                    bundle.dependencies.handleComments.endOfLine,
                    "endOfLine comment handler should reference the dependency override"
                );
                assert.strictEqual(
                    printer.handleComments.remaining,
                    bundle.dependencies.handleComments.remaining,
                    "remaining comment handler should reference the dependency override"
                );

                assert.strictEqual(bundle.log.parseCalls.length, 1);
                assert.strictEqual(
                    bundle.log.parseCalls[0].text,
                    "function example() { return 1; }"
                );
                assert.ok(
                    Object.hasOwn(
                        bundle.log.parseCalls[0].options,
                        "originalText"
                    ),
                    "parser should receive the formatter options bag"
                );
                assert.deepStrictEqual(bundle.log.printCalls, []);
                assert.deepStrictEqual(bundle.log.printCommentCalls, []);
                assert.deepStrictEqual(bundle.log.handleCalls, {
                    ownLine: 0,
                    endOfLine: 0,
                    remaining: 0
                });
            } finally {
                const restoreResult =
                    restoreDefaultGmlPluginComponentDependencies();

                assert.strictEqual(
                    restoreResult,
                    gmlPluginComponentDependencies,
                    "restoring defaults should return the canonical dependency bundle"
                );
            }
            break;
        }

        default: {
            throw new Error(`Unknown task: ${task}`);
        }
    }

    parentPort?.postMessage("ok");
}

run().catch((error) => {
    // Ensure unhandled rejections propagate to the parent test.
    setImmediate(() => {
        throw error;
    });
});
