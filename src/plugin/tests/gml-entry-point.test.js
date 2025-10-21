import assert from "node:assert/strict";
import test from "node:test";

import {
    resetGmlPluginComponentProvider,
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
        resetGmlPluginComponentProvider();

        const originalParsers = gmlPlugin.parsers;
        const originalDefaultOptions = gmlPlugin.defaultOptions;

        const overriddenBundle = setGmlPluginComponentProvider(
            createCustomComponentBundle
        );

        assert.strictEqual(
            gmlPlugin.parsers,
            overriddenBundle.parsers,
            "parsers export should track overridden components"
        );

        assert.strictEqual(
            gmlPlugin.printers,
            overriddenBundle.printers,
            "printers export should track overridden components"
        );

        assert.strictEqual(
            gmlPlugin.options,
            overriddenBundle.options,
            "options export should track overridden components"
        );

        assert.ok(
            Object.hasOwn(gmlPlugin.defaultOptions, "custom-option"),
            "default options should include overrides"
        );

        assert.notStrictEqual(
            gmlPlugin.defaultOptions,
            originalDefaultOptions,
            "default options should refresh when overrides apply"
        );

        const resetBundle = resetGmlPluginComponentProvider();

        assert.strictEqual(
            gmlPlugin.parsers,
            resetBundle.parsers,
            "parsers export should reset to default components"
        );

        assert.strictEqual(
            gmlPlugin.printers,
            resetBundle.printers,
            "printers export should reset to default components"
        );

        assert.strictEqual(
            gmlPlugin.options,
            resetBundle.options,
            "options export should reset to default components"
        );

        assert.strictEqual(
            gmlPlugin.parsers,
            originalParsers,
            "reset should restore original parser map"
        );

        assert.deepStrictEqual(
            gmlPlugin.defaultOptions,
            originalDefaultOptions,
            "default options should restore the initial configuration"
        );
    }
);
