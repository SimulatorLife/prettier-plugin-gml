import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import { buildProjectIndex } from "../src/project-index/index.js";
import {
    clearIdentifierCaseDryRunContexts,
    setIdentifierCaseDryRunContext
} from "../src/identifier-case/identifier-case-context.js";
import { prepareIdentifierCasePlan } from "../src/identifier-case/local-plan.js";

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

async function createAssetCollisionProject() {
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gml-asset-collision-")
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
                    },
                    {
                        id: {
                            name: "DemoScript",
                            path: "scripts/demo_script/DemoScriptExisting.yy"
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

    await writeFile(
        "scripts/demo_script/DemoScriptExisting.yy",
        JSON.stringify(
            {
                resourceType: "GMScript",
                name: "DemoScript",
                resourcePath: "scripts/demo_script/DemoScriptExisting.yy"
            },
            null,
            4
        ) + "\n"
    );

    const primarySource = "function demo_script() {\n    return 1;\n}\n";
    const secondarySource = "function DemoScript() {\n    return 2;\n}\n";

    const primaryPath = await writeFile(
        "scripts/demo_script/demo_script.gml",
        primarySource
    );
    await writeFile(
        "scripts/demo_script/DemoScriptExisting.gml",
        secondarySource
    );

    const projectIndex = await buildProjectIndex(tempRoot);

    return {
        projectRoot: tempRoot,
        projectIndex,
        scriptPath: primaryPath
    };
}

async function createAssetReservedProject() {
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gml-asset-reserved-")
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
                            name: "MoveContactSolid",
                            path: "scripts/move_contact/MoveContactSolid.yy"
                        }
                    }
                ]
            },
            null,
            4
        ) + "\n"
    );

    await writeFile(
        "scripts/move_contact/MoveContactSolid.yy",
        JSON.stringify(
            {
                resourceType: "GMScript",
                name: "MoveContactSolid",
                resourcePath: "scripts/move_contact/MoveContactSolid.yy"
            },
            null,
            4
        ) + "\n"
    );

    const source = "function MoveContactSolid() {\n    return 3;\n}\n";
    const scriptPath = await writeFile(
        "scripts/move_contact/MoveContactSolid.gml",
        source
    );

    const projectIndex = await buildProjectIndex(tempRoot);

    return {
        projectRoot: tempRoot,
        projectIndex,
        scriptPath
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
            const newYyPath = path.join(
                projectRoot,
                toSystemPath(newYyRelative)
            );
            const newGmlPath = path.join(
                projectRoot,
                toSystemPath(newGmlRelative)
            );

            await assertPathMissing(
                path.join(projectRoot, "scripts/demo_script/demo_script.yy")
            );
            await assertPathMissing(
                path.join(projectRoot, "scripts/demo_script/demo_script.gml")
            );

            const renamedYy = JSON.parse(await fs.readFile(newYyPath, "utf8"));
            assert.strictEqual(renamedYy.name, "DemoScript");
            assert.strictEqual(renamedYy.resourcePath, newYyRelative);

            const objectData = JSON.parse(
                await fs.readFile(
                    path.join(
                        projectRoot,
                        toSystemPath(
                            "objects/obj_controller/obj_controller.yy"
                        )
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

describe("asset rename conflict detection", () => {
    it("aborts renames when converted names collide with existing assets", async () => {
        const { projectRoot, projectIndex, scriptPath } =
            await createAssetCollisionProject();

        try {
            const options = {
                filepath: scriptPath,
                gmlIdentifierCase: "off",
                gmlIdentifierCaseAssets: "pascal",
                gmlIdentifierCaseAcknowledgeAssetRenames: true,
                __identifierCaseProjectIndex: projectIndex,
                __identifierCaseDryRun: false,
                identifierCaseFs: {
                    renameSync() {
                        assert.fail(
                            "renameSync should not be called when conflicts are present"
                        );
                    }
                },
                diagnostics: []
            };

            await prepareIdentifierCasePlan(options);

            const conflicts = options.__identifierCaseConflicts ?? [];
            assert.ok(
                conflicts.length > 0,
                "Expected collisions to be reported"
            );
            assert.ok(
                conflicts.some((conflict) => conflict.code === "collision"),
                "Expected collision conflict code"
            );
            assert.ok(
                conflicts.some((conflict) =>
                    conflict.message.includes("collides with existing asset")
                ),
                "Expected conflict message to reference existing assets"
            );
            assert.ok(
                conflicts.some((conflict) =>
                    conflict.suggestions.some((suggestion) =>
                        suggestion.includes("gmlIdentifierCaseIgnore")
                    )
                ),
                "Expected suggestion to reference ignore patterns"
            );
            assert.ok(
                conflicts.some((conflict) =>
                    conflict.suggestions.some((suggestion) =>
                        suggestion.includes("gmlIdentifierCaseAssets")
                    )
                ),
                "Expected suggestion to mention scope toggle"
            );
            assert.notStrictEqual(
                options.__identifierCaseAssetRenamesApplied,
                true,
                "Expected asset renames to be aborted"
            );
            assert.strictEqual(
                options.__identifierCaseAssetRenameResult,
                undefined,
                "Expected rename executor not to run"
            );
        } finally {
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });

    it("detects reserved-word conflicts before renaming assets", async () => {
        const { projectRoot, projectIndex, scriptPath } =
            await createAssetReservedProject();

        try {
            const options = {
                filepath: scriptPath,
                gmlIdentifierCase: "off",
                gmlIdentifierCaseAssets: "snake-lower",
                gmlIdentifierCaseAcknowledgeAssetRenames: true,
                __identifierCaseProjectIndex: projectIndex,
                __identifierCaseDryRun: false,
                diagnostics: []
            };

            await prepareIdentifierCasePlan(options);

            const conflicts = options.__identifierCaseConflicts ?? [];
            assert.ok(
                conflicts.length > 0,
                "Expected reserved conflict to be reported"
            );
            assert.ok(
                conflicts.some((conflict) => conflict.code === "reserved"),
                "Expected reserved conflict code"
            );
            assert.ok(
                conflicts.some((conflict) =>
                    conflict.message.includes(
                        "conflicts with reserved identifier"
                    )
                ),
                "Expected reserved-word guidance"
            );
            assert.ok(
                conflicts.some((conflict) =>
                    conflict.suggestions.some((suggestion) =>
                        suggestion.includes("gmlIdentifierCaseIgnore")
                    )
                ),
                "Expected ignore suggestion"
            );
            assert.ok(
                conflicts.some((conflict) =>
                    conflict.suggestions.some((suggestion) =>
                        suggestion.includes("gmlIdentifierCaseAssets")
                    )
                ),
                "Expected scope toggle suggestion"
            );
            assert.notStrictEqual(
                options.__identifierCaseAssetRenamesApplied,
                true,
                "Reserved conflicts should abort asset renames"
            );
            assert.strictEqual(
                options.__identifierCaseAssetRenameResult,
                undefined,
                "Expected rename executor not to run on reserved conflict"
            );
        } finally {
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
