import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_MAX_FORMAT_ITERATIONS,
    MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR,
    applyFormatMaxIterationsEnvOverride,
    getMaxFormatIterations,
    setMaxFormatIterations
} from "../features/memory/index.js";

describe("memory format iteration limit configuration", () => {
    afterEach(() => {
        setMaxFormatIterations(DEFAULT_MAX_FORMAT_ITERATIONS);
    });

    it("returns the baseline limit when no overrides are applied", () => {
        setMaxFormatIterations(DEFAULT_MAX_FORMAT_ITERATIONS);

        assert.equal(getMaxFormatIterations(), DEFAULT_MAX_FORMAT_ITERATIONS);
    });

    it("allows overriding the format iteration limit", () => {
        setMaxFormatIterations(DEFAULT_MAX_FORMAT_ITERATIONS);

        setMaxFormatIterations(12);

        assert.equal(getMaxFormatIterations(), 12);
    });

    it("applies environment overrides to the format iteration limit", () => {
        setMaxFormatIterations(DEFAULT_MAX_FORMAT_ITERATIONS);

        applyFormatMaxIterationsEnvOverride({
            [MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR]: "18"
        });

        assert.equal(getMaxFormatIterations(), 18);
    });

    it("ignores invalid environment overrides", () => {
        setMaxFormatIterations(DEFAULT_MAX_FORMAT_ITERATIONS);

        applyFormatMaxIterationsEnvOverride({
            [MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR]: "-5"
        });

        assert.equal(getMaxFormatIterations(), DEFAULT_MAX_FORMAT_ITERATIONS);
    });
});
