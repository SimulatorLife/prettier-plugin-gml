import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
    TerminalProgressBar,
    disposeProgressBars,
    renderProgressBar,
    withProgressBarCleanup
} from "../lib/progress-bar.js";

describe("progress bar cleanup", () => {
    it("disposes active progress bars when callbacks fail", async () => {
        const originalIsTTY = process.stdout.isTTY;
        const stopMock = mock.method(
            TerminalProgressBar.prototype,
            "stop",
            function (...args) {
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
