import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatDuration, timeSync } from "../lib/time-utils.js";

function withMockedConsole(callback) {
    const originalLog = console.log;
    try {
        const calls = [];
        console.log = (...args) => {
            calls.push(args);
        };
        return callback(calls);
    } finally {
        console.log = originalLog;
    }
}

describe("time-utils", () => {
    describe("formatDuration", () => {
        it("returns millisecond precision for sub-second durations", () => {
            const now = () => 200;
            assert.equal(formatDuration(0, now), "200ms");
        });

        it("returns seconds with a decimal when duration exceeds a second", () => {
            const now = () => 1500;
            assert.equal(formatDuration(0, now), "1.5s");
        });
    });

    it("logs progress when verbose parsing is enabled", () => {
        const timeline = [1000, 1300];
        const now = () => timeline.shift() ?? 1300;

        const { value, calls } = withMockedConsole((capturedCalls) => {
            const callbackResult = timeSync("sample task", () => 42, {
                verbose: { parsing: true },
                now
            });

            return { value: callbackResult, calls: capturedCalls };
        });

        assert.equal(value, 42);
        assert.deepEqual(
            calls.map(([message]) => message),
            ["→ sample task", "  sample task completed in 300ms."]
        );
    });

    it("skips logging when verbose parsing is disabled", () => {
        const calls = withMockedConsole((capturedCalls) => {
            const result = timeSync("quiet task", () => "done", {
                verbose: { parsing: false }
            });

            assert.equal(result, "done");
            return capturedCalls;
        });

        assert.equal(calls.length, 0);
    });
});
