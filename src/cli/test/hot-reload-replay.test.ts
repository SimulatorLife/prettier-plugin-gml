/**
 * Ensures late WebSocket subscribers receive the latest patch backlog.
 *
 * This test writes a GML file to trigger transpilation before any WebSocket
 * client is connected, then connects a client and expects the cached patch to
 * be replayed immediately.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { Buffer } from "node:buffer";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import WebSocket from "ws";

import { runWatchCommand } from "../src/commands/watch.js";

type ManagedWebSocket = {
    close(): void;
    once(event: "close", listener: () => void): void;
    on(event: "open", listener: () => void): void;
    on(event: "error", listener: (error: unknown) => void): void;
    on(event: "message", listener: (data: unknown) => void): void;
};

function describeUnknown(value: unknown): string {
    if (value instanceof Error) {
        return value.message;
    }

    if (value === null) {
        return "null";
    }

    if (value === undefined) {
        return "undefined";
    }

    if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint"
    ) {
        return `${value}`;
    }

    if (typeof value === "object") {
        try {
            return JSON.stringify(value);
        } catch {
            return "[unserializable object]";
        }
    }

    return "unknown";
}

void describe("Hot reload replay for late subscribers", () => {
    let testDir: string;
    let testFile: string;
    let websocketClient: ManagedWebSocket | null = null;

    before(async () => {
        testDir = path.join(
            process.cwd(),
            "tmp",
            `hot-reload-replay-${Date.now()}`
        );
        await mkdir(testDir, { recursive: true });
        testFile = path.join(testDir, "late_join_patch.gml");
    });

    after(async () => {
        if (websocketClient) {
            await new Promise<void>((resolve) => {
                try {
                    websocketClient?.once("close", () => resolve());
                    websocketClient?.close();
                } catch {
                    resolve();
                }
            });
        }
        await rm(testDir, { recursive: true, force: true });
    });

    void it("replays the latest patch to new WebSocket clients", async () => {
        const abortController = new AbortController();

        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            verbose: false,
            websocketPort: 17_892,
            websocketHost: "127.0.0.1",
            runtimeServer: false,
            abortSignal: abortController.signal
        });

        await new Promise((resolve) => setTimeout(resolve, 600));

        await writeFile(
            testFile,
            "// first version\nvar late_join_value = 1;",
            "utf8"
        );

        await new Promise((resolve) => setTimeout(resolve, 800));

        const receivedPatches: Array<unknown> = [];

        const replayPromise = new Promise<void>((resolve, reject) => {
            websocketClient = new WebSocket("ws://127.0.0.1:17892");
            const timer = setTimeout(() => {
                reject(new Error("Timed out waiting for replayed patch"));
            }, 4000);

            websocketClient.on("message", (data) => {
                clearTimeout(timer);
                try {
                    const serializedMessage =
                        typeof data === "string"
                            ? data
                            : Buffer.isBuffer(data)
                              ? data.toString("utf8")
                              : JSON.stringify(data);

                    if (!serializedMessage) {
                        throw new Error("Received empty message payload");
                    }

                    receivedPatches.push(JSON.parse(serializedMessage));
                    resolve();
                } catch (error) {
                    const description = describeUnknown(error);
                    reject(
                        error instanceof Error
                            ? error
                            : new Error(
                                  `Unexpected message parsing failure: ${description}`
                              )
                    );
                }
            });

            websocketClient.on("open", () => {
                // No-op; waiting for replayed patch
            });

            websocketClient.on("error", (error) => {
                clearTimeout(timer);
                const description = describeUnknown(error);
                reject(
                    error instanceof Error
                        ? error
                        : new Error(`WebSocket error: ${description}`)
                );
            });
        });

        await replayPromise;

        abortController.abort();

        try {
            await watchPromise;
        } catch {
            // Expected when aborting
        }

        const latestPatch = receivedPatches.at(-1);

        assert.ok(
            latestPatch && typeof latestPatch === "object",
            "Should receive a replayed patch object"
        );
        assert.ok(
            (latestPatch as { id?: string }).id?.includes("late_join_patch"),
            "Patch ID should include the script name"
        );
        assert.equal(
            (latestPatch as { kind?: string }).kind,
            "script",
            "Patch kind should be script"
        );
    });
});
