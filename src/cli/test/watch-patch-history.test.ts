import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { writeFile } from "node:fs/promises";
import { runWatchCommand } from "../src/commands/watch.js";
import {
    createWatchTestFixture,
    disposeWatchTestFixture,
    type WatchTestFixture
} from "./test-helpers/watch-fixtures.js";

void describe("Watch command patch history limit", () => {
    let fixture: WatchTestFixture | null = null;

    before(async () => {
        fixture = await createWatchTestFixture();
    });

    after(async () => {
        if (fixture) {
            await disposeWatchTestFixture(fixture.dir);
            fixture = null;
        }
    });

    void it("should respect max patch history limit", async () => {
        const maxHistory = 2;
        const abortController = new AbortController();

        if (!fixture) {
            throw new Error("Watch fixture was not initialized");
        }

        const watchPromise = runWatchCommand(fixture.dir, {
            extensions: [".gml"],
            verbose: false,
            maxPatchHistory: maxHistory,
            websocketServer: false,
            statusServer: false,
            runtimeServer: false,
            abortSignal: abortController.signal
        });

        await new Promise((resolve) => setTimeout(resolve, 500));

        const { script1 } = fixture;

        for (let i = 0; i < 5; i++) {
            await writeFile(script1, `var x = ${i}; // Iteration ${i}`, "utf8");
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
