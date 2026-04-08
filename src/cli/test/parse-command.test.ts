import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { runCliTestCommand } from "../src/cli.js";
import { createParseCommand } from "../src/commands/parse.js";

async function withTemporaryDirectory<T>(callback: (directory: string) => Promise<T>): Promise<T> {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "gmloop-cli-parse-"));

    try {
        return await callback(temporaryDirectory);
    } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
    }
}

void test("createParseCommand exposes shared parse options without positional targets", () => {
    const command = createParseCommand();

    assert.equal(command.name(), "parse");
    assert.equal(command.registeredArguments.length, 0);
    assert.ok(command.options.some((option) => option.long === "--path"));
    assert.ok(command.options.some((option) => option.long === "--fix"));
    assert.ok(command.options.some((option) => option.long === "--list"));
    assert.ok(command.options.some((option) => option.long === "--verbose"));
});

void test("parse --help output documents command examples and shared options", async () => {
    const { stdout, stderr, exitCode } = await runCliTestCommand({ argv: ["parse", "--help"] });

    assert.equal(exitCode, 0);
    assert.equal(stderr, "");
    assert.match(stdout, /Examples:/);
    assert.match(stdout, /prettier-plugin-gml parse --path path\/to\/script\.gml/);
    assert.match(stdout, /prettier-plugin-gml parse --fix --path path\/to\/project/);
    assert.match(stdout, /--path <path>/);
    assert.match(stdout, /--fix/);
    assert.match(stdout, /--list/);
    assert.match(stdout, /--verbose/);
});

void test("parse --list prints command settings and exits without parsing", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
        const result = await runCliTestCommand({
            argv: ["parse", "--path", temporaryDirectory, "--list", "--verbose"]
        });

        assert.equal(result.exitCode, 0);
        assert.equal(result.stderr, "");
        assert.match(result.stdout, /Target path:/);
        assert.match(result.stdout, /Execution mode: dry-run \(stdout AST JSON\)/);
        assert.match(result.stdout, /Verbose mode: enabled/);
        assert.match(result.stdout, /Output: stdout/);
    });
});

void test("parse prints a single-file AST to stdout in dry-run mode", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
        const sourcePath = path.join(temporaryDirectory, "script.gml");
        const outputPath = `${sourcePath}.ast.json`;
        await writeFile(sourcePath, "var value = 1;\n", "utf8");

        const result = await runCliTestCommand({
            argv: ["parse", "--path", sourcePath]
        });

        assert.equal(result.exitCode, 0);
        assert.equal(result.stderr, "");
        const parsedOutput = JSON.parse(result.stdout) as { type?: string; body?: Array<{ type?: string }> };
        assert.equal(parsedOutput.type, "Program");
        assert.equal(Array.isArray(parsedOutput.body), true);
        await assert.rejects(access(outputPath));
    });
});

void test("parse prints directory AST payloads to stdout in dry-run mode", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
        await writeFile(path.join(temporaryDirectory, "b.gml"), "var b = 2;\n", "utf8");
        await mkdir(path.join(temporaryDirectory, "nested"));
        await writeFile(path.join(temporaryDirectory, "nested", "a.gml"), "var a = 1;\n", "utf8");
        await writeFile(path.join(temporaryDirectory, "notes.txt"), "not parsed\n", "utf8");

        const result = await runCliTestCommand({
            argv: ["parse", "--path", "."],
            cwd: temporaryDirectory
        });

        assert.equal(result.exitCode, 0);
        assert.equal(result.stderr, "");
        const parsedOutput = JSON.parse(result.stdout) as {
            files?: Array<{ path?: string; ast?: { type?: string } }>;
        };

        assert.deepEqual(
            parsedOutput.files?.map((file) => file.path),
            ["b.gml", path.join("nested", "a.gml")]
        );
        assert.deepEqual(
            parsedOutput.files?.map((file) => file.ast?.type),
            ["Program", "Program"]
        );
    });
});

void test("parse --fix writes AST JSON artifacts for directory targets", async () => {
    await withTemporaryDirectory(async (temporaryDirectory) => {
        await writeFile(path.join(temporaryDirectory, "first.gml"), "var first = 1;\n", "utf8");
        await mkdir(path.join(temporaryDirectory, "nested"));
        await writeFile(path.join(temporaryDirectory, "nested", "second.gml"), "var second = 2;\n", "utf8");

        const result = await runCliTestCommand({
            argv: ["parse", "--path", ".", "--fix"],
            cwd: temporaryDirectory
        });

        assert.equal(result.exitCode, 0);
        assert.equal(result.stderr, "");
        assert.match(result.stdout, /Wrote first\.gml\.ast\.json/);
        assert.match(result.stdout, /Wrote nested\/second\.gml\.ast\.json/);
        assert.match(result.stdout, /Parsed and wrote 2 AST JSON files\./);

        const firstAst = JSON.parse(await readFile(path.join(temporaryDirectory, "first.gml.ast.json"), "utf8")) as {
            type?: string;
        };
        const secondAst = JSON.parse(
            await readFile(path.join(temporaryDirectory, "nested", "second.gml.ast.json"), "utf8")
        ) as { type?: string };

        assert.equal(firstAst.type, "Program");
        assert.equal(secondAst.type, "Program");
    });
});
