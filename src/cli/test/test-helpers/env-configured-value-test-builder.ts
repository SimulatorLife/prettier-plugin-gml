import assert from "node:assert/strict";
import { afterEach, it } from "node:test";

/**
 * Test configuration for environment-configured values.
 *
 * Defines the minimal interface needed to generate standard test cases for
 * getter/setter/env-override patterns used throughout the CLI module.
 */
interface EnvConfiguredValueTestConfig<T> {
    /**
     * Human-readable description of the value being tested (e.g., "parser iteration limit").
     */
    description: string;

    /**
     * The canonical default value for this configuration.
     */
    defaultValue: T;

    /**
     * Environment variable name used for overrides.
     */
    envVar: string;

    /**
     * Function to retrieve the current configured value.
     */
    getValue: () => T | undefined;

    /**
     * Function to set the configured value.
     */
    setValue: (value: T) => void;

    /**
     * Function to apply environment variable overrides.
     */
    applyEnvOverride: (env: Record<string, string>) => void;

    /**
     * Optional test value to use in override tests (defaults to a value different from default).
     */
    testOverrideValue?: T;

    /**
     * Optional string representation of the test value for env var (defaults to String(testOverrideValue)).
     */
    testOverrideEnvString?: string;
}

/**
 * Build standard test cases for environment-configured values.
 *
 * This factory generates the common test patterns used across CLI configuration
 * modules (memory iterations, parser limits, progress bar width, etc.), eliminating
 * duplication in test files that follow the getter/setter/env-override pattern.
 *
 * The generated tests verify:
 * - Default value retrieval
 * - Programmatic value override
 * - Environment variable override
 *
 * @template T Type of the configured value
 * @param config Test configuration defining the value, accessors, and overrides
 */
export function buildEnvConfiguredValueTests<T>(config: EnvConfiguredValueTestConfig<T>): void {
    const {
        description,
        defaultValue,
        envVar,
        getValue,
        setValue,
        applyEnvOverride,
        testOverrideValue,
        testOverrideEnvString
    } = config;

    const overrideValue = testOverrideValue === undefined ? getDefaultTestValue(defaultValue) : testOverrideValue;
    const overrideEnvString = testOverrideEnvString ?? String(overrideValue);

    afterEach(() => {
        setValue(defaultValue);
    });

    void it(`returns the baseline default ${description} when no overrides are applied`, () => {
        setValue(defaultValue);
        assert.equal(getValue(), defaultValue);
    });

    void it(`allows overriding the default ${description}`, () => {
        setValue(defaultValue);
        setValue(overrideValue);
        assert.equal(getValue(), overrideValue);
    });

    void it(`applies environment overrides to the default ${description}`, () => {
        setValue(defaultValue);
        applyEnvOverride({ [envVar]: overrideEnvString });
        assert.equal(getValue(), overrideValue);
    });
}

/**
 * Generate a reasonable test value different from the default.
 *
 * For numeric values, returns a value roughly double the default.
 * For strings, appends a suffix.
 * For other types, returns the default (caller should provide explicit testOverrideValue).
 */
function getDefaultTestValue<T>(defaultValue: T): T {
    if (typeof defaultValue === "number") {
        return Math.max(1, Math.floor(defaultValue * 2)) as unknown as T;
    }

    if (typeof defaultValue === "string") {
        return `${defaultValue}-override` as T;
    }

    return defaultValue;
}
