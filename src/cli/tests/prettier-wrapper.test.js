import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { describe, it } from "node:test";

const execFileAsync = promisify(execFile);
const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const wrapperPath = path.resolve(currentDirectory, "../cli.js");

// These integration tests intentionally rely on the strict assertion helpers
// (e.g. assert.strictEqual/assert.deepStrictEqual) to avoid the deprecated
// loose equality variants while still validating the CLI behaviour end-to-end.

async function createTemporaryDirectory() {
    const directoryPrefix = path.join(os.tmpdir(), "gml-prettier-wrapper-");
    return fs.mkdtemp(directoryPrefix);
}

describe("Prettier wrapper CLI", () => {
    it("formats files with uppercase .GML extensions", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "SCRIPT.GML");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            await execFileAsync("node", [wrapperPath, tempDirectory]);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("formats a single file when the target path points to a file", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            await execFileAsync("node", [wrapperPath, targetFile]);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("derives default extensions from the environment when configured", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.txt");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const env = {
                ...process.env,
                PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS: ".txt"
            };

            await execFileAsync("node", [wrapperPath, tempDirectory], { env });

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("normalizes glob patterns in default extension environment overrides", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const gmlFile = path.join(tempDirectory, "example.GML");
            const txtFile = path.join(tempDirectory, "extra.txt");
            await fs.writeFile(gmlFile, "var    a=1;\n", "utf8");
            await fs.writeFile(txtFile, "var    b=2;\n", "utf8");

            const env = {
                ...process.env,
                PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS: "**/*.GML,*.txt"
            };

            await execFileAsync("node", [wrapperPath, tempDirectory], { env });

            const formattedGml = await fs.readFile(gmlFile, "utf8");
            const formattedTxt = await fs.readFile(txtFile, "utf8");
            assert.strictEqual(formattedGml, "var a = 1;\n");
            assert.strictEqual(formattedTxt, "var b = 2;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("accepts custom Prettier log levels via CLI option", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            await execFileAsync("node", [
                wrapperPath,
                "--log-level=debug",
                tempDirectory
            ]);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("honours PRETTIER_PLUGIN_GML_LOG_LEVEL environment overrides", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const env = {
                ...process.env,
                PRETTIER_PLUGIN_GML_LOG_LEVEL: "silent"
            };

            await execFileAsync("node", [wrapperPath, tempDirectory], { env });

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("reports invalid log level values with guidance", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            try {
                await execFileAsync("node", [
                    wrapperPath,
                    "--log-level=verbose",
                    tempDirectory
                ]);
                assert.fail(
                    "Expected the wrapper to exit with a non-zero status code"
                );
            } catch (error) {
                assert.ok(error, "Expected an error to be thrown");
                assert.strictEqual(error.code, 1);
                assert.match(
                    error.stderr,
                    /option '--log-level <level>' argument 'verbose' is invalid/i
                );
                assert.ok(
                    error.stderr.includes("Must be one of:"),
                    "Expected the error to include valid log level guidance"
                );
            }
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("formats files when a custom extension is provided", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.txt");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            await execFileAsync("node", [
                wrapperPath,
                "--extensions=.txt",
                tempDirectory
            ]);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("applies Prettier configuration from the target project", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(
                targetFile,
                ["if (true) {", "    a = 1;", "}", ""].join("\n"),
                "utf8"
            );

            const configPath = path.join(tempDirectory, ".prettierrc");
            await fs.writeFile(
                configPath,
                JSON.stringify({ tabWidth: 2 }, null, 2),
                "utf8"
            );

            await execFileAsync("node", [wrapperPath, tempDirectory]);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(
                formatted,
                ["if (true) {", "  a = 1;", "}", ""].join("\n")
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("loads plugins declared as strings in project configuration", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const pluginPath = path.join(
                tempDirectory,
                "side-effect-plugin.cjs"
            );
            await fs.writeFile(
                pluginPath,
                [
                    'const fs = require("fs");',
                    'const path = require("path");',
                    'const outputPath = path.join(__dirname, "plugin-loaded.txt");',
                    'fs.writeFileSync(outputPath, "loaded", "utf8");',
                    "module.exports = {};",
                    ""
                ].join("\n"),
                "utf8"
            );

            const configPath = path.join(tempDirectory, ".prettierrc");
            await fs.writeFile(
                configPath,
                JSON.stringify({ plugins: pluginPath }),
                "utf8"
            );

            await execFileAsync("node", [wrapperPath, tempDirectory]);

            const pluginOutputPath = path.join(
                tempDirectory,
                "plugin-loaded.txt"
            );
            const pluginOutput = await fs.readFile(pluginOutputPath, "utf8");
            assert.strictEqual(pluginOutput, "loaded");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("overrides conflicting parser configuration from .prettierrc", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "enum.gml");
            await fs.writeFile(targetFile, "enum   MyEnum{value}\n", "utf8");

            const configPath = path.join(tempDirectory, ".prettierrc");
            await fs.writeFile(
                configPath,
                JSON.stringify({ parser: "babel" }),
                "utf8"
            );

            await execFileAsync("node", [wrapperPath, tempDirectory]);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(
                formatted,
                ["enum MyEnum {", "    value", "}", ""].join("\n")
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("respects ignore rules from .prettierignore", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const ignorePath = path.join(tempDirectory, ".prettierignore");
            await fs.writeFile(ignorePath, "script.gml\n", "utf8");

            await execFileAsync("node", [wrapperPath, tempDirectory]);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var    a=1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("respects .prettierignore entries when invoked with a file path", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const ignorePath = path.join(tempDirectory, ".prettierignore");
            await fs.writeFile(ignorePath, "script.gml\n", "utf8");

            const { stdout } = await execFileAsync("node", [
                wrapperPath,
                targetFile
            ]);

            const skipMessages = stdout
                .split(/\r?\n/)
                .filter((line) => line.startsWith("Skipping "));
            assert.ok(
                skipMessages.some((line) =>
                    line.includes(" (ignored by ") &&
                    line.includes(ignorePath)
                ),
                "Expected wrapper output to explain which ignore file skipped the target"
            );

            const summaryMatch = stdout.match(/Skipped (\d+) files/);
            assert.ok(summaryMatch);
            assert.strictEqual(Number(summaryMatch[1]), 1);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var    a=1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("formats files restored by negated .prettierignore entries", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const ignoredDirectory = path.join(tempDirectory, "ignored");
            await fs.mkdir(ignoredDirectory);

            const targetFile = path.join(ignoredDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const ignorePath = path.join(tempDirectory, ".prettierignore");
            await fs.writeFile(
                ignorePath,
                "ignored/*\n!ignored/script.gml\n",
                "utf8"
            );

            await execFileAsync("node", [wrapperPath, tempDirectory]);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("does not descend into directories ignored by .prettierignore", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const ignoredDirectory = path.join(tempDirectory, "ignored");
            await fs.mkdir(ignoredDirectory);

            const ignoredSidecar = path.join(ignoredDirectory, "file.txt");
            await fs.writeFile(ignoredSidecar, "hello", "utf8");

            const ignorePath = path.join(tempDirectory, ".prettierignore");
            await fs.writeFile(ignorePath, "ignored/\n", "utf8");

            const { stdout } = await execFileAsync("node", [
                wrapperPath,
                tempDirectory
            ]);

            const skippedMatch = stdout.match(/Skipped (\d+) file(?:s)?/);
            assert.ok(
                skippedMatch,
                "Expected wrapper output to report skipped files"
            );
            assert.strictEqual(Number(skippedMatch[1]), 1);
            assert.match(
                stdout,
                /Skipped 1 file because they were ignored or used different extensions\./,
                "Expected wrapper output to include skip rationale"
            );

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("respects .prettierignore entries in ancestor directories when formatting a subdirectory", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const nestedDirectory = path.join(tempDirectory, "nested");
            await fs.mkdir(nestedDirectory);

            const targetFile = path.join(nestedDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const ignorePath = path.join(tempDirectory, ".prettierignore");
            await fs.writeFile(ignorePath, "nested/script.gml\n", "utf8");

            await execFileAsync("node", [wrapperPath, nestedDirectory]);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var    a=1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("respects .prettierignore files within nested directories", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const nestedDirectory = path.join(tempDirectory, "nested");
            await fs.mkdir(nestedDirectory);

            const targetFile = path.join(nestedDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const nestedIgnorePath = path.join(
                nestedDirectory,
                ".prettierignore"
            );
            await fs.writeFile(nestedIgnorePath, "*.gml\n", "utf8");

            await execFileAsync("node", [wrapperPath, tempDirectory]);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var    a=1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("ignores .prettierignore files outside the target project", async () => {
        const outerDirectory = await createTemporaryDirectory();
        const projectDirectory = await createTemporaryDirectory();

        try {
            const ignorePath = path.join(outerDirectory, ".prettierignore");
            await fs.writeFile(ignorePath, "*.gml\n", "utf8");

            const targetFile = path.join(projectDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            await execFileAsync("node", [wrapperPath, projectDirectory], {
                cwd: outerDirectory
            });

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(projectDirectory, { recursive: true, force: true });
            await fs.rm(outerDirectory, { recursive: true, force: true });
        }
    });

    it("does not rewrite files when formatting produces no changes", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            await execFileAsync("node", [wrapperPath, tempDirectory]);
            const { mtimeMs: initialMtime } = await fs.stat(targetFile);

            const { stdout } = await execFileAsync("node", [
                wrapperPath,
                tempDirectory
            ]);
            const { mtimeMs: finalMtime } = await fs.stat(targetFile);

            assert.strictEqual(finalMtime, initialMtime);
            const formattedMessages = stdout
                .split(/\r?\n/)
                .filter((line) => line.startsWith("Formatted "));
            assert.deepStrictEqual(
                formattedMessages,
                [],
                "Expected the second run not to report formatted files"
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("skips symbolic links to avoid infinite directory traversal loops", async (t) => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const symlinkPath = path.join(tempDirectory, "loop");

            let shouldSkip = false;

            try {
                await fs.symlink(tempDirectory, symlinkPath, "dir");
            } catch (error) {
                if (
                    error &&
                    (error.code === "EPERM" || error.code === "ENOSYS")
                ) {
                    shouldSkip = true;
                } else {
                    throw error;
                }
            }

            if (shouldSkip) {
                t.skip();
            }

            const { stdout } = await execFileAsync("node", [
                wrapperPath,
                tempDirectory
            ]);

            assert.ok(
                stdout.includes(`Skipping ${symlinkPath} (symbolic link)`),
                "Expected wrapper output to report skipped symbolic links"
            );

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("reverts formatted files when configured to revert on parser errors", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const formattedBeforeFailure = path.join(
                tempDirectory,
                "aaa_formatted.gml"
            );
            const parseFailure = path.join(tempDirectory, "zzz_failure.gml");

            await fs.writeFile(formattedBeforeFailure, "var    a=1;\n", "utf8");
            await fs.writeFile(parseFailure, "if (\n", "utf8");

            try {
                await execFileAsync("node", [
                    wrapperPath,
                    "--on-parse-error=revert",
                    tempDirectory
                ]);
                assert.fail(
                    "Expected the wrapper to exit with a non-zero status code"
                );
            } catch (error) {
                assert.ok(error, "Expected an error to be thrown");
                assert.strictEqual(
                    error.code,
                    1,
                    "Expected a non-zero exit code"
                );
                assert.ok(
                    error.stdout.includes(
                        `Formatted ${formattedBeforeFailure}`
                    ),
                    "Expected the formatted file to be processed before the failure"
                );
                const formattedContents = await fs.readFile(
                    formattedBeforeFailure,
                    "utf8"
                );
                assert.strictEqual(
                    formattedContents,
                    "var    a=1;\n",
                    "Expected reverted file contents to match the original"
                );
                const failureContents = await fs.readFile(parseFailure, "utf8");
                assert.strictEqual(
                    failureContents,
                    "if (\n",
                    "Expected the failing file to remain untouched"
                );
                assert.ok(
                    /Reverting 1 formatted file/.test(error.stderr),
                    "Expected stderr to mention that files were reverted"
                );
            }
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("aborts formatting additional files when configured to abort on parser errors", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const parseFailure = path.join(tempDirectory, "aaa_failure.gml");
            const pendingFormat = path.join(tempDirectory, "bbb_pending.gml");

            await fs.writeFile(parseFailure, "if (\n", "utf8");
            await fs.writeFile(pendingFormat, "var    b=2;\n", "utf8");

            try {
                await execFileAsync("node", [
                    wrapperPath,
                    "--on-parse-error=abort",
                    tempDirectory
                ]);
                assert.fail(
                    "Expected the wrapper to exit with a non-zero status code"
                );
            } catch (error) {
                assert.ok(error, "Expected an error to be thrown");
                assert.strictEqual(
                    error.code,
                    1,
                    "Expected a non-zero exit code"
                );
                const pendingContents = await fs.readFile(
                    pendingFormat,
                    "utf8"
                );
                assert.strictEqual(
                    pendingContents,
                    "var    b=2;\n",
                    "Expected formatting to abort before touching later files"
                );
                const failureContents = await fs.readFile(parseFailure, "utf8");
                assert.strictEqual(
                    failureContents,
                    "if (\n",
                    "Expected the failing file to remain untouched"
                );
            }
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("exits with a non-zero status when formatting fails", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "if (\n", "utf8");

            try {
                await execFileAsync("node", [wrapperPath, tempDirectory]);
                assert.fail(
                    "Expected the wrapper to exit with a non-zero status code"
                );
            } catch (error) {
                assert.ok(
                    error,
                    "Expected an error to be thrown for a failing format"
                );
                assert.strictEqual(
                    error.code,
                    1,
                    "Expected a non-zero exit code when formatting fails"
                );
                assert.ok(
                    /Syntax Error/.test(error.stderr),
                    "Expected stderr to include the formatting error message"
                );
            }
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("provides usage guidance when the target path cannot be accessed", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const missingPath = path.join(tempDirectory, "missing");

            try {
                await execFileAsync("node", [wrapperPath, missingPath]);
                assert.fail(
                    "Expected the wrapper to exit with a non-zero status code"
                );
            } catch (error) {
                assert.ok(error, "Expected an error to be thrown");
                assert.strictEqual(
                    error.code,
                    1,
                    "Expected a non-zero exit code for inaccessible targets"
                );
                assert.ok(
                    error.stderr.includes(`Unable to access ${missingPath}`),
                    "Expected stderr to mention the inaccessible target"
                );
                assert.ok(
                    /Usage: prettier-plugin-gml/.test(error.stderr),
                    "Expected stderr to include the CLI usage information"
                );
            }
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("formats the current working directory when no target path is provided", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const { stdout, stderr } = await execFileAsync(
                "node",
                [wrapperPath],
                {
                    cwd: tempDirectory
                }
            );

            assert.strictEqual(stderr, "", "Expected stderr to be empty");
            assert.match(
                stdout,
                /Formatted .*script\.gml/,
                "Expected stdout to mention the formatted file"
            );
            assert.match(
                stdout,
                /Skipped 0 files\./,
                "Expected stdout to summarize skipped files"
            );

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("informs the user when no files match the configured extensions", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const ignoredFile = path.join(tempDirectory, "notes.txt");
            await fs.writeFile(ignoredFile, "hello", "utf8");

            const { stdout, stderr } = await execFileAsync("node", [
                wrapperPath,
                tempDirectory
            ]);

            assert.strictEqual(stderr, "", "Expected stderr to be empty");
            assert.match(
                stdout,
                /No files matching "\.gml" were found/,
                "Expected stdout to explain why nothing was formatted"
            );
            assert.match(
                stdout,
                /Skipped \d+ file(?:s)? because they were ignored or used different extensions\./,
                "Expected stdout to summarize the skipped files"
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    it("prints CLI version information without triggering error handling", async () => {
        const { stdout, stderr } = await execFileAsync("node", [
            wrapperPath,
            "--version"
        ]);

        assert.strictEqual(stderr, "", "Expected stderr to be empty");
        assert.ok(
            stdout.trim().length > 0,
            "Expected stdout to include a version label"
        );
    });
});
