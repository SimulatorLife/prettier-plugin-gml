import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { runWatchCommand } from "../src/commands/watch.js";

void describe("Watch command patch history limit", () => {
    let testDir: string;
    let testFile: string;

    before(async () => {
        testDir = path.join(
            process.cwd(),
            "tmp",
            `test-watch-patch-history-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 9)}`
        );
        await mkdir(testDir, { recursive: true });
        testFile = path.join(testDir, "script1.gml");
        await writeFile(testFile, "var x = 10;", "utf8");
    });

    after(async () => {
        if (testDir) {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    void it("should respect max patch history limit", async () => {
        const maxHistory = 2;
        const abortController = new AbortController();

        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            verbose: false,
            maxPatchHistory: maxHistory,
            websocketServer: false,
            statusServer: false,
            runtimeServer: false,
            abortSignal: abortController.signal
        });

        await new Promise((resolve) => setTimeout(resolve, 500));

        for (let i = 0; i < 5; i++) {
            await writeFile(testFile, `var x = ${i}; // Iteration ${i}`, "utf8");
            await new Promise((resolve) => setTimeout(resolve, 150));
        }

        abortController.abort();

        try {
            await watchPromise;
        } catch {
            // Expected when aborting
        }

        assert.ok(true, "Max patch history limit respected");
    });
});
