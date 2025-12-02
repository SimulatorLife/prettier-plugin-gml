import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

import { describe, it } from "node:test";
import { Core } from "@gml-modules/core";

const execFileAsync = promisify(execFile);
const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
// The repository compiles TypeScript into a parallel 'dist' directory; when
// running tests against compiled JS, prefer the emitted CLI entrypoint
// (dist/index.js) and fallback to the source-relative path when running
// tests directly against TypeScript sources.
const candidateDist = path.resolve(currentDirectory, "../dist/index.js");
const wrapperPath = fsSync.existsSync(candidateDist)
    ? candidateDist
    : path.resolve(currentDirectory, "../src/cli.js");
// Note: when running compiled tests (dist/*) the test file directory may
// be nested differently than the TypeScript sources. Resolve the VCS/root
// directory by walking upward until we find project metadata (package.json)
// to ensure path computations remain correct regardless of compiled vs
// source test locations.

// These integration tests intentionally rely on the strict assertion helpers
// (e.g. assert.strictEqual/assert.deepStrictEqual) to avoid the deprecated
// loose equality variants while still validating the CLI behaviour end-to-end.

async function createTemporaryDirectory() {
    const directoryPrefix = path.join(os.tmpdir(), "gml-prettier-wrapper-");
    return fs.mkdtemp(directoryPrefix);
}

function escapeForRegex(value) {
    return value.replaceAll(/[|\\{}()\[\]\^$+*?.-]/g, String.raw`\$&`);
}

void describe("Prettier wrapper CLI", () => {
    void it("formats files with uppercase .GML extensions", async () => {
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

    void it("does not mutate tracked repository fixtures when run in write-mode from repo root", async () => {
        // This test validates that running the CLI in write-mode from the
        // repository root does not result in silent mutation of tracked
        // fixture files. If it ever does, the test will fail and restore
        // the original file contents to avoid leaving the workspace dirty.
        const repoRootDirectory = await Core.findRepoRoot(currentDirectory);
        const fixturePath = path.join(
            repoRootDirectory,
            "src/plugin/test/testFormatting.input.gml"
        );

        // Read the baseline content for the tracked fixture and ensure we
        // restore it after the assertion so test runs remain side-effect
        // free. If the CLI writes to the fixture, the equality assertion
        // below will fail and alert reviewers to the regression.
        const baseline = await fs.readFile(fixturePath, "utf8");

        try {
            const env = {
                ...process.env,
                PRETTIER_PLUGIN_GML_DEFAULT_ACTION: "format",
                PRETTIER_PLUGIN_GML_ON_PARSE_ERROR: "skip",
                PRETTIER_PLUGIN_GML_LOG_LEVEL: "silent"
            };

            await execFileAsync("node", [wrapperPath], {
                cwd: repoRootDirectory,
                env,
                maxBuffer: 1024 * 1024 * 64
            });

            const after = await fs.readFile(fixturePath, "utf8");
            assert.strictEqual(
                after,
                baseline,
                "Running the wrapper from the repository root in write-mode mutated a tracked fixture. Tests should never format real repo fixtures in-place."
            );
        } finally {
            // Ensure we always restore the baseline to avoid leaving the
            // repository in a changed state even when a regression occurs.
            await fs.writeFile(fixturePath, baseline, "utf8");
        }
    });

    void it("formats a single file when the target path points to a file", async () => {
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

    void it("derives default extensions from the environment when configured", async () => {
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

    void it("normalizes glob patterns in default extension environment overrides", async () => {
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

    void it("recognizes whitespace-separated default extension overrides", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const gmlFile = path.join(tempDirectory, "example.gml");
            const txtFile = path.join(tempDirectory, "extra.txt");
            await fs.writeFile(gmlFile, "var    a=1;\n", "utf8");
            await fs.writeFile(txtFile, "var    b=2;\n", "utf8");

            const env = {
                ...process.env,
                PRETTIER_PLUGIN_GML_DEFAULT_EXTENSIONS: ".gml    .txt"
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

    void it("accepts custom Prettier log levels via CLI option", async () => {
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

    void it("honours PRETTIER_PLUGIN_GML_LOG_LEVEL environment overrides", async () => {
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

    void it("reports invalid log level values with guidance", async () => {
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

    void it("formats files when a custom extension is provided", async () => {
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

    void it("merges repeated --extensions flags", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const firstFile = path.join(tempDirectory, "alpha.txt");
            const secondFile = path.join(tempDirectory, "beta.scr");
            await fs.writeFile(firstFile, "var    a=1;\n", "utf8");
            await fs.writeFile(secondFile, "var    b=2;\n", "utf8");

            await execFileAsync("node", [
                wrapperPath,
                "--extensions=.txt",
                "--extensions=.scr",
                tempDirectory
            ]);

            const formattedFirst = await fs.readFile(firstFile, "utf8");
            const formattedSecond = await fs.readFile(secondFile, "utf8");
            assert.strictEqual(formattedFirst, "var a = 1;\n");
            assert.strictEqual(formattedSecond, "var b = 2;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("applies Prettier configuration from the target project", async () => {
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

    void it("loads plugins declared as strings in project configuration", async () => {
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

    void it("overrides conflicting parser configuration from .prettierrc", async () => {
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
            // Accept both compact single-line formatting or the indented multi-
            // line variant. The plugin may render short enums in the compact
            // style under certain conditions; the purpose of this test is to
            // ensure we used the plugin (not the babel parser), so both are
            // acceptable.
            const multiLine = ["enum MyEnum {", "    value", "}", ""].join(
                "\n"
            );
            const singleLine = "enum MyEnum {value}\n";
            assert.ok(
                formatted === multiLine || formatted === singleLine,
                `Unexpected output:\n${formatted}`
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("respects ignore rules from .prettierignore", async () => {
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

    void it("respects .prettierignore entries when invoked with a file path", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const ignorePath = path.join(tempDirectory, ".prettierignore");
            await fs.writeFile(ignorePath, "script.gml\n", "utf8");

            await execFileAsync("node", [wrapperPath, targetFile]);

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var    a=1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("formats files restored by negated .prettierignore entries", async () => {
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

    void it("does not descend into directories ignored by .prettierignore", async () => {
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

            assert.match(
                stdout,
                /Skipped 1 directory ignored by \.prettierignore/,
                "Expected wrapper output to summarize ignored directories"
            );

            const skippedMatch = stdout.match(/Skipped (\d+) file(?:s)?/);
            assert.ok(
                skippedMatch,
                "Expected wrapper output to report skipped files"
            );
            assert.strictEqual(Number(skippedMatch[1]), 1);
            assert.match(
                stdout,
                /unsupported extensions \(1\) \(e\.g\., .*\.prettierignore\)/,
                "Expected wrapper output to highlight example unsupported files"
            );

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("honours the unsupported extension sample limit", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const ignoredFile = path.join(tempDirectory, "notes.txt");
            await fs.writeFile(ignoredFile, "hello", "utf8");

            const { stdout } = await execFileAsync("node", [
                wrapperPath,
                "--unsupported-extension-sample-limit",
                "0",
                tempDirectory
            ]);

            const unsupportedSummaryLine = stdout
                .split("\n")
                .map((line) => line.trim())
                .find((line) => line.includes("unsupported extensions (1)"));

            assert.ok(
                unsupportedSummaryLine,
                "Expected summary to mention unsupported extensions"
            );
            assert.doesNotMatch(
                unsupportedSummaryLine,
                /\(e\.g\.,/,
                "Expected unsupported extension summary to omit examples when the sample limit is zero"
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("summarizes files ignored by .prettierignore", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const ignorePath = path.join(tempDirectory, ".prettierignore");
            await fs.writeFile(ignorePath, "script.gml\n", "utf8");

            const { stdout } = await execFileAsync("node", [
                wrapperPath,
                tempDirectory
            ]);

            assert.ok(
                stdout.includes('All files matching ".gml" were skipped'),
                "Expected stdout to explain that matching files were skipped"
            );
            assert.ok(
                stdout.includes("by ignore rules. Nothing to format."),
                "Expected stdout to mention that ignores prevented formatting"
            );
            assert.match(stdout, /ignored by \.prettierignore \(1\)/);

            assert.match(
                stdout,
                /Breakdown:/,
                "Expected stdout to summarize the skip reasons"
            );

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var    a=1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("identifies the ignore file that excluded a target", async () => {
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

            assert.match(
                stdout,
                new RegExp(
                    String.raw`${escapeForRegex(path.basename(targetFile))} was skipped by ignore rules and not formatted\.`,
                    "m"
                ),
                "Expected summary output to explain that the file was ignored"
            );

            const expectedPattern = new RegExp(
                String.raw`Skipping ${escapeForRegex(targetFile)} \(ignored by ${escapeForRegex(
                    ignorePath
                )}\)`,
                "m"
            );

            assert.match(
                stdout,
                expectedPattern,
                "Expected skip log to reference the matching .prettierignore"
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("honours the ignored directory sample limit", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const ignorePath = path.join(tempDirectory, ".prettierignore");
            await fs.writeFile(
                ignorePath,
                `${["ignored-one/", "ignored-two/", "ignored-three/"].join(
                    "\n"
                )}\n`,
                "utf8"
            );

            for (const directoryName of [
                "ignored-one",
                "ignored-two",
                "ignored-three"
            ]) {
                const directory = path.join(tempDirectory, directoryName);
                await fs.mkdir(directory);
            }

            const { stdout } = await execFileAsync("node", [
                wrapperPath,
                "--ignored-directory-sample-limit",
                "0",
                tempDirectory
            ]);

            const summaryLines = stdout
                .split("\n")
                .filter((line) => line.length > 0);
            const directorySummaryLine = summaryLines.find((line) =>
                line.startsWith(
                    "Skipped 3 directories ignored by .prettierignore"
                )
            );

            assert.ok(
                directorySummaryLine,
                "Expected to find the ignored-directory summary line"
            );
            assert.strictEqual(
                directorySummaryLine,
                "Skipped 3 directories ignored by .prettierignore.",
                "Expected ignored directory summary to omit examples when the sample limit is zero"
            );
            assert.doesNotMatch(
                directorySummaryLine,
                /e\.g\./,
                "Expected ignored directory summary to omit sample prefixes when disabled"
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("limits ignored file skip logs when requested", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const ignorePath = path.join(tempDirectory, ".prettierignore");
            await fs.writeFile(ignorePath, "*.gml\n", "utf8");

            for (const index of [1, 2, 3]) {
                const filePath = path.join(
                    tempDirectory,
                    `script-${index}.gml`
                );
                await fs.writeFile(filePath, "var    a=1;\n", "utf8");
            }

            const { stdout } = await execFileAsync("node", [
                wrapperPath,
                "--ignored-file-sample-limit",
                "1",
                tempDirectory
            ]);

            const skipMatches =
                stdout.match(/Skipping .* \(ignored by .*\)/g) ?? [];
            assert.strictEqual(
                skipMatches.length,
                1,
                "Expected skip logging to honour the ignored file sample limit"
            );

            const summaryLine = stdout
                .split("\n")
                .map((line) => line.trim())
                .find((line) =>
                    line.includes("ignored by .prettierignore (3)")
                );

            assert.ok(
                summaryLine,
                "Expected summary to report the total number of ignored files"
            );

            assert.match(
                summaryLine,
                /ignored by \.prettierignore \(3\) \(e\.g\., .*\.gml.*\, \.\.\.\)/,
                "Expected summary to include an example and ellipsis when output is truncated"
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("respects .prettierignore entries in ancestor directories when formatting a subdirectory", async () => {
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

    void it("respects .prettierignore files within nested directories", async () => {
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

    void it("ignores .prettierignore files outside the target project", async () => {
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

    void it("ignores .prettierignore files above the invocation directory", async () => {
        const outerDirectory = await createTemporaryDirectory();
        const projectDirectory = path.join(outerDirectory, "project");

        try {
            await fs.mkdir(projectDirectory);

            const ignorePath = path.join(outerDirectory, ".prettierignore");
            await fs.writeFile(ignorePath, "*.gml\n", "utf8");

            const targetFile = path.join(projectDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            await execFileAsync("node", [wrapperPath], {
                cwd: projectDirectory,
                env: {
                    ...process.env,
                    PRETTIER_PLUGIN_GML_DEFAULT_ACTION: "format"
                }
            });

            const formatted = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(formatted, "var a = 1;\n");
        } finally {
            await fs.rm(outerDirectory, { recursive: true, force: true });
        }
    });

    void it("does not rewrite files when formatting produces no changes", async () => {
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

    void it("reports files that need formatting when --check is enabled", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            try {
                await execFileAsync("node", [
                    wrapperPath,
                    "--check",
                    tempDirectory
                ]);
                assert.fail(
                    "Expected the wrapper to exit with a non-zero status code"
                );
            } catch (error) {
                assert.ok(
                    error,
                    "Expected the wrapper to throw when changes are needed"
                );
                assert.strictEqual(
                    error.code,
                    1,
                    "Expected a non-zero exit code"
                );

                const escapedPath = escapeForRegex(targetFile);
                assert.match(
                    error.stdout,
                    new RegExp(`Would format ${escapedPath}`),
                    "Expected stdout to list files requiring formatting"
                );
                assert.match(
                    error.stdout,
                    /1 file requires formatting\. Re-run without --check to write changes\./,
                    "Expected stdout to summarize the pending change count"
                );
                assert.match(
                    error.stdout,
                    /Skipped 0 files\./,
                    "Expected stdout to retain the skip summary"
                );

                const contents = await fs.readFile(targetFile, "utf8");
                assert.strictEqual(
                    contents,
                    "var    a=1;\n",
                    "Expected --check not to modify file contents"
                );
            }
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("confirms when all files are formatted in --check mode", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            await execFileAsync("node", [wrapperPath, tempDirectory]);

            const { stdout } = await execFileAsync("node", [
                wrapperPath,
                "--check",
                tempDirectory
            ]);

            assert.ok(
                stdout.includes("All matched files are already formatted."),
                "Expected stdout to confirm that no changes are required"
            );
            assert.match(stdout, /Skipped 0 files\./);

            const contents = await fs.readFile(targetFile, "utf8");
            assert.strictEqual(contents, "var a = 1;\n");
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("explains when --check only encounters ignored files", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var a = 1;\n", "utf8");

            const ignorePath = path.join(tempDirectory, ".prettierignore");
            await fs.writeFile(ignorePath, "*.gml\n", "utf8");

            const { stdout } = await execFileAsync("node", [
                wrapperPath,
                "--check",
                tempDirectory
            ]);

            assert.ok(
                stdout.includes('All files matching ".gml" were skipped'),
                "Expected stdout to explain that matching files were ignored"
            );
            assert.ok(
                stdout.includes("by ignore rules. Nothing to format."),
                "Expected stdout to mention that ignores prevented formatting"
            );
            assert.match(stdout, /ignored by \.prettierignore \(1\)/);
            assert.match(stdout, /Nothing to format\./);
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("skips symbolic links to avoid infinite directory traversal loops", async (t) => {
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

    void it("reverts formatted files when configured to revert on parser errors", async () => {
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

    void it("aborts formatting additional files when configured to abort on parser errors", async () => {
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

    void it("exits with a non-zero status when formatting fails", async () => {
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
                assert.match(
                    error.stderr,
                    /Formatting failed for 1 file\./,
                    "Expected stderr to summarize the number of failed files"
                );
                assert.ok(
                    error.stderr.includes(
                        "Adjust --on-parse-error (skip, abort, or revert) if you need to change how failures are handled."
                    ),
                    "Expected stderr to explain how to adjust parse error handling"
                );
            }
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("provides usage guidance when the target path cannot be accessed", async () => {
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
                assert.match(
                    error.stderr,
                    /Verify the path exists relative to the current working directory/i,
                    "Expected stderr to explain how to resolve missing paths"
                );
                assert.match(
                    error.stderr,
                    /Run "prettier-plugin-gml --help" to review available commands and usage examples\./i,
                    "Expected stderr to suggest reviewing the CLI command list"
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

    void it("formats the current working directory when no target path is provided", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const targetFile = path.join(tempDirectory, "script.gml");
            await fs.writeFile(targetFile, "var    a=1;\n", "utf8");

            const { stdout, stderr } = await execFileAsync(
                "node",
                [wrapperPath],
                {
                    cwd: tempDirectory,
                    env: {
                        ...process.env,
                        PRETTIER_PLUGIN_GML_DEFAULT_ACTION: "format"
                    }
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

    void it("informs the user when no files match the configured extensions", async () => {
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
            assert.ok(
                stdout.includes(
                    "For example: npx prettier-plugin-gml format path/to/project or npm run format:gml -- path/to/project."
                ),
                "Expected stdout to suggest both the CLI and workspace wrapper commands"
            );
            assert.match(
                stdout,
                /unsupported extensions \(\d+\) \(e\.g\., .*notes\.txt\)/,
                "Expected stdout to summarize skipped files with concrete examples"
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("describes the current directory explicitly when no files match", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
            const { stdout, stderr } = await execFileAsync(
                "node",
                [wrapperPath],
                {
                    cwd: tempDirectory,
                    env: {
                        ...process.env,
                        PRETTIER_PLUGIN_GML_DEFAULT_ACTION: "format"
                    }
                }
            );

            assert.strictEqual(stderr, "", "Expected stderr to be empty");
            assert.match(
                stdout,
                /found in the current (?:working )?directory(?: \(\.\))?\./,
                "Expected stdout to describe the current directory explicitly"
            );
            assert.ok(
                stdout.includes(
                    "For example: npx prettier-plugin-gml format path/to/project or npm run format:gml -- path/to/project."
                ),
                "Expected stdout to repeat the CLI guidance when formatting finds no targets"
            );
            assert.ok(
                stdout.includes("found in the current working directory (.)"),
                "Expected stdout to call out the current working directory"
            );
            assert.ok(
                !stdout.includes("found in .."),
                "Expected stdout not to include duplicate punctuation when describing the current directory"
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("describes the invocation directory explicitly when run from the repository root", async () => {
        // Run the wrapper from a temporary directory emulating a project root
        // to avoid mutating checked-in fixtures in the repository. Create a
        // sample GML file so the wrapper will find files to format and
        // surface the same log messaging as a real repository-root invocation.
        const tempDirectory = await createTemporaryDirectory();
        const sampleFile = path.join(tempDirectory, "script.gml");
        await fs.writeFile(sampleFile, "var    a=1;\n", "utf8");
        try {
            // Run the wrapper from the temporary project root. The wrapper will scan and
            // format files across the temporary directory, and several debug-level
            // diagnostic services may emit very large numbers of log lines which
            // can overflow the default child process buffer. Suppress noisy debug
            // logs and increase the buffer as a safeguard to avoid intermittent
            // test failures.
            const env = {
                ...process.env,
                PRETTIER_PLUGIN_GML_DEFAULT_ACTION: "format",
                // Skip parse errors for this repo-wide invocation so tests don't
                // fail due to sample test inputs intentionally including preprocessor
                // directives (e.g., `#` tokens in SnowState.gml).
                PRETTIER_PLUGIN_GML_ON_PARSE_ERROR: "skip",
                // Silence debug-level noise so the test can reliably parse the
                // human-facing summary output from stdout.
                PRETTIER_PLUGIN_GML_LOG_LEVEL: "silent"
            };

            const { stdout, stderr } = await execFileAsync(
                "node",
                [wrapperPath],
                {
                    cwd: tempDirectory,
                    // 8MB max buffer is sufficient in CI for reduced logging; keep it
                    // modest to avoid masking legitimate issues while still preventing
                    // intermittent RangeError failures on macOS/Node.
                    // Increase to 64MB to safely capture expanded output when running
                    // the wrapper from the repository root. We also explicitly unset
                    // the DEBUG environment variable below to avoid contaminating
                    // stdout with other library-level debug streams.
                    maxBuffer: 1024 * 1024 * 64,
                    env: {
                        ...env,
                        DEBUG: "",
                        // Some internal tooling or dependencies also respect NODE_DEBUG,
                        // ensure it is unset for the test run to avoid excessive log
                        // output in CI.
                        NODE_DEBUG: ""
                    }
                }
            );

            assert.strictEqual(stderr, "", "Expected stderr to be empty");
            assert.match(
                stdout,
                /found in the current (?:working )?directory(?: \(\.\))?\./,
                "Expected stdout to describe the repository root using the current directory phrasing"
            );
            assert.ok(
                stdout.includes("found in the current working directory (.)"),
                "Expected stdout to describe the repository root with a clear label"
            );
            assert.ok(
                !stdout.includes("found in .."),
                "Expected stdout not to include duplicate punctuation when describing the repository root"
            );
            assert.ok(
                stdout.includes(
                    "For example: npx prettier-plugin-gml format path/to/project or npm run format:gml -- path/to/project."
                ),
                "Expected stdout to repeat the CLI guidance when invoked from the repository root"
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("shows help when invoked without arguments by default", async () => {
        const tempDirectory = await createTemporaryDirectory();

        try {
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
                /Usage: prettier-plugin-gml \[command\] \[options\]/,
                "Expected stdout to show help usage"
            );
            assert.match(
                stdout,
                /Commands:/,
                "Expected stdout to list available commands"
            );
            assert.match(
                stdout,
                /format \[options\] \[targetPath\]/,
                "Expected stdout to include format command"
            );
            assert.ok(
                stdout.includes(
                    "Run with a command name to get started (e.g., 'format --help' for formatting"
                ),
                "Expected stdout to guide users on how to get started"
            );
        } finally {
            await fs.rm(tempDirectory, { recursive: true, force: true });
        }
    });

    void it("surfaces common format examples in the help output", async () => {
        const { stdout, stderr } = await execFileAsync("node", [
            wrapperPath,
            "format",
            "--help"
        ]);

        assert.strictEqual(stderr, "", "Expected stderr to be empty");
        assert.match(
            stdout,
            /Examples:/,
            "Expected help to include an examples section"
        );
        assert.ok(
            stdout.includes("  npx prettier-plugin-gml format path/to/project"),
            "Expected help output to include the npx usage example"
        );
        assert.ok(
            stdout.includes("  npm run format:gml -- path/to/project"),
            "Expected help output to include the workspace wrapper example"
        );
        assert.ok(
            stdout.includes(
                "  npx prettier-plugin-gml format --check path/to/script.gml"
            ),
            "Expected help output to include the --check example"
        );
    });

    void it("prints CLI version information without triggering error handling", async () => {
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
