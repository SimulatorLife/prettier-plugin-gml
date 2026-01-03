import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createPrepareHotReloadCommand } from "../src/commands/prepare-hot-reload.js";
import {
    prepareHotReloadInjection,
    DEFAULT_GM_TEMP_ROOT,
    DEFAULT_WEBSOCKET_URL,
    __test__
} from "../src/modules/hot-reload/inject-runtime.js";

const { HOT_RELOAD_MARKER_START, extractGmWebServerRoot } = __test__;

async function createTempDir(prefix: string): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

void describe("prepareHotReloadInjection", () => {
    void it("injects the hot-reload snippet and copies runtime assets", async () => {
        const root = await createTempDir("gml-hot-reload-");
        const outputRoot = path.join(root, "output");
        await fs.mkdir(outputRoot, { recursive: true });
        const indexPath = path.join(outputRoot, "index.html");
        await fs.writeFile(indexPath, "<html><body><h1>Demo</h1></body></html>", "utf8");

        const result = await prepareHotReloadInjection({
            html5OutputRoot: outputRoot,
            websocketUrl: "ws://127.0.0.1:9999"
        });

        const updated = await fs.readFile(indexPath, "utf8");
        assert.match(updated, new RegExp(HOT_RELOAD_MARKER_START));
        assert.match(updated, /ws:\/\/127\.0\.0\.1:9999/);

        const runtimeEntry = path.join(result.runtimeWrapperTargetRoot, "index.js");
        const runtimeStats = await fs.stat(runtimeEntry);
        assert.ok(runtimeStats.isFile());
    });

    void it("auto-detects the newest HTML5 output directory", async () => {
        const root = await createTempDir("gml-hot-reload-root-");
        const older = path.join(root, "older");
        const newer = path.join(root, "newer");
        await fs.mkdir(older, { recursive: true });
        await fs.mkdir(newer, { recursive: true });
        await fs.writeFile(path.join(older, "index.html"), "<html></html>", "utf8");
        await fs.writeFile(path.join(newer, "index.html"), "<html></html>", "utf8");

        const past = new Date(Date.now() - 10_000);
        const now = new Date();
        await fs.utimes(path.join(older, "index.html"), past, past);
        await fs.utimes(path.join(newer, "index.html"), now, now);

        const result = await prepareHotReloadInjection({
            gmTempRoot: root
        });

        assert.equal(result.outputRoot, newer);
    });
});

void describe("GMWebServ root parsing", () => {
    void it("extracts the -root path from a GMWebServ command line", () => {
        const sample = "/path/GMWebServ -v -root /private/tmp/GameMakerStudio2/GMS2TEMP/Project_Javascript";
        const root = extractGmWebServerRoot(sample);
        assert.equal(root, "/private/tmp/GameMakerStudio2/GMS2TEMP/Project_Javascript");
    });

    void it("returns null when no GMWebServ root is present", () => {
        assert.equal(extractGmWebServerRoot("/bin/other"), null);
    });
});

void describe("prepare-hot-reload command", () => {
    void it("exposes defaults for temp root and websocket URL", () => {
        const command = createPrepareHotReloadCommand();
        const options = command.options;
        const tempRootOption = options.find((opt) => opt.long === "--gm-temp-root");
        const websocketOption = options.find((opt) => opt.long === "--websocket-url");

        assert.ok(tempRootOption);
        assert.equal(tempRootOption.defaultValue, DEFAULT_GM_TEMP_ROOT);
        assert.ok(websocketOption);
        assert.equal(websocketOption.defaultValue, DEFAULT_WEBSOCKET_URL);
    });
});
