import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { importPluginModule, resolvePluginEntryPoint } from "../src/plugin-runtime/entry-point.js";

// Node deprecated the legacy assert.equal helper; rely on the strict
// assertions to keep this suite locked to the modern API.
// Manual validation: `npm test -- src/cli/test/plugin-entry-point.test.js` still
// passes after migrating the call sites, confirming behaviour parity.
const temporaryDirectories = new Set<string>();

function createTemporaryPluginFile({ baseDirectory = os.tmpdir() } = {}) {
    const directory = fs.mkdtempSync(path.join(baseDirectory, "prettier-plugin-gml-entry-"));
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
            // If a test creates temporary files and then fails an assertion, the
            // afterEach hook still attempts to clean up those files. A secondary
            // failure during cleanup (e.g., permission denied, directory locked)
            // should not obscure the original test failure in the test runner output.
        }
    }

    temporaryDirectories.clear();
});

void describe("resolvePluginEntryPoint", () => {
    void it("prefers an environment override when the path exists", () => {
        const pluginPath = createTemporaryPluginFile();

        const resolved = resolvePluginEntryPoint({
            env: { PRETTIER_PLUGIN_GML_PLUGIN_PATH: pluginPath }
        });

        assert.strictEqual(resolved, pluginPath);
    });

    void it("treats null options bags as absent overrides", () => {
        const expected = resolvePluginEntryPoint();
        const resolved = resolvePluginEntryPoint(null);

        assert.strictEqual(resolved, expected);
    });

    void it("checks each environment entry before falling back to defaults", () => {
        const pluginPath = createTemporaryPluginFile();
        const nonexistent = path.join(path.dirname(pluginPath), "missing.mjs");
        const envValue = `${nonexistent}${path.delimiter}${pluginPath}`;

        const resolved = resolvePluginEntryPoint({
            env: { PRETTIER_PLUGIN_GML_PLUGIN_PATHS: envValue }
        });

        assert.strictEqual(resolved, pluginPath);
    });

    void it("skips directory overrides when resolving the entry point", () => {
        const defaultEntryPoint = resolvePluginEntryPoint({ env: {} });
        const directoryOverride = fs.mkdtempSync(path.join(os.tmpdir(), "prettier-plugin-gml-entry-dir-"));
        temporaryDirectories.add(directoryOverride);

        const resolved = resolvePluginEntryPoint({
            env: { PRETTIER_PLUGIN_GML_PLUGIN_PATH: directoryOverride }
        });

        assert.strictEqual(resolved, defaultEntryPoint);
    });

    void it("expands leading tildes in environment overrides", () => {
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

        assert.strictEqual(resolved, pluginPath);
    });

    void it("falls back to built-in candidates when overrides are not provided", () => {
        const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
        const resolved = resolvePluginEntryPoint({ env: {} });

        assert.strictEqual(path.basename(resolved), "plugin-entry.js", "Should default to the plugin entry file.");
        assert.ok(
            resolved.startsWith(path.resolve(repoRoot, "src", "plugin")),
            "Expected the resolved path under the plugin workspace."
        );
    });
});

void describe("importPluginModule", () => {
    void it("imports the module located at the resolved entry point", async () => {
        const pluginPath = createTemporaryPluginFile();
        const moduleContents = ["export const sentinel = 1729;", "export default { languages: [] };"].join("\n");
        fs.writeFileSync(pluginPath, `${moduleContents}\n`);

        const module = await importPluginModule({
            env: { PRETTIER_PLUGIN_GML_PLUGIN_PATH: pluginPath }
        });

        assert.strictEqual(module?.sentinel, 1729);
    });
});
