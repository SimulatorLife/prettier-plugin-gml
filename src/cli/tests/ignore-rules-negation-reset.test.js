import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("formatting session negation tracking", () => {
    it("resets negated ignore rule tracking between runs", async (t) => {
        const originalSkipRun = process.env.PRETTIER_PLUGIN_GML_SKIP_CLI_RUN;
        process.env.PRETTIER_PLUGIN_GML_SKIP_CLI_RUN = "1";

        try {
            const [{ __test__ }, tracker] = await Promise.all([
                import("../cli.js"),
                import("../lib/ignore-rules-negation-tracker.js")
            ]);

            const {
                hasIgnoreRuleNegations,
                markIgnoreRuleNegationsDetected,
                resetIgnoreRuleNegations
            } = tracker;

            resetIgnoreRuleNegations();
            markIgnoreRuleNegationsDetected();
            assert.equal(hasIgnoreRuleNegations(), true);

            await __test__.resetFormattingSessionForTests("skip");

            assert.equal(hasIgnoreRuleNegations(), false);

            resetIgnoreRuleNegations();
        } finally {
            if (originalSkipRun === undefined) {
                delete process.env.PRETTIER_PLUGIN_GML_SKIP_CLI_RUN;
            } else {
                process.env.PRETTIER_PLUGIN_GML_SKIP_CLI_RUN = originalSkipRun;
            }
        }
    });
});
