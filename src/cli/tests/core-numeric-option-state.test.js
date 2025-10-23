import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    createIntegerOptionCoercer,
    createIntegerOptionState
} from "../core/numeric-option-state.js";

describe("createIntegerOptionCoercer", () => {
    it("applies the fallback error message when one is not provided", () => {
        const receivedMessages = [];

        const coerce = createIntegerOptionCoercer({
            baseCoerce(value, { createErrorMessage }) {
                receivedMessages.push(createErrorMessage("value"));
                return value * 2;
            },
            createErrorMessage: (received) => `default:${received}`
        });

        assert.equal(coerce(4), 8);
        assert.deepEqual(receivedMessages, ["default:value"]);
    });

    it("preserves caller-provided error messages", () => {
        const coerce = createIntegerOptionCoercer({
            baseCoerce(value, { createErrorMessage }) {
                return createErrorMessage(value);
            },
            createErrorMessage: () => "unused"
        });

        const result = coerce(10, {
            createErrorMessage: (received) => `caller:${received}`
        });

        assert.equal(result, "caller:10");
    });
});

describe("createIntegerOptionState", () => {
    it("tracks the default value and normalizes overrides", () => {
        const state = createIntegerOptionState({
            defaultValue: 5,
            coerce(value) {
                return Math.trunc(value);
            }
        });

        assert.equal(state.getDefault(), 5);
        assert.equal(state.resolve(), 5);
        assert.equal(state.resolve("42"), 42);

        state.setDefault("7");

        assert.equal(state.getDefault(), 7);
        assert.equal(state.resolve(), 7);
        assert.equal(state.resolve("   "), 7);
    });

    it("applies environment overrides when configured", () => {
        const state = createIntegerOptionState({
            defaultValue: 3,
            envVar: "TEST_ITERATIONS",
            coerce(value) {
                return value;
            }
        });

        assert.equal(state.applyEnvOverride({ TEST_ITERATIONS: "11" }), 11);
        assert.equal(state.getDefault(), 11);

        assert.equal(state.applyEnvOverride({}), 11);
        assert.equal(state.getDefault(), 11);
    });

    it("honours blankStringReturnsDefault=false", () => {
        const state = createIntegerOptionState({
            defaultValue: 9,
            coerce(value, { received }) {
                if (Number.isNaN(value)) {
                    return received;
                }
                return value;
            },
            blankStringReturnsDefault: false
        });

        assert.equal(state.resolve("   "), "'   '");
    });

    it("forwards custom type error messages", () => {
        const state = createIntegerOptionState({
            defaultValue: 4,
            coerce(value) {
                return value;
            },
            typeErrorMessage: (type) => `bad:${type}`
        });

        assert.throws(() => state.setDefault(Symbol.for("nope")), {
            name: "TypeError",
            message: "bad:symbol"
        });
    });

    it("applies finalize hooks to stored and resolved values", () => {
        const state = createIntegerOptionState({
            defaultValue: 2,
            coerce(value) {
                return value;
            },
            finalizeSet(value) {
                return value * 2;
            },
            finalizeResolved(value) {
                return value === undefined ? value : value + 1;
            }
        });

        assert.equal(state.getDefault(), 2);
        assert.equal(state.resolve(), 3);

        state.setDefault(5);

        assert.equal(state.getDefault(), 10);
        assert.equal(state.resolve(), 11);
        assert.equal(state.resolve(7), 8);
    });
});
