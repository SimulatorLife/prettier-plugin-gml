import assert from "node:assert/strict";
import { describe, it } from "node:test";

void describe("formatting session negation tracking", () => {
    void it("resets negated ignore rule tracking between runs", async () => {
        const skipEnvVar = "PRETTIER_PLUGIN_GML_SKIP_CLI_RUN";
        const originalSkipRun = process.env[skipEnvVar];
        process.env[skipEnvVar] = "1";
        let restored = false;

        const restoreSkipEnv = () => {
            if (restored) {
                return;
            }
            restored = true;
            if (originalSkipRun === undefined) {
                delete process.env[skipEnvVar];
            } else {
                process.env[skipEnvVar] = originalSkipRun;
            }
        };

        try {
            const [{ __test__ }, tracker] = await Promise.all([
                import("../src/cli.js"),
                import("../src/shared/ignore-rules-negation-tracker.js")
            ]);

            const { ignoreRuleNegations } = tracker;

            ignoreRuleNegations.detected = false;
            ignoreRuleNegations.detected = true;
            assert.equal(ignoreRuleNegations.detected, true);

            const resetPromise =
                __test__.resetFormattingSessionForTests("skip");

            restoreSkipEnv();
            await resetPromise;

            assert.equal(ignoreRuleNegations.detected, false);

            ignoreRuleNegations.detected = false;
        } catch (error) {
            restoreSkipEnv();
            throw error;
        }
    });
});
