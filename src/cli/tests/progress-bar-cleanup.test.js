import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    disposeProgressBars,
    renderProgressBar,
    setProgressBarFactoryForTesting,
    withProgressBarCleanup
} from "../lib/progress-bar.js";

describe("progress bar cleanup", () => {
    it(
        "disposes active progress bars when callbacks fail",
        { concurrency: false },
        async () => {
            const originalIsTTY = process.stdout.isTTY;
            process.stdout.isTTY = true;
            let createdBar;

            setProgressBarFactoryForTesting(() => {
                createdBar = {
                    start() {
                        // no-op
                    },
                    setTotal() {
                        // no-op
                    },
                    update() {
                        // no-op
                    },
                    stopCalls: 0,
                    stop() {
                        this.stopCalls += 1;
                    }
                };

                return createdBar;
            });

            try {
                await assert.rejects(
                    withProgressBarCleanup(async () => {
                        renderProgressBar("Task", 0, 2, 10);
                        throw new Error("boom");
                    }),
                    /boom/
                );

                assert.equal(createdBar?.stopCalls, 1);
            } finally {
                process.stdout.isTTY = originalIsTTY;
                setProgressBarFactoryForTesting();
                disposeProgressBars();
            }
        }
    );
});
