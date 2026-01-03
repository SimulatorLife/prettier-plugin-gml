import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prepareManualWorkflow } from "../src/modules/manual/workflow.js";

const STUB_MANUAL_SOURCE = Object.freeze({
    root: "/manual/root",
    packageName: null,
    packageJson: null
});

void describe("manual workflow helpers", () => {
    void it("resolves manual workflow context and logs the active source", async () => {
        const messages = [];
        const result = await prepareManualWorkflow({
            outputPath: "/manual/output.json",
            quiet: false,
            log: (message) => messages.push(message),
            manualSourceResolver: async () => STUB_MANUAL_SOURCE
        });

        assert.strictEqual(result.manualSource, STUB_MANUAL_SOURCE);
        assert.ok(result.workflowPathFilter);
        assert.deepEqual(messages, ["Using manual assets from /manual/root."]);
    });

    void it("supports custom manual source message formatting", async () => {
        const messages = [];
        await prepareManualWorkflow({
            outputPath: "/tmp/output.json",
            quiet: false,
            log: (message) => messages.push(message),
            formatManualSourceMessage: ({ manualSourceDescription }) => `Manual source: ${manualSourceDescription}`,
            manualSourceResolver: async () => ({
                ...STUB_MANUAL_SOURCE,
                packageName: "game-maker-manual",
                packageJson: { version: "1.2.3" }
            })
        });

        assert.deepEqual(messages, ["Manual source: game-maker-manual@1.2.3"]);
    });

    void it("skips logging when quiet", async () => {
        const messages = [];
        await prepareManualWorkflow({
            outputPath: "/manual/output.json",
            quiet: true,
            log: (message) => messages.push(message),
            manualSourceResolver: async () => STUB_MANUAL_SOURCE
        });

        assert.deepEqual(messages, []);
    });
});
