import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildProjectIndex } from "../src/project-index/index.js";

export async function createTempProjectWorkspace(prefix: string) {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));

    const writeFile = async (relativePath: string, contents: string) => {
        const absolutePath = path.join(projectRoot, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, contents, "utf8");
        return absolutePath;
    };

    return { projectRoot, writeFile };
}

export async function createAssetRenameProject() {
    const { projectRoot, writeFile } =
        await createTempProjectWorkspace("gml-asset-rename-");

    await writeFile(
        "MyGame.yyp",
        `${JSON.stringify(
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
        )}\n`
    );

    await writeFile(
        "scripts/demo_script/demo_script.yy",
        `${JSON.stringify(
            {
                resourceType: "GMScript",
                name: "demo_script",
                resourcePath: "scripts/demo_script/demo_script.yy"
            },
            null,
            4
        )}\n`
    );

    const source = "function demo_script() {\n    return 42;\n}\n";
    const scriptPath = await writeFile(
        "scripts/demo_script/demo_script.gml",
        source
    );

    await writeFile(
        "objects/obj_controller/obj_controller.yy",
        `${JSON.stringify(
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
        )}\n`
    );

    const projectIndex = await buildProjectIndex(projectRoot);

    return {
        projectRoot,
        projectIndex,
        scriptSource: source,
        scriptPath
    };
}

export async function createAssetCollisionProject() {
    const { projectRoot, writeFile } = await createTempProjectWorkspace(
        "gml-asset-collision-"
    );

    await writeFile(
        "MyGame.yyp",
        `${JSON.stringify(
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
        )}\n`
    );

    await writeFile(
        "scripts/demo_script/demo_script.yy",
        `${JSON.stringify(
            {
                resourceType: "GMScript",
                name: "demo_script",
                resourcePath: "scripts/demo_script/demo_script.yy"
            },
            null,
            4
        )}\n`
    );

    await writeFile(
        "scripts/demo_script/DemoScriptExisting.yy",
        `${JSON.stringify(
            {
                resourceType: "GMScript",
                name: "DemoScript",
                resourcePath: "scripts/demo_script/DemoScriptExisting.yy"
            },
            null,
            4
        )}\n`
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

    const projectIndex = await buildProjectIndex(projectRoot);

    return {
        projectRoot,
        projectIndex,
        scriptSource: primarySource,
        scriptPath: primaryPath
    };
}
