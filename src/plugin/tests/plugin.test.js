import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";
import { describe, it } from "node:test";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");
const fileEncoding = "utf8";
const fixtureExtension = ".gml";

async function readFixture(filePath) {
    const contents = await fs.readFile(filePath, fileEncoding);
    if (typeof contents !== "string") {
        throw new TypeError(
            `Expected fixture '${filePath}' to be read as a string.`
        );
    }
    return contents.trim();
}

async function tryLoadOptions(baseName) {
    const optionsFile = `${baseName}.options.json`;
    const optionsPath = path.join(currentDirectory, optionsFile);

    try {
        const contents = await fs.readFile(optionsPath, fileEncoding);
        if (!contents) {
            return null;
        }

        const parsed = JSON.parse(contents);
        if (parsed && typeof parsed === "object") {
            return parsed;
        }
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return null;
        }

        throw error;
    }

    return null;
}

async function loadTestCases() {
    const entries = await fs.readdir(currentDirectory);
    const caseMap = new Map();

    for (const entry of entries) {
        if (!entry.endsWith(fixtureExtension)) {
            continue;
        }

        if (entry.endsWith(`.input${fixtureExtension}`)) {
            const baseName = entry.replace(`.input${fixtureExtension}`, "");
            const existing = caseMap.get(baseName) ?? {};
            caseMap.set(baseName, { ...existing, inputFile: entry });
            continue;
        }

        if (entry.endsWith(`.output${fixtureExtension}`)) {
            const baseName = entry.replace(`.output${fixtureExtension}`, "");
            const existing = caseMap.get(baseName) ?? {};
            caseMap.set(baseName, { ...existing, outputFile: entry });
            continue;
        }

        const baseName = entry.replace(fixtureExtension, "");
        const existing = caseMap.get(baseName) ?? {};
        caseMap.set(baseName, { ...existing, singleFile: entry });
    }

    const sortedBaseNames = [...caseMap.keys()].toSorted();

    return Promise.all(
        sortedBaseNames.map(async (baseName) => {
            const { inputFile, outputFile, singleFile } = caseMap.get(baseName);

            if (singleFile && (inputFile || outputFile)) {
                throw new Error(
                    `Fixture '${baseName}' has both standalone and input/output files. Please keep only one style.`
                );
            }

            if (singleFile) {
                const singlePath = path.join(currentDirectory, singleFile);
                const [rawInput, expectedOutput] = await Promise.all([
                    fs.readFile(singlePath, fileEncoding),
                    readFixture(singlePath)
                ]);

                if (typeof rawInput !== "string") {
                    throw new TypeError(
                        `Expected fixture '${singlePath}' to be read as a string.`
                    );
                }

                const options = await tryLoadOptions(baseName);

                return {
                    baseName,
                    inputSource: rawInput,
                    expectedOutput,
                    options
                };
            }

            if (!inputFile || !outputFile) {
                throw new Error(
                    `Fixture '${baseName}' is missing its ${inputFile ? "output" : "input"} file.`
                );
            }

            const inputPath = path.join(currentDirectory, inputFile);
            const outputPath = path.join(currentDirectory, outputFile);

            const [rawInput, expectedOutput] = await Promise.all([
                fs.readFile(inputPath, fileEncoding),
                readFixture(outputPath)
            ]);

            if (typeof rawInput !== "string") {
                throw new TypeError(
                    `Expected fixture '${inputPath}' to be read as a string.`
                );
            }

            const options = await tryLoadOptions(baseName);

            return { baseName, inputSource: rawInput, expectedOutput, options };
        })
    );
}

async function formatWithPlugin(source, overrides) {
    const formatted = await prettier.format(source, {
        plugins: [pluginPath],
        parser: "gml-parse",
        ...overrides
    });

    if (typeof formatted !== "string") {
        throw new TypeError(
            "Prettier returned a non-string result when formatting GML."
        );
    }

    return formatted.trim();
}

const testCases = await loadTestCases();

describe("Prettier GameMaker plugin fixtures", () => {
    for (const {
        baseName,
        inputSource,
        expectedOutput,
        options
    } of testCases) {
        it(`formats ${baseName}`, async () => {
            const formatted = await formatWithPlugin(inputSource, options);
            const expected = expectedOutput.trim();

            if (formatted === expected) {
                return;
            }

            const formattedLines = formatted.split("\n");
            const expectedLines = expected.split("\n");
            const maxLineCount = Math.max(
                formattedLines.length,
                expectedLines.length
            );

            for (let index = 0; index < maxLineCount; index += 1) {
                const lineNumber = index + 1;
                const actualLine = formattedLines[index];
                const expectedLine = expectedLines[index];

                if (expectedLine === undefined) {
                    assert.fail(`Expected line ${lineNumber} is missing.`);
                }

                if (actualLine === undefined) {
                    assert.fail(`Received line ${lineNumber} is missing.`);
                }

                if (actualLine.trim() !== expectedLine.trim()) {
                    assert.strictEqual(
                        actualLine,
                        expectedLine,
                        `Line ${lineNumber} does not match.`
                    );
                }
            }
        });
    }

    it("preserves 'globalvar' declarations by default", async () => {
        const source = ["globalvar foo, bar;", "foo = 1;", "bar = 2;", ""].join(
            "\n"
        );

        const formatted = await formatWithPlugin(source);

        assert.ok(
            /globalvar foo, bar;/.test(formatted),
            "Expected formatted output to retain the 'globalvar' declaration."
        );
        assert.ok(
            /global\.foo = 1;/.test(formatted) &&
                /global\.bar = 2;/.test(formatted),
            "Expected formatter to continue prefixing global assignments."
        );
    });

    it("preserves parentheses in @description tags", async () => {
        const source = [
            "/// @description Draw()",
            "function draw() {",
            "    return 1;",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        assert.ok(
            formatted.includes("/// @description Draw()"),
            "Expected @description comments to retain trailing parentheses"
        );
    });

    it("retains blank lines following macro directives", async () => {
        const source = [
            "#define  TRIPLE(value) ((value) * 3)",
            "",
            "var total = TRIPLE(7);",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const lines = formatted.split("\n");
        const macroIndex = lines.findIndex((line) =>
            line.startsWith("#macro  TRIPLE")
        );

        assert.ok(macroIndex !== -1, "Expected macro directive to be printed.");
        assert.strictEqual(
            lines[macroIndex + 1],
            "",
            "Expected formatter to preserve the blank line after the macro."
        );
        assert.strictEqual(
            lines[macroIndex + 2],
            "var total = TRIPLE(7);",
            "Expected code following the macro to remain unchanged."
        );
    });

    it("normalises legacy #define directives", async () => {
        const source = [
            "#define region Toolbox",
            "#define endregion Toolbox",
            "#define LEGACY_MACRO VALUE",
            "#define 123 bad news",
            "var value = LEGACY_MACRO;"
        ].join("\n");

        const formatted = await formatWithPlugin(source);
        const lines = formatted.split("\n");

        assert.ok(
            !formatted.includes("#define"),
            "Expected all legacy #define directives to be rewritten or removed."
        );
        assert.ok(
            lines.includes("#region Toolbox"),
            "Expected region-style directives to become #region."
        );
        assert.ok(
            lines.includes("#endregion Toolbox"),
            "Expected endregion directives to become #endregion."
        );
        assert.ok(
            lines.includes("#macro LEGACY_MACRO VALUE"),
            "Expected macro-style directives to become #macro."
        );
        assert.ok(
            lines.includes("var value = LEGACY_MACRO;"),
            "Expected statements following removed directives to stay adjacent."
        );
        const macroIndex = lines.indexOf("#macro LEGACY_MACRO VALUE");
        assert.strictEqual(
            lines[macroIndex + 1],
            "var value = LEGACY_MACRO;",
            "Expected removed directives not to leave blank lines behind."
        );
    });

    it("converts argument_count fallback conditionals into default parameters", async () => {
        const source = [
            "function example(arg) {",
            "    if (argument_count > 0) {",
            "        arg = argument[0];",
            "    } else {",
            '        arg = "default";',
            "    }",
            "}"
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "/// @function example",
            '/// @param [arg="default"]',
            'function example(arg = "default") {}'
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("converts argument_count equality fallbacks into default parameters", async () => {
        const source = [
            "function equalityExample(arg) {",
            "    if (argument_count == 0) {",
            '        arg = "fallback";',
            "    } else {",
            "        arg = argument[0];",
            "    }",
            "}"
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "/// @function equalityExample",
            '/// @param [arg="fallback"]',
            'function equalityExample(arg = "fallback") {}'
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("converts argument_count inequality fallbacks into default parameters", async () => {
        const source = [
            "function inequalityExample(arg) {",
            "    if (argument_count != 0) {",
            "        arg = argument[0];",
            "    } else {",
            '        arg = "fallback";',
            "    }",
            "}"
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "/// @function inequalityExample",
            '/// @param [arg="fallback"]',
            'function inequalityExample(arg = "fallback") {}'
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("converts argument_count equality fallbacks targeting later arguments into default parameters", async () => {
        const source = [
            "function equalityExample(arg0, arg1) {",
            "    if (argument_count == 1) {",
            '        arg1 = "fallback";',
            "    } else {",
            "        arg1 = argument[1];",
            "    }",
            "}"
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "/// @function equalityExample",
            "/// @param arg0",
            '/// @param [arg1="fallback"]',
            'function equalityExample(arg0, arg1 = "fallback") {}'
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("converts argument_count inequality fallbacks targeting later arguments into default parameters", async () => {
        const source = [
            "function inequalityExample(arg0, arg1) {",
            "    if (argument_count != 1) {",
            "        arg1 = argument[1];",
            "    } else {",
            '        arg1 = "fallback";',
            "    }",
            "}"
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "/// @function inequalityExample",
            "/// @param arg0",
            '/// @param [arg1="fallback"]',
            'function inequalityExample(arg0, arg1 = "fallback") {}'
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("converts argument_count fallbacks guarded by <= or < comparisons", async () => {
        const source = [
            "function fallbackLeq(existing) {",
            "    var second;",
            "    if (argument_count <= 1) {",
            '        second = "fallback";',
            "    } else {",
            "        second = argument[1];",
            "    }",
            "    return existing + second;",
            "}",
            "",
            "function fallbackLt(existing) {",
            "    var second;",
            "    if (argument_count < 2) {",
            '        second = "fallback";',
            "    } else {",
            "        second = argument[1];",
            "    }",
            "    return existing + second;",
            "}"
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const expected = [
            "/// @function fallbackLeq",
            "/// @param existing",
            '/// @param [second="fallback"]',
            'function fallbackLeq(existing, second = "fallback") {',
            "    return existing + second;",
            "}",
            "",
            "/// @function fallbackLt",
            "/// @param existing",
            '/// @param [second="fallback"]',
            'function fallbackLt(existing, second = "fallback") {',
            "    return existing + second;",
            "}"
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("can elide 'globalvar' declarations when disabled", async () => {
        const source = ["globalvar foo, bar;", "foo = 1;", "bar = 2;", ""].join(
            "\n"
        );

        const formatted = await formatWithPlugin(source, {
            preserveGlobalVarStatements: false
        });

        assert.ok(
            !/globalvar\s+foo,\s*bar;/.test(formatted),
            "Expected formatter to omit 'globalvar' declarations when disabled."
        );
    });

    it("aligns trailing enum comments according to member width", async () => {
        const source = [
            "enum Alignment {",
            "    Left, // left comment",
            "    Right // right comment",
            "}",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const leftLine = formatted
            .split("\n")
            .find((line) => line.includes("Left"));
        const rightLine = formatted
            .split("\n")
            .find((line) => line.includes("Right"));

        assert.ok(
            leftLine && rightLine,
            "Expected formatted enum members to be present."
        );

        assert.strictEqual(
            leftLine.indexOf("//"),
            rightLine.indexOf("//"),
            "Expected aligned trailing comments to share the same column."
        );
    });

    it("keeps default spacing before trailing comments", async () => {
        const source = [
            "var foo = 1; // comment",
            "var bar = 2; // comment",
            ""
        ].join("\n");

        const formatted = await formatWithPlugin(source);

        const firstLine = formatted.split("\n")[0];
        const commentIndex = firstLine.indexOf("//");

        assert.ok(
            commentIndex > 0,
            "Expected formatted inline comment to be present."
        );

        const codeBeforeComment = firstLine.slice(0, commentIndex);
        const trimmedCode = codeBeforeComment.trimEnd();

        assert.strictEqual(
            codeBeforeComment.length - trimmedCode.length,
            1,
            "Expected exactly one space before the trailing comment."
        );
    });

    it("strips trailing macro semicolons when Feather fixes are applied", async () => {
        const source = [
            "#macro FOO(value) (value + 1);",
            "#macro BAR 100;",
            "",
            "var result = FOO(1) + BAR;"
        ].join("\n");

        const formatted = await formatWithPlugin(source, {
            applyFeatherFixes: true
        });

        const expected = [
            "#macro FOO(value) (value + 1)",
            "#macro BAR 100",
            "",
            "var result = FOO(1) + BAR;"
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("strips trailing macro semicolons before inline comments when Feather fixes are applied", async () => {
        const source = [
            "#macro FOO(value) (value + 1); // comment",
            "#macro BAR value + 2;",
            "",
            "var result = FOO(3) + BAR;"
        ].join("\n");

        const formatted = await formatWithPlugin(source, {
            applyFeatherFixes: true
        });

        const expected = [
            "#macro FOO(value) (value + 1) // comment",
            "#macro BAR value + 2",
            "",
            "var result = FOO(3) + BAR;"
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("avoids duplicating blank lines after macros when Feather fixes strip semicolons", async () => {
        const source = [
            "#macro FOO(value) (value + 1);",
            "#macro BAR value + 2;",
            "",
            "var total = FOO(3) + BAR;"
        ].join("\n");

        const formatted = await formatWithPlugin(source, {
            applyFeatherFixes: true
        });

        const expected = [
            "#macro FOO(value) (value + 1)",
            "#macro BAR value + 2",
            "",
            "var total = FOO(3) + BAR;"
        ].join("\n");

        assert.strictEqual(formatted, expected);
    });

    it("rewrites safe string concatenations into template strings when enabled", async () => {
        const source = 'var message = "Hello " + name + "!";\n';

        const formatted = await formatWithPlugin(source, {
            useStringInterpolation: true
        });

        assert.strictEqual(formatted, 'var message = $"Hello {name}!";');
    });

    it("leaves concatenations unchanged when string interpolation is disabled", async () => {
        const source = 'var message = "Hello " + name + "!";\n';

        const baseline = await formatWithPlugin(source);
        const formatted = await formatWithPlugin(source, {
            useStringInterpolation: false
        });

        assert.strictEqual(formatted, baseline);
    });

    it("skips concatenations that include non-string expressions", async () => {
        const source = 'var summary = "Score: " + playerName + 42;\n';

        const baseline = await formatWithPlugin(source);
        const formatted = await formatWithPlugin(source, {
            useStringInterpolation: true
        });

        assert.strictEqual(formatted, baseline);
    });
});
