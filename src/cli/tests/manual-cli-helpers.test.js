import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
    TerminalProgressBar,
    disposeProgressBars,
    renderProgressBar
} from "../lib/progress-bar.js";

describe("manual CLI helpers", () => {
    it("disposes active progress bars", () => {
        const createdBars = new Set();
        const stopCounts = new Map();
        const originalStart = TerminalProgressBar.prototype.start;
        const originalStop = TerminalProgressBar.prototype.stop;

        const startMock = mock.method(
            TerminalProgressBar.prototype,
            "start",
            function (...args) {
                createdBars.add(this);
                return originalStart.call(this, ...args);
            }
        );
        const stopMock = mock.method(
            TerminalProgressBar.prototype,
            "stop",
            function (...args) {
                stopCounts.set(this, (stopCounts.get(this) ?? 0) + 1);
                return originalStop.call(this, ...args);
            }
        );

        const originalIsTTY = process.stdout.isTTY;
        process.stdout.isTTY = true;

        try {
            disposeProgressBars();
            renderProgressBar("Task", 1, 4, 10);
            renderProgressBar("Task", 2, 4, 10);

            assert.equal(createdBars.size, 1);
            const [firstBar] = createdBars;
            assert.equal(stopCounts.get(firstBar) ?? 0, 0);

            disposeProgressBars();
            assert.equal(stopCounts.get(firstBar), 1);

            disposeProgressBars();
            assert.equal(stopCounts.get(firstBar), 1);

            renderProgressBar("Task", 3, 4, 10);
            assert.equal(createdBars.size, 2);
        } finally {
            stopMock.mock.restore();
            startMock.mock.restore();
            process.stdout.isTTY = originalIsTTY;
            disposeProgressBars();
        }
    });
});
