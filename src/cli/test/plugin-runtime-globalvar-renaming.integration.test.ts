import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { Plugin } from "@gml-modules/plugin";

import { configurePluginRuntimeAdapters } from "../src/plugin-runtime/runtime-configuration.js";

type ProjectScript = Readonly<{
    relativePath: string;
    source: string;
}>;

type TemporaryProject = Readonly<{
    cleanup: () => Promise<void>;
    projectRoot: string;
    scriptPath: string;
}>;

async function createTemporaryProject(scripts: ReadonlyArray<ProjectScript>): Promise<TemporaryProject> {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "gml-plugin-runtime-"));
    const manifestPath = path.join(projectRoot, "MyGame.yyp");
    const scriptPath = path.join(projectRoot, "scripts", "main", "main.gml");

    await writeFile(manifestPath, JSON.stringify({ name: "MyGame", resourceType: "GMProject" }), "utf8");

    for (const script of scripts) {
        const absolutePath = path.join(projectRoot, script.relativePath);
        const scriptDirectory = path.dirname(absolutePath);
        const scriptName = path.basename(absolutePath, ".gml");
        const scriptDescriptorPath = path.join(scriptDirectory, `${scriptName}.yy`);

        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, script.source, "utf8");
        await writeFile(scriptDescriptorPath, JSON.stringify({ resourceType: "GMScript", name: scriptName }), "utf8");
    }

    return {
        projectRoot,
        scriptPath,
        cleanup: async () => {
            await rm(projectRoot, { recursive: true, force: true });
        }
    };
}

void describe("plugin runtime globalvar integration", () => {
    void it("does not apply project-aware globalvar rewrites during formatting", async () => {
        const project = await createTemporaryProject([
            {
                relativePath: "scripts/main/main.gml",
                source: "globalvar score;\nscore = 1;\n"
            }
        ]);

        try {
            await configurePluginRuntimeAdapters(project.projectRoot);

            const formatted = await Plugin.format("globalvar score;\nscore = 1;\n", {
                filepath: project.scriptPath,
                preserveGlobalVarStatements: false
            });

            assert.strictEqual(formatted, "globalvar score;\nscore = 1;\n");
        } finally {
            await project.cleanup();
        }
    });
});
