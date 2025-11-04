import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createIntegerOptionToolkit } from "../src/core/integer-option-toolkit.js";

describe("createIntegerOptionToolkit", () => {
    it("applies the fallback error message when one is not provided", () => {
        const receivedMessages = [];

        const toolkit = createIntegerOptionToolkit({
            defaultValue: 0,
            baseCoerce(value, { createErrorMessage }) {
                receivedMessages.push(createErrorMessage("value"));
                return value * 2;
            },
            createErrorMessage: (received) => `default:${received}`
        });

        assert.equal(toolkit.coerce(4), 8);
        assert.deepEqual(receivedMessages, ["default:value"]);
    });

    it("preserves caller-provided error messages", () => {
        const toolkit = createIntegerOptionToolkit({
            defaultValue: 0,
            baseCoerce(value, { createErrorMessage }) {
                return createErrorMessage(value);
            },
            createErrorMessage: () => "unused"
        });

        const result = toolkit.coerce(10, {
            createErrorMessage: (received) => `caller:${received}`
        });

        assert.equal(result, "caller:10");
    });

    it("tracks the default value and normalizes overrides", () => {
        const toolkit = createIntegerOptionToolkit({
            defaultValue: 5,
            baseCoerce(value) {
                return Math.trunc(value);
            }
        });

        assert.equal(toolkit.getDefault(), 5);
        assert.equal(toolkit.resolve(), 5);
        assert.equal(toolkit.resolve("42"), 42);

        toolkit.setDefault("7");

        assert.equal(toolkit.getDefault(), 7);
        assert.equal(toolkit.resolve(), 7);
        assert.equal(toolkit.resolve("   "), 7);
    });

    it("applies environment overrides when configured", () => {
        const toolkit = createIntegerOptionToolkit({
            defaultValue: 3,
            envVar: "TEST_ITERATIONS",
            baseCoerce(value) {
                return value;
            }
        });

        assert.equal(toolkit.applyEnvOverride({ TEST_ITERATIONS: "11" }), 11);
        assert.equal(toolkit.getDefault(), 11);

        assert.equal(toolkit.applyEnvOverride({}), 11);
        assert.equal(toolkit.getDefault(), 11);
    });

    it("honours blankStringReturnsDefault=false", () => {
        const toolkit = createIntegerOptionToolkit({
            defaultValue: 9,
            baseCoerce(value, { received }) {
                if (Number.isNaN(value)) {
                    return received;
                }
                return value;
            },
            blankStringReturnsDefault: false
        });

        assert.equal(toolkit.resolve("   "), "'   '");
    });

    it("forwards custom type error messages", () => {
        const toolkit = createIntegerOptionToolkit({
            defaultValue: 4,
            baseCoerce(value) {
                return value;
            },
            typeErrorMessage: (type) => `bad:${type}`
        });

        assert.throws(() => toolkit.setDefault(Symbol.for("nope")), {
            name: "TypeError",
            message: "bad:symbol"
        });
    });

    it("applies finalize hooks to stored and resolved values", () => {
        const toolkit = createIntegerOptionToolkit({
            defaultValue: 2,
            baseCoerce(value) {
                return value;
            },
            finalizeSet(value) {
                return value * 2;
            },
            finalizeResolved(value) {
                return value === undefined ? value : value + 1;
            }
        });

        assert.equal(toolkit.getDefault(), 2);
        assert.equal(toolkit.resolve(), 3);

        toolkit.setDefault(5);

        assert.equal(toolkit.getDefault(), 10);
        assert.equal(toolkit.resolve(), 11);
        assert.equal(toolkit.resolve(7), 8);
    });

    it("supports defaultValueOption alias", () => {
        const toolkit = createIntegerOptionToolkit({
            defaultValue: 10,
            baseCoerce(value) {
                return Math.trunc(value);
            },
            defaultValueOption: "defaultWidth"
        });

        assert.equal(toolkit.resolve(20), 20);
        assert.equal(toolkit.resolve(undefined, { defaultWidth: 30 }), 30);
        assert.equal(toolkit.resolve(25, { defaultWidth: 30 }), 25);
    });
});
