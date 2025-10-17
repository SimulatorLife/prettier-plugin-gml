import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { timeSync } from "../lib/time-utils.js";

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
    it("logs progress when verbose parsing is enabled", () => {
        const originalNow = Date.now;
        let invocation = 0;
        Date.now = () => {
            invocation += 1;
            return invocation === 1 ? 1000 : 1300;
        };

        try {
            const { value, calls } = withMockedConsole((capturedCalls) => {
                const callbackResult = timeSync("sample task", () => 42, {
                    verbose: { parsing: true }
                });

                return { value: callbackResult, calls: capturedCalls };
            });

            assert.equal(value, 42);
            assert.deepEqual(
                calls.map(([message]) => message),
                ["→ sample task", "  sample task completed in 300ms."]
            );
        } finally {
            Date.now = originalNow;
        }
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
