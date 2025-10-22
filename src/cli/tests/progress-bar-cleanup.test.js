import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { SingleBar } from "cli-progress";

import {
    disposeProgressBars,
    renderProgressBar,
    withProgressBarCleanup
} from "../lib/progress-bar.js";

describe("progress bar cleanup", () => {
    it("disposes active progress bars when callbacks fail", async () => {
        const originalIsTTY = process.stdout.isTTY;
        const stopMock = mock.method(
            SingleBar.prototype,
            "stop",
            function (...args) {
                // The real progress bar schedules a timer in `start` via
                // `render()`. Delegating to the original implementation keeps
                // the timer clearing logic intact so the test does not leak
                // handles when the cleanup path runs.
                return stopMock.mock.original.call(this, ...args);
            }
        );
        process.stdout.isTTY = true;

        try {
            await assert.rejects(
                withProgressBarCleanup(async () => {
                    renderProgressBar("Task", 0, 2, 10);
                    throw new Error("boom");
                }),
                /boom/
            );

            assert.equal(stopMock.mock.callCount(), 1);
        } finally {
            process.stdout.isTTY = originalIsTTY;
            stopMock.mock.restore();
            disposeProgressBars();
        }
    });
});
