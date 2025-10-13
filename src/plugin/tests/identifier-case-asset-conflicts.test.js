import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import { buildProjectIndex } from "../src/project-index/index.js";
import { prepareIdentifierCasePlan } from "../src/identifier-case/local-plan.js";

async function createCollisionProject() {
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gml-asset-conflict-plan-")
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

    const scriptPath = await writeFile(
        "scripts/demo_script/demo_script.gml",
        "function demo_script() {\n    return 1;\n}\n"
    );
    await writeFile(
        "scripts/demo_script/DemoScriptExisting.gml",
        "function DemoScript() {\n    return 2;\n}\n"
    );

    const projectIndex = await buildProjectIndex(tempRoot);

    return { projectRoot: tempRoot, projectIndex, scriptPath };
}

describe("identifier case asset conflict planning", () => {
    it("records collisions when only asset renames are configured", async () => {
        const { projectRoot, projectIndex, scriptPath } =
            await createCollisionProject();

        try {
            const options = {
                filepath: scriptPath,
                gmlIdentifierCase: "off",
                gmlIdentifierCaseAssets: "pascal",
                gmlIdentifierCaseAcknowledgeAssetRenames: true,
                __identifierCaseProjectIndex: projectIndex,
                __identifierCaseDryRun: false,
                diagnostics: []
            };

            await prepareIdentifierCasePlan(options);

            const conflicts = options.__identifierCaseConflicts ?? [];
            assert.ok(
                conflicts.length > 0,
                "expected conflicts to be recorded"
            );
            assert.ok(
                conflicts.some((conflict) => conflict.code === "collision"),
                "expected a collision conflict"
            );
            assert.notStrictEqual(
                options.__identifierCaseAssetRenamesApplied,
                true,
                "asset renames should be skipped when conflicts exist"
            );
        } finally {
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });
});
