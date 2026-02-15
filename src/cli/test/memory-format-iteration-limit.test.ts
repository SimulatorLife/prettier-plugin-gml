import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
    applyFormatMaxIterationsEnvOverride,
    DEFAULT_MAX_FORMAT_ITERATIONS,
    getMaxFormatIterations,
    MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR,
    setMaxFormatIterations
} from "../src/commands/memory.js";
import { buildEnvConfiguredValueTests } from "./helpers/env-configured-value-test-builder.js";

void describe("memory format iteration limit configuration", () => {
    buildEnvConfiguredValueTests({
        description: "format iteration limit",
        defaultValue: DEFAULT_MAX_FORMAT_ITERATIONS,
        envVar: MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR,
        getValue: getMaxFormatIterations,
        setValue: setMaxFormatIterations,
        applyEnvOverride: applyFormatMaxIterationsEnvOverride,
        testOverrideValue: 18,
        testOverrideEnvString: "18"
    });

    afterEach(() => {
        setMaxFormatIterations(DEFAULT_MAX_FORMAT_ITERATIONS);
    });

    void it("ignores invalid environment overrides", () => {
        setMaxFormatIterations(DEFAULT_MAX_FORMAT_ITERATIONS);

        const originalWarn = console.warn;
        const warnings: Array<string> = [];
        console.warn = (...args: Array<unknown>) => {
            warnings.push(args.map(String).join(" "));
        };

        try {
            applyFormatMaxIterationsEnvOverride({
                [MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR]: "-5"
            });
        } finally {
            console.warn = originalWarn;
        }

        assert.equal(getMaxFormatIterations(), DEFAULT_MAX_FORMAT_ITERATIONS);
        assert.equal(warnings.length, 1);
        assert.match(warnings[0], new RegExp(`${MEMORY_FORMAT_MAX_ITERATIONS_ENV_VAR}`));
        assert.match(warnings[0], /falling back/i);
    });
});
