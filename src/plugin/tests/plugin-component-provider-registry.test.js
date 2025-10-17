import assert from "node:assert/strict";
import test from "node:test";

import {
    registerGmlPluginComponents,
    resetRegisteredGmlPluginComponents,
    resolveGmlPluginComponents
} from "../src/plugin-components.js";

test("GML plugin component registration", async (t) => {
    t.after(() => {
        resetRegisteredGmlPluginComponents();
        resolveGmlPluginComponents();
    });

    const components = resolveGmlPluginComponents();

    assert.ok(
        components.parsers["gml-parse"],
        "default parser should be registered"
    );
    assert.ok(
        components.printers["gml-ast"],
        "default printer should be registered"
    );
    assert.ok(
        Object.hasOwn(components.options, "optimizeLoopLengthHoisting"),
        "default options should be registered"
    );

    await t.test("allows overriding the registered components", () => {
        const customComponents = {
            parsers: {
                custom: { parse: () => ({ type: "Program", body: [] }) }
            },
            printers: {
                custom: { print: () => "formatted" }
            },
            options: {
                exampleToggle: {
                    since: "test",
                    type: "boolean",
                    category: "gml",
                    default: false,
                    description: "Example toggle for testing"
                }
            }
        };

        registerGmlPluginComponents(() => customComponents);

        const resolved = resolveGmlPluginComponents();

        assert.deepEqual(resolved.parsers, {
            custom: customComponents.parsers.custom
        });
        assert.deepEqual(resolved.printers, {
            custom: customComponents.printers.custom
        });
        assert.deepEqual(resolved.options, customComponents.options);

        resetRegisteredGmlPluginComponents();
    });

    await t.test("reset restores the default components", () => {
        registerGmlPluginComponents(() => ({
            parsers: { override: { parse: () => ({}) } },
            printers: { override: { print: () => "override" } },
            options: {
                flag: {
                    since: "test",
                    type: "boolean",
                    category: "gml",
                    default: false,
                    description: "override"
                }
            }
        }));

        assert.ok(resolveGmlPluginComponents().parsers.override);

        resetRegisteredGmlPluginComponents();

        const restored = resolveGmlPluginComponents();
        assert.ok(
            restored.parsers["gml-parse"],
            "default parser should be restored"
        );
    });
});
