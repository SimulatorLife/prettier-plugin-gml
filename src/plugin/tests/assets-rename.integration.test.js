import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildProjectIndex } from "../src/project-index/index.js";
import {
    planAssetRenames,
    applyAssetRenames
} from "../src/identifier-case/asset-renames.js";

describe("asset rename utilities", () => {
    it("renames script assets and updates dependent resource metadata atomically", async () => {
        const projectRoot = await createSyntheticProject();

        try {
            const projectIndex = await buildProjectIndex(projectRoot);

            const { renames, conflicts } = planAssetRenames({
                projectIndex,
                assetStyle: "pascal"
            });

            assert.deepStrictEqual(conflicts, []);
            assert.strictEqual(renames.length, 1);

            const result = applyAssetRenames({ projectIndex, renames });

            assert.ok(
                result.renames.length > 0,
                "Expected rename actions to be recorded"
            );

            const renamedYyRelative = "scripts/demo_script/DemoScript.yy";
            const renamedGmlRelative = "scripts/demo_script/DemoScript.gml";
            const renamedYyPath = path.join(
                projectRoot,
                toSystemPath(renamedYyRelative)
            );
            const renamedGmlPath = path.join(
                projectRoot,
                toSystemPath(renamedGmlRelative)
            );

            await assertRejectsNotFound(
                path.join(projectRoot, "scripts/demo_script/demo_script.yy")
            );
            await assertRejectsNotFound(
                path.join(projectRoot, "scripts/demo_script/demo_script.gml")
            );

            const scriptData = JSON.parse(
                await fs.readFile(renamedYyPath, "utf8")
            );
            assert.strictEqual(scriptData.name, "DemoScript");
            assert.strictEqual(scriptData.resourcePath, renamedYyRelative);
            assert.deepStrictEqual(scriptData.linkedScript, {
                path: renamedYyRelative,
                name: "DemoScript"
            });

            const projectData = JSON.parse(
                await fs.readFile(path.join(projectRoot, "MyGame.yyp"), "utf8")
            );
            assert.strictEqual(
                projectData.resources[0].id.path,
                renamedYyRelative
            );
            assert.strictEqual(projectData.resources[0].id.name, "DemoScript");

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
                path: renamedYyRelative,
                name: "DemoScript"
            });
            assert.deepStrictEqual(
                objectData.eventList[0].actionList[0].script,
                {
                    path: renamedYyRelative,
                    name: "DemoScript"
                }
            );

            const roomData = JSON.parse(
                await fs.readFile(
                    path.join(
                        projectRoot,
                        toSystemPath("rooms/room_start/room_start.yy")
                    ),
                    "utf8"
                )
            );
            assert.deepStrictEqual(roomData.creationCodeScript, {
                path: renamedYyRelative,
                name: "DemoScript"
            });
            assert.deepStrictEqual(
                roomData.layers[0].instances[0].creationCodeScript,
                {
                    path: renamedYyRelative,
                    name: "DemoScript"
                }
            );

            const gmlContent = await fs.readFile(renamedGmlPath, "utf8");
            assert.ok(
                gmlContent.includes("function demo_script()"),
                "Renamed GML file should preserve original code"
            );
        } finally {
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });
});

async function createSyntheticProject() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gml-asset-utils-"));

    const writeJson = async (relativePath, data) => {
        const absolutePath = path.join(root, toSystemPath(relativePath));
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(
            absolutePath,
            `${JSON.stringify(data, null, 4)}\n`,
            "utf8"
        );
    };

    const writeText = async (relativePath, contents) => {
        const absolutePath = path.join(root, toSystemPath(relativePath));
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, contents, "utf8");
    };

    const scriptPath = "scripts/demo_script/demo_script.yy";
    const objectPath = "objects/obj_controller/obj_controller.yy";
    const roomPath = "rooms/room_start/room_start.yy";

    await writeJson("MyGame.yyp", {
        name: "MyGame",
        resourceType: "GMProject",
        resources: [
            {
                id: { name: "demo_script", path: scriptPath }
            },
            {
                id: { name: "obj_controller", path: objectPath }
            },
            {
                id: { name: "room_start", path: roomPath }
            }
        ]
    });

    await writeJson(scriptPath, {
        resourceType: "GMScript",
        name: "demo_script",
        resourcePath: scriptPath,
        linkedScript: { path: scriptPath, name: "demo_script" }
    });

    await writeText(
        "scripts/demo_script/demo_script.gml",
        "function demo_script() {\n    return 42;\n}\n"
    );

    await writeJson(objectPath, {
        resourceType: "GMObject",
        name: "obj_controller",
        scriptExecute: { path: scriptPath, name: "demo_script" },
        eventList: [
            {
                resourceType: "GMEvent",
                eventType: 0,
                eventNum: 0,
                actionList: [
                    {
                        resourceType: "GMObjectEventAction",
                        actionName: "ExecuteScript",
                        script: { path: scriptPath, name: "demo_script" }
                    }
                ]
            }
        ]
    });

    await writeJson(roomPath, {
        resourceType: "GMRoom",
        name: "room_start",
        creationCodeScript: { path: scriptPath, name: "demo_script" },
        layers: [
            {
                resourceType: "GMRInstanceLayer",
                name: "Instances",
                instances: [
                    {
                        resourceType: "GMRInstance",
                        name: "obj_controller_1",
                        objectId: { name: "obj_controller", path: objectPath },
                        creationCodeScript: {
                            path: scriptPath,
                            name: "demo_script"
                        }
                    }
                ]
            }
        ],
        instanceCreationOrder: [{ name: "obj_controller", path: objectPath }]
    });

    return root;
}

async function assertRejectsNotFound(targetPath) {
    try {
        await fs.access(targetPath);
        assert.fail(`Path '${targetPath}' unexpectedly exists.`);
    } catch (error) {
        if (!error || error.code !== "ENOENT") {
            throw error;
        }
    }
}

function toSystemPath(relativePath) {
    return relativePath.replace(/\//g, path.sep);
}
