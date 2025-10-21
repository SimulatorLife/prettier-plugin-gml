import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
    disposeProgressBars,
    renderProgressBar,
    withProgressBarCleanup
} from "../lib/progress-bar.js";

function createMockStdout() {
    return {
        isTTY: true,
        clearLine: () => {},
        cursorTo: () => {},
        moveCursor: () => {},
        on: () => {},
        removeListener: () => {},
        write: () => {}
    };
}

describe("progress bar cleanup", () => {
    it("disposes active progress bars when callbacks fail", async () => {
        const stdout = createMockStdout();
        const stopMock = mock.fn();
        const createBar = mock.fn(() => ({
            setTotal: () => {},
            update: () => {},
            start: () => {},
            stop: (...args) => {
                stopMock(...args);
            }
        }));
        try {
            await assert.rejects(
                withProgressBarCleanup(async () => {
                    renderProgressBar("Task", 0, 2, 10, {
                        stdout,
                        createBar
                    });
                    throw new Error("boom");
                }),
                /boom/
            );

            assert.equal(stopMock.mock.callCount(), 1);
        } finally {
            disposeProgressBars();
        }
    });
});
