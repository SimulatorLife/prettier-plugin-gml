import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    disposeProgressBars,
    renderProgressBar,
    setProgressBarFactoryForTesting
} from "../manual/manual-cli-helpers.js";

class FakeProgressBar {
    constructor(label, width) {
        this.label = label;
        this.width = width;
        this.total = 0;
        this.value = 0;
        this.stopCalls = 0;
    }

    start(total, value) {
        this.total = total;
        this.value = value;
    }

    setTotal(total) {
        this.total = total;
    }

    update(value) {
        this.value = value;
    }

    stop() {
        this.stopCalls += 1;
    }
}

describe("manual CLI helpers", () => {
    it("disposes active progress bars", () => {
        const createdBars = [];
        setProgressBarFactoryForTesting((label, width) => {
            const bar = new FakeProgressBar(label, width);
            createdBars.push(bar);
            return bar;
        });

        const originalIsTTY = process.stdout.isTTY;
        process.stdout.isTTY = true;

        try {
            disposeProgressBars();
            renderProgressBar("Task", 1, 4, 10);
            renderProgressBar("Task", 2, 4, 10);

            assert.equal(createdBars.length, 1);
            assert.equal(createdBars[0].stopCalls, 0);

            disposeProgressBars();
            assert.equal(createdBars[0].stopCalls, 1);

            disposeProgressBars();
            assert.equal(createdBars[0].stopCalls, 1);

            renderProgressBar("Task", 3, 4, 10);
            assert.equal(createdBars.length, 2);
        } finally {
            process.stdout.isTTY = originalIsTTY;
            setProgressBarFactoryForTesting(null);
            disposeProgressBars();
        }
    });
});
