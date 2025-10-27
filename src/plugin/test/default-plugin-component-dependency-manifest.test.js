import assert from "node:assert/strict";
import test from "node:test";

import {
    resolveDefaultGmlPluginComponentDependencyManifest,
    resetDefaultGmlPluginComponentDependencyManifestResolver,
    setDefaultGmlPluginComponentDependencyManifestResolver
} from "../src/component-providers/default-plugin-component-dependency-manifest.js";

process.env.NODE_TEST_NO_PARALLEL = "1";

const REQUIRED_MANIFEST_KEYS = [
    "gmlParserAdapter",
    "print",
    "handleComments",
    "printComment",
    "identifierCaseOptions",
    "LogicalOperatorsStyle"
];

test(
    "default dependency manifest resolver",
    { concurrency: false },
    async (t) => {
        await t.test("exposes the frozen default manifest", () => {
            const manifest =
                resolveDefaultGmlPluginComponentDependencyManifest();

            assert.ok(Object.isFrozen(manifest), "manifest should be frozen");
            for (const key of REQUIRED_MANIFEST_KEYS) {
                assert.ok(
                    Object.hasOwn(manifest, key),
                    `manifest should include ${key}`
                );
            }
        });

        await t.test("rejects non-function resolvers", () => {
            assert.throws(
                () =>
                    setDefaultGmlPluginComponentDependencyManifestResolver(
                        /** @type {any} */ ({})
                    ),
                /must be functions/i
            );
        });

        await t.test("supports overriding the manifest resolver", () => {
            const defaultManifest =
                resolveDefaultGmlPluginComponentDependencyManifest();
            const customPrint = (...args) => defaultManifest.print(...args);

            try {
                const updated =
                    setDefaultGmlPluginComponentDependencyManifestResolver(
                        () => ({
                            ...defaultManifest,
                            print: customPrint
                        })
                    );

                assert.strictEqual(
                    updated.print,
                    customPrint,
                    "resolver override should be used"
                );
                assert.ok(
                    Object.isFrozen(updated),
                    "overrides should be normalized to a frozen manifest"
                );
            } finally {
                resetDefaultGmlPluginComponentDependencyManifestResolver();
            }
        });
    }
);
