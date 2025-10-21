import assert from "node:assert/strict";
import test from "node:test";

import {
    addGmlPluginComponentObserver,
    gmlPluginComponents,
    resolveGmlPluginComponents,
    resetGmlPluginComponentProvider,
    setGmlPluginComponentProvider
} from "../src/plugin-components.js";

test("GML plugin components expose validated defaults", () => {
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
    "GML plugin component providers can be overridden and reset",
    { concurrency: false },
    () => {
        const original = resolveGmlPluginComponents();

        const customComponents = {
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

        const overridden = setGmlPluginComponentProvider(
            () => customComponents
        );

        assert.notStrictEqual(
            overridden,
            original,
            "overrides should replace the default bundle"
        );
        assert.strictEqual(
            overridden,
            gmlPluginComponents,
            "module export should mirror the overridden bundle"
        );
        assert.ok(
            Object.isFrozen(overridden),
            "overridden bundle should be normalized and frozen"
        );
        assert.ok(
            overridden.parsers["custom-parser"],
            "custom parser should be registered"
        );

        assert.strictEqual(
            resolveGmlPluginComponents(),
            overridden,
            "resolver should reuse the overridden bundle"
        );

        const reset = resetGmlPluginComponentProvider();

        assert.notStrictEqual(
            reset,
            overridden,
            "reset should restore the default bundle"
        );
        assert.strictEqual(
            reset,
            gmlPluginComponents,
            "module export should mirror the reset default bundle"
        );
        assert.ok(
            reset.parsers["gml-parse"],
            "default parser should be restored after reset"
        );
    }
);

test(
    "GML plugin component observers receive change notifications",
    { concurrency: false },
    () => {
        const notifications = [];
        const unsubscribe = addGmlPluginComponentObserver((components) => {
            notifications.push(components);
        });

        const customComponents = {
            parsers: {
                "observer-parser": {
                    parse: (text) => ({ text })
                }
            },
            printers: {
                "observer-printer": {
                    print() {
                        return "";
                    }
                }
            },
            options: {
                "observer-option": {
                    since: "test",
                    category: "test",
                    type: "boolean",
                    default: true
                }
            }
        };

        const overridden = setGmlPluginComponentProvider(
            () => customComponents
        );

        assert.strictEqual(
            notifications.at(-1),
            overridden,
            "observers should be notified when the provider changes"
        );

        notifications.length = 0;
        unsubscribe();

        const reset = resetGmlPluginComponentProvider();

        assert.strictEqual(
            notifications.length,
            0,
            "unsubscribed observers should not receive notifications"
        );

        assert.strictEqual(
            reset,
            gmlPluginComponents,
            "reset should still restore the default bundle"
        );
    }
);
