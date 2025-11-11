import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSampleLimitRuntimeOption } from "../src/runtime-options/sample-limit-toolkit.js";

const TEST_SAMPLE_LIMIT_ENV_VAR = "PRETTIER_PLUGIN_GML_TEST_SAMPLE_LIMIT";

describe("createSampleLimitRuntimeOption", () => {
    it("applies the environment override during initialization", () => {
        const env = { [TEST_SAMPLE_LIMIT_ENV_VAR]: "13" };
        const { getDefault } = createSampleLimitRuntimeOption(
            {
                defaultValue: 2,
                envVar: TEST_SAMPLE_LIMIT_ENV_VAR,
                subjectLabel: "Test sample"
            },
            { env }
        );

        assert.strictEqual(getDefault(), 13);
    });

    it("reuses the provided environment map when reapplying overrides", () => {
        const env = { [TEST_SAMPLE_LIMIT_ENV_VAR]: "4" };

        const { getDefault, applyEnvOverride } = createSampleLimitRuntimeOption(
            {
                defaultValue: 1,
                envVar: TEST_SAMPLE_LIMIT_ENV_VAR,
                subjectLabel: "Test sample"
            },
            { env }
        );

        assert.strictEqual(getDefault(), 4);

        env[TEST_SAMPLE_LIMIT_ENV_VAR] = "7";
        applyEnvOverride();
        assert.strictEqual(getDefault(), 7);

        applyEnvOverride({ [TEST_SAMPLE_LIMIT_ENV_VAR]: "5" });
        assert.strictEqual(getDefault(), 5);
    });
});
