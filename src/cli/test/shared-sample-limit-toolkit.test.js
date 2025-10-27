import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { createInitializedSampleLimitToolkit } from "../src/runtime-options/sample-limit-toolkit.js";

const TEST_SAMPLE_LIMIT_ENV_VAR = "PRETTIER_PLUGIN_GML_TEST_SAMPLE_LIMIT";
const ORIGINAL_SAMPLE_LIMIT_ENV_VALUE = process.env[TEST_SAMPLE_LIMIT_ENV_VAR];

describe("createInitializedSampleLimitToolkit", () => {
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

        const toolkit = createInitializedSampleLimitToolkit({
            defaultValue: 2,
            envVar: TEST_SAMPLE_LIMIT_ENV_VAR,
            subjectLabel: "Test sample"
        });

        assert.strictEqual(toolkit.getDefault(), 13);
    });

    it("reuses the provided environment map when reapplying overrides", () => {
        const env = { [TEST_SAMPLE_LIMIT_ENV_VAR]: "4" };

        const toolkit = createInitializedSampleLimitToolkit(
            {
                defaultValue: 1,
                envVar: TEST_SAMPLE_LIMIT_ENV_VAR,
                subjectLabel: "Test sample"
            },
            { env }
        );

        assert.strictEqual(toolkit.getDefault(), 4);

        env[TEST_SAMPLE_LIMIT_ENV_VAR] = "7";
        toolkit.applyEnvOverride();
        assert.strictEqual(toolkit.getDefault(), 7);

        toolkit.applyEnvOverride({ [TEST_SAMPLE_LIMIT_ENV_VAR]: "5" });
        assert.strictEqual(toolkit.getDefault(), 5);
    });
});
