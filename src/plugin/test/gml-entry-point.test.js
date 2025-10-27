import assert from "node:assert/strict";
import test from "node:test";

import {
    resetGmlPluginComponentProvider,
    restoreDefaultGmlPluginComponents,
    setGmlPluginComponentProvider
} from "../src/plugin-components.js";
import * as gmlPlugin from "../src/gml.js";

function createCustomComponentBundle() {
    return {
        parsers: {
            "custom-parser": {
                parse: (text) => ({ text })
            }
        },
        printers: {
            "custom-printer": {
                print() {
                    return "";
                }
            }
        },
        options: {
            "custom-option": {
                since: "test",
                category: "test",
                type: "boolean",
                default: false
            }
        }
    };
}

test(
    "GML entry point mirrors plugin component overrides",
    { concurrency: false },
    () => {
        restoreDefaultGmlPluginComponents();

        const originalParserKeys = Object.keys(gmlPlugin.parsers);
        const originalPrinterKeys = Object.keys(gmlPlugin.printers);
        const originalOptionKeys = Object.keys(gmlPlugin.options);
        const originalDefaultOptions = { ...gmlPlugin.defaultOptions };

        try {
            setGmlPluginComponentProvider(createCustomComponentBundle);

            assert.deepStrictEqual(
                Object.keys(gmlPlugin.parsers),
                ["custom-parser"],
                "parsers export should surface overridden components"
            );

            assert.deepStrictEqual(
                Object.keys(gmlPlugin.printers),
                ["custom-printer"],
                "printers export should surface overridden components"
            );

            assert.deepStrictEqual(
                Object.keys(gmlPlugin.options),
                ["custom-option"],
                "options export should surface overridden components"
            );

            assert.ok(
                Object.hasOwn(gmlPlugin.defaultOptions, "custom-option"),
                "default options should include overrides"
            );

            const overriddenDefaults = { ...gmlPlugin.defaultOptions };

            assert.notDeepStrictEqual(
                overriddenDefaults,
                originalDefaultOptions,
                "default options should refresh when overrides apply"
            );
        } finally {
            resetGmlPluginComponentProvider();
        }

        assert.deepStrictEqual(
            Object.keys(gmlPlugin.parsers),
            originalParserKeys,
            "parsers export should reset to default components"
        );

        assert.deepStrictEqual(
            Object.keys(gmlPlugin.printers),
            originalPrinterKeys,
            "printers export should reset to default components"
        );

        assert.deepStrictEqual(
            Object.keys(gmlPlugin.options),
            originalOptionKeys,
            "options export should reset to default components"
        );

        assert.deepStrictEqual(
            gmlPlugin.defaultOptions,
            originalDefaultOptions,
            "default options should restore the initial configuration"
        );
    }
);
