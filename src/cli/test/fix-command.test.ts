import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliTestCommand } from "../src/cli.js";
import { createFixCommand } from "../src/commands/fix.js";

async function writeProjectFile(projectRoot: string, relativePath: string, contents: string): Promise<void> {
    const absolutePath = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
}

async function writeScriptResource(projectRoot: string, scriptName: string, sourceText: string): Promise<void> {
    await writeProjectFile(
        projectRoot,
        `scripts/${scriptName}/${scriptName}.yy`,
        `${JSON.stringify(
            {
                resourceType: "GMScript",
                name: scriptName
            },
            null,
            4
        )}\n`
    );
    await writeProjectFile(projectRoot, `scripts/${scriptName}/${scriptName}.gml`, sourceText);
}

async function createSyntheticProject(): Promise<string> {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "gmloop-fix-cli-"));
    await writeProjectFile(
        projectRoot,
        "MyGame.yyp",
        `${JSON.stringify({ name: "MyGame", resourceType: "GMProject" }, null, 4)}\n`
    );
    await writeProjectFile(
        projectRoot,
        "gmloop.json",
        `${JSON.stringify(
            {
                refactor: {
                    namingConventionPolicy: {
                        rules: {
                            scriptResourceName: {
                                caseStyle: "camel"
                            }
                        }
                    },
                    codemods: {
                        namingConvention: {}
                    }
                }
            },
            null,
            4
        )}\n`
    );
    return projectRoot;
}

void test("createFixCommand exposes the project fix workflow", () => {
    const command = createFixCommand();

    assert.equal(command.name(), "fix");
    assert.equal(command.description(), "Run project codemods, lint fixes, and formatting in sequence");
    assert.ok(command.options.some((option) => option.long === "--project-root"));
    assert.ok(command.options.some((option) => option.long === "--config"));
    assert.ok(command.options.some((option) => option.long === "--only"));
    assert.ok(command.options.some((option) => option.long === "--verbose"));
});

void test("fix --help documents the combined workflow", async () => {
    const result = await runCliTestCommand({
        argv: ["fix", "--help"]
    });

    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Run project codemods, lint fixes, and formatting in sequence/);
    assert.match(result.stdout, /pnpm dlx prettier-plugin-gml fix path\/to\/project/);
});

void test("fix runs codemods, lint fixes, and formatting in sequence for a project", async () => {
    const projectRoot = await createSyntheticProject();

    try {
        await writeScriptResource(
            projectRoot,
            "demo_script",
            "function demo_script( ) {\nif(true){\nvar total = 1e3;\nreturn total;\n}\n}\n"
        );
        await writeScriptResource(
            projectRoot,
            "consumer_script",
            "function consumer_script() {\n    return demo_script();\n}\n"
        );

        const result = await runCliTestCommand({
            argv: ["fix"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /\[1\/3 Refactor Codemods\]/);
        assert.match(result.stdout, /\[2\/3 Lint Fixes\]/);
        assert.match(result.stdout, /\[3\/3 Format\]/);
        assert.match(result.stdout, /Success! Project codemods, lint fixes, and formatting completed\./);

        await access(path.join(projectRoot, "scripts/demoScript/demoScript.gml"));
        await access(path.join(projectRoot, "scripts/demoScript/demoScript.yy"));
        await assert.rejects(access(path.join(projectRoot, "scripts/demo_script/demo_script.gml")));

        const renamedSource = await readFile(path.join(projectRoot, "scripts/demoScript/demoScript.gml"), "utf8");
        const consumerSource = await readFile(
            path.join(projectRoot, "scripts/consumerScript/consumerScript.gml"),
            "utf8"
        );
        const renamedMetadata = await readFile(path.join(projectRoot, "scripts/demoScript/demoScript.yy"), "utf8");

        assert.match(renamedSource, /function demoScript\(\)/);
        assert.match(renamedSource, /@returns/);
        assert.match(renamedSource, /if \(true\) \{/);
        assert.match(renamedSource, /return 1000;/);
        assert.doesNotMatch(renamedSource, /1e3/);
        assert.match(consumerSource, /function consumerScript\(\)/);
        assert.match(consumerSource, /return demoScript\(\);/);
        assert.match(renamedMetadata, /"name"\s*:\s*"demoScript"/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});
