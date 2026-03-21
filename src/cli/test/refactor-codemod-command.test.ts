import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCliTestCommand } from "../src/cli.js";

/**
 * Write a UTF-8 file inside a temporary synthetic GameMaker project.
 */
async function writeProjectFile(projectRoot: string, relativePath: string, contents: string): Promise<void> {
    const absolutePath = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
}

/**
 * Create a script resource with its metadata and source file.
 */
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

/**
 * Create a temporary GameMaker project root for CLI codemod tests.
 */
async function createSyntheticProject(config: Record<string, unknown>): Promise<string> {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "gmloop-refactor-cli-"));
    await writeProjectFile(
        projectRoot,
        "MyGame.yyp",
        `${JSON.stringify({ name: "MyGame", resourceType: "GMProject" }, null, 4)}\n`
    );
    await writeProjectFile(projectRoot, "gmloop.json", `${JSON.stringify(config, null, 4)}\n`);
    return projectRoot;
}

void test("refactor codemod --list discovers gmloop.json and tolerates unrelated top-level config", async () => {
    const projectRoot = await createSyntheticProject({
        printWidth: 95,
        lintRules: {
            "gml/no-globalvar": "error"
        },
        refactor: {
            codemods: {
                loopLengthHoisting: {}
            }
        }
    });

    try {
        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--list"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /Project root:/);
        assert.match(result.stdout, /Config path:/);
        assert.match(result.stdout, /loopLengthHoisting: configured, selected/);
        assert.match(result.stdout, /Effective config: \{\}/);
        assert.match(result.stdout, /namingConvention: not configured, selected/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --only filters configured codemods during listing", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            namingConventionPolicy: {
                rules: {
                    localVariable: {
                        caseStyle: "camel"
                    }
                }
            },
            codemods: {
                loopLengthHoisting: {},
                namingConvention: {}
            }
        }
    });

    try {
        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--list", "--only", "loopLengthHoisting"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        assert.match(result.stdout, /loopLengthHoisting: configured, selected/);
        assert.match(result.stdout, /namingConvention: configured, filtered out/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write applies configured namingConvention renames across project resources", async () => {
    const projectRoot = await createSyntheticProject({
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
    });

    try {
        await writeScriptResource(projectRoot, "demo_script", "function demo_script() {\n    return 1;\n}\n");
        await writeScriptResource(
            projectRoot,
            "consumer_script",
            "function consumer_script() {\n    return demo_script();\n}\n"
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "scripts/demo_script", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        await access(path.join(projectRoot, "scripts/demoScript/demoScript.gml"));
        const renamedSource = await readFile(path.join(projectRoot, "scripts/demoScript/demoScript.gml"), "utf8");
        const consumerSource = await readFile(
            path.join(projectRoot, "scripts/consumer_script/consumer_script.gml"),
            "utf8"
        );
        const renamedMetadata = await readFile(path.join(projectRoot, "scripts/demoScript/demoScript.yy"), "utf8");

        assert.match(renamedSource, /function demoScript\(\)/);
        assert.match(consumerSource, /demoScript\(\)/);
        assert.match(renamedMetadata, /"name"\s*:\s*"demoScript"/);
        await assert.rejects(access(path.join(projectRoot, "scripts/demo_script/demo_script.gml")));
        assert.match(result.stdout, /\[namingConvention\] changed/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod --write applies configured loop-length hoisting changes", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            codemods: {
                loopLengthHoisting: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "demo_script",
            "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n"
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        const updatedSource = await readFile(path.join(projectRoot, "scripts/demo_script/demo_script.gml"), "utf8");
        assert.match(updatedSource, /var len = array_length\(items\);/);
        assert.match(result.stdout, /\[loopLengthHoisting\] changed/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor infers codemod mode from project config when no rename target is specified", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            codemods: {
                loopLengthHoisting: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "demo_script",
            "for (var i = 0; i < array_length(items); i++) {\n    total += i;\n}\n"
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "--project-root", projectRoot, "--write"]
        });

        assert.equal(result.exitCode, 0);
        const updatedSource = await readFile(path.join(projectRoot, "scripts/demo_script/demo_script.gml"), "utf8");
        assert.match(updatedSource, /var len = array_length\(items\);/);
        assert.match(result.stdout, /\[loopLengthHoisting\] changed/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod target paths restrict which gml files are rewritten", async () => {
    const projectRoot = await createSyntheticProject({
        refactor: {
            codemods: {
                loopLengthHoisting: {}
            }
        }
    });

    try {
        await writeScriptResource(
            projectRoot,
            "selected_script",
            "for (var i = 0; i < array_length(selected_items); i++) {\n    total += i;\n}\n"
        );
        await writeScriptResource(
            projectRoot,
            "other_script",
            "for (var i = 0; i < array_length(other_items); i++) {\n    total += i;\n}\n"
        );

        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "scripts/selected_script", "--write"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 0);
        const selectedSource = await readFile(
            path.join(projectRoot, "scripts/selected_script/selected_script.gml"),
            "utf8"
        );
        const otherSource = await readFile(path.join(projectRoot, "scripts/other_script/other_script.gml"), "utf8");
        assert.match(selectedSource, /var len = array_length\(selected_items\);/);
        assert.doesNotMatch(otherSource, /var len = array_length\(other_items\);/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});

void test("refactor codemod errors when gmloop.json cannot be found", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "gmloop-refactor-cli-missing-config-"));
    await writeProjectFile(
        projectRoot,
        "MyGame.yyp",
        `${JSON.stringify({ name: "MyGame", resourceType: "GMProject" }, null, 4)}\n`
    );

    try {
        const result = await runCliTestCommand({
            argv: ["refactor", "codemod", "--list"],
            cwd: projectRoot
        });

        assert.equal(result.exitCode, 1);
        assert.match(result.stderr, /Could not find gmloop config file/);
    } finally {
        await rm(projectRoot, { recursive: true, force: true });
    }
});
