import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CliUsageError } from "../cli-errors.js";
import {
    applyEnvOptionOverride,
    applyEnvOptionOverrides
} from "../options/env-overrides.js";

describe("applyEnvOptionOverride", () => {
    it("sets the option when the environment variable is defined", () => {
        const calls = [];
        const command = {
            setOptionValueWithSource(...args) {
                calls.push(args);
            }
        };

        applyEnvOptionOverride({
            command,
            env: { TEST_VALUE: "value" },
            envVar: "TEST_VALUE",
            optionName: "testOption"
        });

        assert.deepEqual(calls, [["testOption", "value", "env"]]);
    });

    it("ignores undefined environment variables", () => {
        const command = {
            setOptionValueWithSource() {
                throw new Error("should not be called");
            }
        };

        applyEnvOptionOverride({
            command,
            env: {},
            envVar: "MISSING",
            optionName: "testOption"
        });
    });

    it("wraps resolver failures in a CliUsageError and preserves usage", () => {
        const command = {
            setOptionValueWithSource() {
                throw new Error("should not be called");
            }
        };

        assert.throws(
            () =>
                applyEnvOptionOverride({
                    command,
                    env: { TEST_VALUE: "value" },
                    envVar: "TEST_VALUE",
                    optionName: "testOption",
                    resolveValue() {
                        throw new Error("bad value");
                    },
                    getUsage: () => "usage information"
                }),
            (error) => {
                assert.ok(error instanceof CliUsageError);
                assert.equal(error.message, "bad value");
                assert.equal(error.usage, "usage information");
                return true;
            }
        );
    });

    it("provides a fallback error message when the resolver throws without one", () => {
        const command = {
            setOptionValueWithSource() {
                throw new Error("should not be called");
            }
        };

        assert.throws(
            () =>
                applyEnvOptionOverride({
                    command,
                    env: { TEST_VALUE: "value" },
                    envVar: "TEST_VALUE",
                    optionName: "testOption",
                    resolveValue() {
                        throw new Error("Error when resolving");
                    }
                }),
            (error) => {
                assert.ok(error instanceof CliUsageError);
                assert.equal(
                    error.message,
                    "Invalid value provided for TEST_VALUE."
                );
                return true;
            }
        );
    });
});

describe("applyEnvOptionOverrides", () => {
    it("applies each override when the environment variables are defined", () => {
        const calls = [];
        const command = {
            setOptionValueWithSource(...args) {
                calls.push(args);
            }
        };

        applyEnvOptionOverrides({
            command,
            env: {
                FIRST: "value",
                SECOND: "42"
            },
            overrides: [
                { envVar: "FIRST", optionName: "firstOption" },
                {
                    envVar: "SECOND",
                    optionName: "secondOption",
                    resolveValue(value) {
                        return Number.parseInt(value, 10);
                    }
                }
            ]
        });

        assert.deepEqual(calls, [
            ["firstOption", "value", "env"],
            ["secondOption", 42, "env"]
        ]);
    });

    it("respects a shared getUsage fallback", () => {
        const command = {
            setOptionValueWithSource() {
                throw new Error("should not be called");
            }
        };

        assert.throws(
            () =>
                applyEnvOptionOverrides({
                    command,
                    env: { BAD: "value" },
                    overrides: [
                        {
                            envVar: "BAD",
                            optionName: "badOption",
                            resolveValue() {
                                throw new Error("not allowed");
                            }
                        }
                    ],
                    getUsage: () => "usage info"
                }),
            (error) => {
                assert.ok(error instanceof CliUsageError);
                assert.equal(error.message, "not allowed");
                assert.equal(error.usage, "usage info");
                return true;
            }
        );
    });

    it("prefers override-level getUsage when provided", () => {
        const command = {
            setOptionValueWithSource() {
                throw new Error("should not be called");
            }
        };

        assert.throws(
            () =>
                applyEnvOptionOverrides({
                    command,
                    env: { BAD: "value" },
                    overrides: [
                        {
                            envVar: "BAD",
                            optionName: "badOption",
                            resolveValue() {
                                throw new Error("not allowed");
                            },
                            getUsage: () => "override usage"
                        }
                    ],
                    getUsage: () => "shared usage"
                }),
            (error) => {
                assert.ok(error instanceof CliUsageError);
                assert.equal(error.message, "not allowed");
                assert.equal(error.usage, "override usage");
                return true;
            }
        );
    });
});
