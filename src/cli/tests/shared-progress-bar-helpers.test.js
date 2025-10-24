import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import {
    disposeProgressBars,
    renderProgressBar,
    setProgressBarFactoryForTesting,
    resetProgressBarRegistryForTesting
} from "../shared/progress-bar.js";

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

describe("manual CLI helpers", () => {
    afterEach(() => {
        setProgressBarFactoryForTesting();
        resetProgressBarRegistryForTesting();
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
});
