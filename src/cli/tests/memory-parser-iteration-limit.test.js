import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    DEFAULT_MAX_PARSER_ITERATIONS,
    MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR,
    applyParserMaxIterationsEnvOverride,
    getMaxParserIterations,
    setMaxParserIterations
} from "../features/memory/index.js";

describe("memory parser iteration limit configuration", () => {
    afterEach(() => {
        setMaxParserIterations(DEFAULT_MAX_PARSER_ITERATIONS);
    });

    it("returns the baseline limit when no overrides are applied", () => {
        setMaxParserIterations(DEFAULT_MAX_PARSER_ITERATIONS);

        assert.equal(getMaxParserIterations(), DEFAULT_MAX_PARSER_ITERATIONS);
    });

    it("allows overriding the parser iteration limit", () => {
        setMaxParserIterations(DEFAULT_MAX_PARSER_ITERATIONS);

        setMaxParserIterations(12);

        assert.equal(getMaxParserIterations(), 12);
    });

    it("applies environment overrides to the parser iteration limit", () => {
        setMaxParserIterations(DEFAULT_MAX_PARSER_ITERATIONS);

        applyParserMaxIterationsEnvOverride({
            [MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR]: "18"
        });

        assert.equal(getMaxParserIterations(), 18);
    });

    it("ignores invalid environment overrides", () => {
        setMaxParserIterations(DEFAULT_MAX_PARSER_ITERATIONS);

        applyParserMaxIterationsEnvOverride({
            [MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR]: "-5"
        });

        assert.equal(getMaxParserIterations(), DEFAULT_MAX_PARSER_ITERATIONS);
    });
});
