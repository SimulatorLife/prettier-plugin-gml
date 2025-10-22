import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    disposeProgressBars,
    renderProgressBar,
    setProgressBarFactoryForTesting
} from "../lib/progress-bar.js";

describe("manual CLI helpers", () => {
    it("disposes active progress bars", { concurrency: false }, () => {
        const createdBars = new Set();
        const stopCounts = new Map();

        const originalIsTTY = process.stdout.isTTY;
        process.stdout.isTTY = true;

        setProgressBarFactoryForTesting(() => {
            const bar = {
                total: 0,
                current: 0,
                stopCalls: 0,
                start(total, current) {
                    this.total = total;
                    this.current = current;
                    createdBars.add(this);
                },
                setTotal(total) {
                    this.total = total;
                },
                update(current) {
                    this.current = current;
                },
                stop() {
                    this.stopCalls += 1;
                    stopCounts.set(this, this.stopCalls);
                }
            };

            return bar;
        });

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
            setProgressBarFactoryForTesting();
            process.stdout.isTTY = originalIsTTY;
            disposeProgressBars();
        }
    });
});
