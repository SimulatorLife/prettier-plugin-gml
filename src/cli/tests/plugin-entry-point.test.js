import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
    importPluginModule,
    resolvePluginEntryPoint
} from "../plugin/entry-point.js";

const temporaryDirectories = new Set();

function createTemporaryPluginFile({ baseDirectory = os.tmpdir() } = {}) {
    const directory = fs.mkdtempSync(
        path.join(baseDirectory, "prettier-plugin-gml-entry-")
    );
    temporaryDirectories.add(directory);

    const pluginPath = path.join(directory, "custom-plugin.mjs");
    fs.writeFileSync(pluginPath, "export {}\n");

    return pluginPath;
}

afterEach(() => {
    for (const directory of temporaryDirectories) {
        try {
            fs.rmSync(directory, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors so tests do not mask the underlying failure.
        }
    }

    temporaryDirectories.clear();
});

describe("resolvePluginEntryPoint", () => {
    it("prefers an environment override when the path exists", () => {
        const pluginPath = createTemporaryPluginFile();

        const resolved = resolvePluginEntryPoint({
            env: { PRETTIER_PLUGIN_GML_PLUGIN_PATH: pluginPath }
        });

        assert.equal(resolved, pluginPath);
    });

    it("checks each environment entry before falling back to defaults", () => {
        const pluginPath = createTemporaryPluginFile();
        const nonexistent = path.join(path.dirname(pluginPath), "missing.mjs");
        const envValue = `${nonexistent}${path.delimiter}${pluginPath}`;

        const resolved = resolvePluginEntryPoint({
            env: { PRETTIER_PLUGIN_GML_PLUGIN_PATHS: envValue }
        });

        assert.equal(resolved, pluginPath);
    });

    it("expands leading tildes in environment overrides", () => {
        const homeDirectory = os.homedir();
        if (!homeDirectory) {
            return;
        }

        const pluginPath = createTemporaryPluginFile({
            baseDirectory: homeDirectory
        });
        const tildePath = `~${pluginPath.slice(homeDirectory.length)}`;

        const resolved = resolvePluginEntryPoint({
            env: { PRETTIER_PLUGIN_GML_PLUGIN_PATH: tildePath }
        });

        assert.equal(resolved, pluginPath);
    });

    it("falls back to built-in candidates when overrides are not provided", () => {
        const repoRoot = path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "..",
            "..",
            ".."
        );
        const expectedDefault = path.resolve(
            repoRoot,
            "src",
            "plugin",
            "src",
            "gml.js"
        );

        const resolved = resolvePluginEntryPoint({ env: {} });

        assert.equal(resolved, expectedDefault);
    });
});

describe("importPluginModule", () => {
    it("imports the module located at the resolved entry point", async () => {
        const pluginPath = createTemporaryPluginFile();
        const moduleContents = [
            "export const sentinel = 1729;",
            "export default { languages: [] };"
        ].join("\n");
        fs.writeFileSync(pluginPath, `${moduleContents}\n`);

        const module = await importPluginModule({
            env: { PRETTIER_PLUGIN_GML_PLUGIN_PATH: pluginPath }
        });

        assert.equal(module?.sentinel, 1729);
    });
});
