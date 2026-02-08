import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { Plugin, restoreDefaultRefactorRuntime, restoreDefaultSemanticSafetyRuntime } from "@gml-modules/plugin";

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

type SemanticSafetyReport = Readonly<{
    code: string;
    message: string;
}>;

async function createTemporaryProject(scripts: ReadonlyArray<ProjectScript>): Promise<TemporaryProject> {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "gml-plugin-runtime-"));
    const manifestPath = path.join(projectRoot, "MyGame.yyp");
    const scriptPath = path.join(projectRoot, "scripts", "main", "main.gml");

    await writeFile(manifestPath, JSON.stringify({ name: "MyGame", resourceType: "GMProject" }), "utf8");

    for (const script of scripts) {
        const absolutePath = path.join(projectRoot, script.relativePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, script.source, "utf8");
    }

    return {
        projectRoot,
        scriptPath,
        cleanup: async () => {
            restoreDefaultSemanticSafetyRuntime();
            restoreDefaultRefactorRuntime();
            await rm(projectRoot, { recursive: true, force: true });
        }
    };
}

void describe("plugin runtime globalvar integration", () => {
    void it("rewrites globalvar declarations when edits remain file-local", async () => {
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

            assert.strictEqual(formatted, "global.score = undefined;\nglobal.score = 1;\n");
        } finally {
            await project.cleanup();
        }
    });

    void it("preserves globalvar declaration and reports project-wide skip when symbol is cross-file", async () => {
        const reports: Array<SemanticSafetyReport> = [];
        const project = await createTemporaryProject([
            {
                relativePath: "scripts/main/main.gml",
                source: "globalvar score;\nscore = 1;\n"
            },
            {
                relativePath: "scripts/other/other.gml",
                source: "show_debug_message(score);\n"
            }
        ]);

        try {
            await configurePluginRuntimeAdapters(project.projectRoot);

            const formatted = await Plugin.format("globalvar score;\nscore = 1;\n", {
                filepath: project.scriptPath,
                preserveGlobalVarStatements: false,
                __semanticSafetyReportService(report: SemanticSafetyReport) {
                    reports.push(report);
                }
            });

            assert.ok(formatted.includes("globalvar score;"));
            assert.ok(formatted.includes("global.score = 1;"));
            assert.ok(!formatted.includes("global.score = undefined;"));
            assert.ok(
                reports.some((report) => report.code === "GML_SEMANTIC_SAFETY_GLOBALVAR_PROJECT_SKIP"),
                "Expected project-wide semantic-safety skip report for cross-file globalvar symbol."
            );
        } finally {
            await project.cleanup();
        }
    });
});
