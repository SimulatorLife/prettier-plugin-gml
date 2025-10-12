import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import { buildProjectIndex } from "../../shared/project-index/index.js";
import {
    clearIdentifierCaseDryRunContexts,
    setIdentifierCaseDryRunContext
} from "../src/reporting/identifier-case-context.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");

async function createAssetRenameProject() {
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gml-asset-rename-")
    );

    const writeFile = async (relativePath, contents) => {
        const absolutePath = path.join(tempRoot, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, contents, "utf8");
        return absolutePath;
    };

    await writeFile(
        "MyGame.yyp",
        JSON.stringify(
            {
                name: "MyGame",
                resourceType: "GMProject",
                resources: [
                    {
                        id: {
                            name: "demo_script",
                            path: "scripts/demo_script/demo_script.yy"
                        }
                    }
                ]
            },
            null,
            4
        ) + "\n"
    );

    await writeFile(
        "scripts/demo_script/demo_script.yy",
        JSON.stringify(
            {
                resourceType: "GMScript",
                name: "demo_script",
                resourcePath: "scripts/demo_script/demo_script.yy"
            },
            null,
            4
        ) + "\n"
    );

    const source = "function demo_script() {\n    return 42;\n}\n";
    const gmlPath = await writeFile(
        "scripts/demo_script/demo_script.gml",
        source
    );

    await writeFile(
        "objects/obj_controller/obj_controller.yy",
        JSON.stringify(
            {
                resourceType: "GMObject",
                name: "obj_controller",
                scriptExecute: {
                    path: "scripts/demo_script/demo_script.yy",
                    name: "demo_script"
                }
            },
            null,
            4
        ) + "\n"
    );

    const projectIndex = await buildProjectIndex(tempRoot);

    return {
        projectRoot: tempRoot,
        projectIndex,
        scriptSource: source,
        scriptPath: gmlPath
    };
}

describe("asset rename execution", () => {
    it("renames script assets and updates referencing metadata", async () => {
        const { projectRoot, projectIndex, scriptSource, scriptPath } =
            await createAssetRenameProject();

        try {
            clearIdentifierCaseDryRunContexts();
            setIdentifierCaseDryRunContext({
                filepath: scriptPath,
                projectIndex,
                dryRun: false
            });

            const diagnostics = [];
            const formatOptions = {
                plugins: [pluginPath],
                parser: "gml-parse",
                filepath: scriptPath,
                gmlIdentifierCase: "off",
                gmlIdentifierCaseAssets: "pascal",
                gmlIdentifierCaseAcknowledgeAssetRenames: true,
                __identifierCaseProjectIndex: projectIndex,
                __identifierCaseDryRun: false,
                diagnostics
            };

            await prettier.format(scriptSource, formatOptions);

            assert.strictEqual(diagnostics.length, 0);

            const newYyRelative = "scripts/demo_script/DemoScript.yy";
            const newGmlRelative = "scripts/demo_script/DemoScript.gml";
            const newYyPath = path.join(projectRoot, toSystemPath(newYyRelative));
            const newGmlPath = path.join(projectRoot, toSystemPath(newGmlRelative));

            await assertPathMissing(
                path.join(projectRoot, "scripts/demo_script/demo_script.yy")
            );
            await assertPathMissing(
                path.join(projectRoot, "scripts/demo_script/demo_script.gml")
            );

            const renamedYy = JSON.parse(
                await fs.readFile(newYyPath, "utf8")
            );
            assert.strictEqual(renamedYy.name, "DemoScript");
            assert.strictEqual(renamedYy.resourcePath, newYyRelative);

            const objectData = JSON.parse(
                await fs.readFile(
                    path.join(
                        projectRoot,
                        toSystemPath("objects/obj_controller/obj_controller.yy")
                    ),
                    "utf8"
                )
            );
            assert.deepStrictEqual(objectData.scriptExecute, {
                path: newYyRelative,
                name: "DemoScript"
            });

            const projectData = JSON.parse(
                await fs.readFile(path.join(projectRoot, "MyGame.yyp"), "utf8")
            );
            assert.strictEqual(projectData.resources[0].id.path, newYyRelative);
            assert.strictEqual(projectData.resources[0].id.name, "DemoScript");

            const renamedGmlExists = await fileExists(newGmlPath);
            assert.ok(renamedGmlExists, "Expected renamed GML file to exist");
        } finally {
            clearIdentifierCaseDryRunContexts();
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });
});

async function assertPathMissing(targetPath) {
    try {
        await fs.access(targetPath);
        assert.fail(`Path ${targetPath} unexpectedly exists.`);
    } catch (error) {
        if (!error || error.code !== "ENOENT") {
            throw error;
        }
    }
}

async function fileExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

function toSystemPath(relativePath) {
    return relativePath.replace(/\//g, path.sep);
}
