import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDuration, timeSync } from "../src/utils/time.js";

function createCollectingLogger() {
    const calls = [];
    return {
        log: (...args) => {
            calls.push(args);
        },
        calls
    };
}

void describe("time-utils", () => {
    void describe("formatDuration", () => {
        void it("returns millisecond precision for sub-second durations", () => {
            const now = () => 200;
            assert.equal(formatDuration(0, now), "200ms");
        });

        void it("returns seconds with a decimal when duration exceeds a second", () => {
            const now = () => 1500;
            assert.equal(formatDuration(0, now), "1.5s");
        });

        void it("rounds noisy millisecond values near one second up to seconds", () => {
            const almostOneSecond = () => 999.999_999_999_7;
            assert.equal(formatDuration(0, almostOneSecond), "1.0s");
        });
    });

    void it("logs progress when verbose parsing is enabled", () => {
        const timeline = [1000, 1300];
        const now = () => timeline.shift() ?? 1300;
        const logger = createCollectingLogger();

        const value = timeSync("sample task", () => 42, {
            verbose: { parsing: true },
            now,
            logger
        });

        assert.equal(value, 42);
        assert.deepEqual(
            logger.calls.map(([message]) => message),
            ["→ sample task", "  sample task completed in 300ms."]
        );
    });

    void it("skips logging when verbose parsing is disabled", () => {
        const logger = createCollectingLogger();
        const result = timeSync("quiet task", () => "done", {
            verbose: { parsing: false },
            logger
        });

        assert.equal(result, "done");
        assert.equal(logger.calls.length, 0);
    });
});
