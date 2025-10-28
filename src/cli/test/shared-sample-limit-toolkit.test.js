import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createSampleLimitRuntimeOption } from "../src/runtime-options/sample-limit-toolkit.js";

const TEST_SAMPLE_LIMIT_ENV_VAR = "PRETTIER_PLUGIN_GML_TEST_SAMPLE_LIMIT";
const ORIGINAL_SAMPLE_LIMIT_ENV_VALUE = process.env[TEST_SAMPLE_LIMIT_ENV_VAR];

describe("createSampleLimitRuntimeOption", () => {
    afterEach(() => {
        if (ORIGINAL_SAMPLE_LIMIT_ENV_VALUE === undefined) {
            delete process.env[TEST_SAMPLE_LIMIT_ENV_VAR];
        } else {
            process.env[TEST_SAMPLE_LIMIT_ENV_VAR] =
                ORIGINAL_SAMPLE_LIMIT_ENV_VALUE;
        }
    });

    it("applies the environment override during initialization", () => {
        process.env[TEST_SAMPLE_LIMIT_ENV_VAR] = "13";

        const { getDefault } = createSampleLimitRuntimeOption({
            defaultValue: 2,
            envVar: TEST_SAMPLE_LIMIT_ENV_VAR,
            subjectLabel: "Test sample"
        });

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
