/**
 * Tests for the watch command's --auto-inject flag.
 *
 * Verifies that the watch command can automatically prepare the hot-reload
 * environment by injecting the runtime wrapper into the HTML5 output before
 * starting the file watcher.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";
import { runWatchCommand } from "../src/commands/watch.js";

describe("Watch command auto-inject flag", () => {
    it("should inject hot-reload runtime when --auto-inject is enabled", async () => {
        const testDir = path.join("/tmp", `watch-auto-inject-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const html5OutputDir = path.join(testDir, "html5-output");
        const indexHtmlPath = path.join(html5OutputDir, "index.html");

        await mkdir(html5OutputDir, { recursive: true });
        await writeFile(
            indexHtmlPath,
            "<html><head><title>Test</title></head><body><p>Test game</p></body></html>",
            "utf8"
        );

        const abortController = new AbortController();

        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            verbose: false,
            quiet: true,
            websocketServer: false,
            statusServer: false,
            runtimeServer: false,
            autoInject: true,
            html5Output: html5OutputDir,
            abortSignal: abortController.signal,
            watchFactory: () => {
                return {
                    close: () => {},
                    on: () => {}
                } as any;
            }
        });

        await setTimeoutPromise(500);
        abortController.abort();
        await watchPromise;

        const indexContent = await readFile(indexHtmlPath, "utf8");
        assert.ok(indexContent.includes("gml-hot-reload:start"), "Should contain hot-reload marker start");
        assert.ok(indexContent.includes("gml-hot-reload:end"), "Should contain hot-reload marker end");
        assert.ok(indexContent.includes("createRuntimeWrapper"), "Should contain runtime wrapper initialization");
        assert.ok(indexContent.includes("ws://127.0.0.1:17890"), "Should contain default WebSocket URL");

        await rm(testDir, { recursive: true, force: true });
    });

    it("should use custom WebSocket URL when both --auto-inject and custom port are provided", async () => {
        const testDir = path.join(
            "/tmp",
            `watch-auto-inject-custom-${Date.now()}-${Math.random().toString(36).slice(2)}`
        );
        const html5OutputDir = path.join(testDir, "html5-output");
        const indexHtmlPath = path.join(html5OutputDir, "index.html");

        await mkdir(html5OutputDir, { recursive: true });
        await writeFile(
            indexHtmlPath,
            "<html><head><title>Test</title></head><body><p>Test game</p></body></html>",
            "utf8"
        );

        const abortController = new AbortController();
        const customPort = 18_000;
        const customHost = "localhost";

        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            verbose: false,
            quiet: true,
            websocketServer: false,
            statusServer: false,
            runtimeServer: false,
            autoInject: true,
            html5Output: html5OutputDir,
            websocketPort: customPort,
            websocketHost: customHost,
            abortSignal: abortController.signal,
            watchFactory: () => {
                return {
                    close: () => {},
                    on: () => {}
                } as any;
            }
        });

        await setTimeoutPromise(500);
        abortController.abort();
        await watchPromise;

        const indexContent = await readFile(indexHtmlPath, "utf8");
        assert.ok(
            indexContent.includes(`ws://${customHost}:${customPort}`),
            `Should contain custom WebSocket URL ws://${customHost}:${customPort}`
        );

        await rm(testDir, { recursive: true, force: true });
    });

    it("should not inject when --auto-inject is not provided", async () => {
        const testDir = path.join("/tmp", `watch-no-inject-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const html5OutputDir = path.join(testDir, "html5-output");
        const indexHtmlPath = path.join(html5OutputDir, "index.html");
        const originalContent = "<html><head><title>Test</title></head><body><p>Test game</p></body></html>";

        await mkdir(html5OutputDir, { recursive: true });
        await writeFile(indexHtmlPath, originalContent, "utf8");

        const abortController = new AbortController();

        const watchPromise = runWatchCommand(testDir, {
            extensions: [".gml"],
            verbose: false,
            quiet: true,
            websocketServer: false,
            statusServer: false,
            runtimeServer: false,
            autoInject: false,
            abortSignal: abortController.signal,
            watchFactory: () => {
                return {
                    close: () => {},
                    on: () => {}
                } as any;
            }
        });

        await setTimeoutPromise(500);
        abortController.abort();
        await watchPromise;

        const indexContent = await readFile(indexHtmlPath, "utf8");
        assert.strictEqual(indexContent, originalContent, "Should not modify index.html when auto-inject is disabled");

        await rm(testDir, { recursive: true, force: true });
    });
});
