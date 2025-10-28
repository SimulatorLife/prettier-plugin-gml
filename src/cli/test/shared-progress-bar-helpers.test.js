import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import {
    disposeProgressBars,
    renderProgressBar,
    resetProgressBarRegistryForTesting
} from "../src/runtime-options/progress-bar.js";
import { SingleBar } from "cli-progress";

function createMockStdout() {
    return {
        isTTY: true,
        columns: 80,
        clearLine: () => {},
        clearScreenDown: () => {},
        cursor: () => {},
        cursorSave: () => {},
        cursorRestore: () => {},
        cursorTo: () => {},
        moveCursor: () => {},
        lineWrapping: () => {},
        on: () => {},
        removeListener: () => {},
        write: () => {}
    };
}

describe("manual CLI helpers", () => {
    afterEach(() => {
        mock.restoreAll();
        resetProgressBarRegistryForTesting();
    });

    it("creates default progress bars when no factory override is provided", () => {
        const stdout = createMockStdout();

        const startMock = mock.method(SingleBar.prototype, "start", () => {});
        const updateMock = mock.method(SingleBar.prototype, "update", () => {});
        const setTotalMock = mock.method(
            SingleBar.prototype,
            "setTotal",
            () => {}
        );
        const stopMock = mock.method(SingleBar.prototype, "stop", () => {});

        renderProgressBar("Task", 0, 3, 10, { stdout });
        renderProgressBar("Task", 1, 3, 10, { stdout });
        renderProgressBar("Task", 3, 3, 10, { stdout });

        assert.equal(startMock.mock.callCount(), 1);
        assert.equal(setTotalMock.mock.callCount(), 2);
        assert.equal(updateMock.mock.callCount(), 2);
        assert.equal(stopMock.mock.callCount(), 1);
    });

    it("disposes active progress bars", () => {
        const createdBars = new Set();
        const stopCounts = new Map();
        const stdout = createMockStdout();
        const createBar = mock.fn(() => {
            const bar = {
                setTotal: () => {},
                update: () => {}
            };

            bar.start = () => {
                createdBars.add(bar);
            };

            bar.stop = () => {
                stopCounts.set(bar, (stopCounts.get(bar) ?? 0) + 1);
            };

            return bar;
        });

        disposeProgressBars();
        renderProgressBar("Task", 1, 4, 10, { stdout, createBar });
        renderProgressBar("Task", 2, 4, 10, { stdout, createBar });

        assert.equal(createdBars.size, 1);
        const [firstBar] = createdBars;
        assert.equal(stopCounts.get(firstBar) ?? 0, 0);

        disposeProgressBars();
        assert.equal(stopCounts.get(firstBar), 1);

        disposeProgressBars();
        assert.equal(stopCounts.get(firstBar), 1);

        renderProgressBar("Task", 3, 4, 10, { stdout, createBar });
        assert.equal(createdBars.size, 2);
    });

    it("stops active progress bars when rendering becomes unavailable", () => {
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

        renderProgressBar("Task", 0, 5, 10, { stdout, createBar });
        renderProgressBar("Task", 1, 5, 10, { stdout, createBar });

        const nonInteractiveStdout = { ...stdout, isTTY: false };
        renderProgressBar("Task", 2, 5, 10, {
            stdout: nonInteractiveStdout,
            createBar
        });

        assert.equal(stopMock.mock.callCount(), 1);

        const stopCountAfterDisable = stopMock.mock.callCount();

        renderProgressBar("Task", 0, 5, 10, { stdout, createBar });
        renderProgressBar("Task", 5, 5, 10, { stdout, createBar });

        assert.equal(createBar.mock.callCount(), 2);
        assert.equal(stopMock.mock.callCount(), stopCountAfterDisable + 1);
    });
});
