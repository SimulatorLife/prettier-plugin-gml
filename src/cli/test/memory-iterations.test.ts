import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_ITERATIONS,
    MEMORY_ITERATIONS_ENV_VAR,
    applyMemoryEnvOptionOverrides,
    applyMemoryIterationsEnvOverride,
    getDefaultMemoryIterations,
    resolveMemoryIterations,
    setDefaultMemoryIterations
} from "../src/modules/memory/index.js";
import { isCliUsageError } from "../src/cli-core/errors.js";

void describe("memory iteration configuration", () => {
    afterEach(() => {
        setDefaultMemoryIterations(DEFAULT_ITERATIONS);
    });

    void it("returns the baseline default when no overrides are applied", () => {
        setDefaultMemoryIterations(DEFAULT_ITERATIONS);

        assert.equal(getDefaultMemoryIterations(), DEFAULT_ITERATIONS);
    });

    void it("allows overriding the default iteration count", () => {
        setDefaultMemoryIterations(DEFAULT_ITERATIONS);

        setDefaultMemoryIterations(125_000);

        assert.equal(getDefaultMemoryIterations(), 125_000);
        assert.equal(resolveMemoryIterations(), 125_000);
    });

    void it("normalizes string inputs when resolving iteration counts", () => {
        setDefaultMemoryIterations(10_000);

        assert.equal(resolveMemoryIterations(" 25000 "), 25_000);
    });

    void it("applies environment overrides to the default iteration count", () => {
        setDefaultMemoryIterations(DEFAULT_ITERATIONS);

        applyMemoryIterationsEnvOverride({
            [MEMORY_ITERATIONS_ENV_VAR]: "750000"
        });

        assert.equal(getDefaultMemoryIterations(), 750_000);
    });

    void it("applies environment overrides to commands", () => {
        const calls = [];
        const command = {
            setOptionValueWithSource(...args) {
                calls.push(args);
            }
        };

        applyMemoryEnvOptionOverrides({
            command,
            env: {
                [MEMORY_ITERATIONS_ENV_VAR]: "120000"
            }
        });

        assert.deepEqual(calls, [["iterations", 120_000, "env"]]);
    });

    void it("wraps invalid environment overrides in usage errors", () => {
        const command = {
            setOptionValueWithSource() {
                throw new Error("should not be called");
            }
        };

        assert.throws(
            () =>
                applyMemoryEnvOptionOverrides({
                    command,
                    env: { [MEMORY_ITERATIONS_ENV_VAR]: "abc" }
                }),
            (error) => isCliUsageError(error)
        );
    });
});
