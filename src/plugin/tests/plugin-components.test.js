import assert from "node:assert/strict";
import test from "node:test";

import {
    gmlPluginComponents,
    hasRegisteredGmlPluginComponentProvider,
    registerGmlPluginComponentProvider,
    resetGmlPluginComponentProvider,
    resolveGmlPluginComponents
} from "../src/plugin-components.js";

test("GML plugin components expose validated defaults", () => {
    resetGmlPluginComponentProvider();

    assert.ok(
        !hasRegisteredGmlPluginComponentProvider(),
        "no custom provider should be registered by default"
    );

    const resolved = resolveGmlPluginComponents();

    assert.strictEqual(
        resolved,
        gmlPluginComponents,
        "resolver should return the shared component bundle"
    );

    assert.ok(Object.isFrozen(resolved), "component bundle should be frozen");
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

    // The formatter is intentionally opinionated—legacy indentation toggles must stay removed.
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

test("GML plugin components cannot be mutated", () => {
    resetGmlPluginComponentProvider();

    const resolved = resolveGmlPluginComponents();

    assert.throws(
        () => {
            resolved.parsers.custom = { parse: () => ({}) };
        },
        TypeError,
        "frozen parser map should reject new entries"
    );

    assert.throws(
        () => {
            resolved.options.extra = { default: true };
        },
        TypeError,
        "frozen option map should reject new entries"
    );
});

test(
    "GML plugin component providers can be overridden",
    { concurrency: false },
    () => {
        resetGmlPluginComponentProvider();

        const customParser = { parse: () => ({}) };
        const customPrinter = { print: () => "printed" };
        const customComponents = {
            parsers: { custom: customParser },
            printers: { custom: customPrinter },
            options: {
                customOption: {
                    since: "0.0.0",
                    type: "boolean",
                    default: false
                }
            }
        };

        try {
            const resolved = registerGmlPluginComponentProvider(
                () => customComponents
            );

            assert.ok(
                hasRegisteredGmlPluginComponentProvider(),
                "custom provider should be registered"
            );
            assert.strictEqual(
                resolveGmlPluginComponents(),
                resolved,
                "resolver should return cached custom components"
            );
            assert.notStrictEqual(
                gmlPluginComponents,
                resolved,
                "default component bundle should remain available"
            );
            assert.strictEqual(
                resolved.parsers.custom,
                customParser,
                "custom parser should be exposed"
            );
            assert.strictEqual(
                resolved.printers.custom,
                customPrinter,
                "custom printer should be exposed"
            );
            assert.ok(
                Object.hasOwn(resolved.options, "customOption"),
                "custom option should be exposed"
            );
        } finally {
            resetGmlPluginComponentProvider();
            assert.ok(
                !hasRegisteredGmlPluginComponentProvider(),
                "registry should reset to defaults"
            );
        }
    }
);
