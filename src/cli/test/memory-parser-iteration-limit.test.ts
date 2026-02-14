import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    applyParserMaxIterationsEnvOverride,
    DEFAULT_MAX_PARSER_ITERATIONS,
    getMaxParserIterations,
    MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR,
    setMaxParserIterations
} from "../src/commands/memory.js";
import { buildEnvConfiguredValueTests } from "./helpers/env-configured-value-test-builder.js";

void describe("memory parser iteration limit configuration", () => {
    buildEnvConfiguredValueTests({
        description: "parser iteration limit",
        defaultValue: DEFAULT_MAX_PARSER_ITERATIONS,
        envVar: MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR,
        getValue: getMaxParserIterations,
        setValue: setMaxParserIterations,
        applyEnvOverride: applyParserMaxIterationsEnvOverride,
        testOverrideValue: 18,
        testOverrideEnvString: "18"
    });

    afterEach(() => {
        setMaxParserIterations(DEFAULT_MAX_PARSER_ITERATIONS);
    });

    void it("ignores invalid environment overrides", () => {
        setMaxParserIterations(DEFAULT_MAX_PARSER_ITERATIONS);

        const originalWarn = console.warn;
        const warnings: Array<string> = [];
        console.warn = (...args: Array<unknown>) => {
            warnings.push(args.map(String).join(" "));
        };

        try {
            applyParserMaxIterationsEnvOverride({
                [MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR]: "-5"
            });
        } finally {
            console.warn = originalWarn;
        }

        assert.equal(getMaxParserIterations(), DEFAULT_MAX_PARSER_ITERATIONS);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], new RegExp(`${MEMORY_PARSER_MAX_ITERATIONS_ENV_VAR}`));
        assert.match(warnings[0], /falling back/i);
    });
});
