import assert from "node:assert/strict";
import test from "node:test";

import {
    gmlPluginComponents,
    resolveGmlPluginComponents,
    restoreDefaultGmlPluginComponents,
    setGmlPluginComponentProvider
} from "../src/plugin-components.js";
import * as gmlPlugin from "../src/gml.js";

test("GML plugin component registry", { concurrency: false }, async (t) => {
    await t.test("exposes validated defaults", () => {
        const resolved = resolveGmlPluginComponents();

        assert.strictEqual(
            resolved,
            gmlPluginComponents,
            "resolver should return the shared component bundle"
        );

        assert.ok(
            Object.isFrozen(resolved),
            "component bundle should be frozen"
        );
        assert.ok(
            Object.isFrozen(resolved.parsers),
            "parsers map should be frozen"
        );
        assert.ok(
            Object.isFrozen(resolved.printers),
            "printers map should be frozen"
        );
        assert.ok(
            Object.isFrozen(resolved.options),
            "options map should be frozen"
        );

        assert.ok(
            resolved.parsers["gml-parse"],
            "default parser should be registered"
        );
        assert.ok(
            resolved.printers["gml-ast"],
            "default printer should be registered"
        );
        assert.ok(
            Object.hasOwn(resolved.options, "optimizeLoopLengthHoisting"),
            "default options should be registered"
        );

        for (const removedOption of [
            "preserveLineBreaks",
            "maintainArrayIndentation",
            "maintainStructIndentation",
            "maintainWithIndentation",
            "maintainSwitchIndentation"
        ]) {
            assert.ok(
                !Object.hasOwn(resolved.options, removedOption),
                `${removedOption} should stay unregistered`
            );
        }

        assert.strictEqual(
            resolveGmlPluginComponents(),
            resolved,
            "resolver should reuse the same object reference"
        );
    });

    await t.test("allows overriding the active provider", () => {
        const customComponents = {
            parsers: {
                "custom-parse": {
                    parse: () => ({ type: "Program", body: [] })
                }
            },
            printers: {
                "custom-ast": {
                    print: () => "",
                    canAttachComment: () => false,
                    isBlockComment: () => false,
                    printComment: () => "",
                    handleComments: () => {}
                }
            },
            options: {
                customToggle: {
                    since: "0.0.0",
                    type: "boolean",
                    category: "gml",
                    default: false,
                    description: "Custom toggle for testing"
                }
            }
        };

        try {
            const resolved = setGmlPluginComponentProvider(
                () => customComponents
            );

            assert.notStrictEqual(
                resolved,
                gmlPluginComponents,
                "custom provider should replace the default bundle"
            );

            assert.ok(
                Object.isFrozen(resolved),
                "custom bundle should be frozen"
            );
            assert.ok(
                Object.isFrozen(resolved.parsers),
                "custom parsers map should be frozen"
            );

            assert.deepStrictEqual(
                Object.keys(resolved.parsers),
                ["custom-parse"],
                "custom parser should be exposed"
            );

            assert.deepStrictEqual(
                Object.keys(resolved.printers),
                ["custom-ast"],
                "custom printer should be exposed"
            );

            assert.ok(
                Object.hasOwn(resolved.options, "customToggle"),
                "custom options should be exposed"
            );

            assert.strictEqual(
                resolveGmlPluginComponents(),
                resolved,
                "resolver should cache the custom bundle"
            );
        } finally {
            restoreDefaultGmlPluginComponents();
        }
    });

    await t.test("plugin exports track provider overrides", () => {
        const customComponents = {
            parsers: {
                "custom-parse": {
                    parse: () => ({ type: "Program", body: [] })
                }
            },
            printers: {
                "custom-ast": {
                    print: () => "",
                    canAttachComment: () => false,
                    isBlockComment: () => false,
                    printComment: () => "",
                    handleComments: () => {}
                }
            },
            options: {
                customToggle: {
                    since: "0.0.0",
                    type: "boolean",
                    category: "gml",
                    default: false,
                    description: "Custom toggle for testing"
                }
            }
        };

        try {
            setGmlPluginComponentProvider(() => customComponents);

            assert.deepStrictEqual(
                Object.keys(gmlPlugin.parsers),
                ["custom-parse"],
                "parsers proxy should surface custom parser entries"
            );

            assert.deepStrictEqual(
                Object.keys(gmlPlugin.printers),
                ["custom-ast"],
                "printers proxy should surface custom printer entries"
            );

            assert.deepStrictEqual(
                Object.keys(gmlPlugin.options),
                ["customToggle"],
                "options proxy should surface custom option entries"
            );

            const defaults = { ...gmlPlugin.defaultOptions };

            assert.strictEqual(
                defaults.customToggle,
                false,
                "default options proxy should surface custom option defaults"
            );
            assert.strictEqual(
                defaults.trailingComma,
                "none",
                "core option overrides should remain in effect"
            );
        } finally {
            restoreDefaultGmlPluginComponents();
        }

        assert.ok(
            Object.hasOwn(gmlPlugin.parsers, "gml-parse"),
            "parsers proxy should expose default parser after restore"
        );
        assert.ok(
            Object.hasOwn(gmlPlugin.printers, "gml-ast"),
            "printers proxy should expose default printer after restore"
        );
        assert.ok(
            Object.hasOwn(gmlPlugin.options, "optimizeLoopLengthHoisting"),
            "options proxy should expose default option entries after restore"
        );
        assert.strictEqual(
            gmlPlugin.defaultOptions.trailingComma,
            "none",
            "default options proxy should expose overrides after restore"
        );
    });

    await t.test("restoring defaults reuses the baseline components", () => {
        const resolved = restoreDefaultGmlPluginComponents();

        assert.strictEqual(
            resolved,
            gmlPluginComponents,
            "restore should return the default bundle"
        );

        assert.strictEqual(
            resolveGmlPluginComponents(),
            gmlPluginComponents,
            "resolver should fall back to the default bundle"
        );
    });
});
