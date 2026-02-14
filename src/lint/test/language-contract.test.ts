import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

import { ESLint } from "eslint";

import { Lint } from "../src/lint-namespace.js";

const execFileAsync = promisify(execFile);

async function lintTextWithESLintVersion(ESLintImplementation: typeof ESLint, sourceText: string) {
    const eslint = new ESLintImplementation({
        overrideConfigFile: true,
        overrideConfig: [
            {
                files: ["**/*.gml"],
                plugins: {
                    gml: Lint.plugin
                },
                language: "gml/gml",
                rules: {
                    "gml/no-globalvar": "off"
                }
            }
        ]
    });

    const [result] = await eslint.lintText(sourceText, {
        filePath: "contract-target.gml"
    });

    return result;
}

async function runVersionCompatibilityProbe(packageName: string): Promise<void> {
    const languageProbe = `
        import { ESLint } from "${packageName}";
        import { plugin } from "./src/plugin.js";

        const eslint = new ESLint({
            overrideConfigFile: true,
            overrideConfig: [{
                files: ["**/*.gml"],
                plugins: { gml: plugin },
                language: "gml/gml",
                rules: { "gml/no-globalvar": "off" }
            }]
        });

        const [result] = await eslint.lintText("var x = 1;", { filePath: "contract-target.gml" });
        if (result.fatalErrorCount !== 0) {
            throw new Error("Compatibility probe failed.");
        }
    `;

    await execFileAsync("node", ["--input-type=module", "-e", languageProbe], {
        cwd: new URL("../", import.meta.url)
    });
}

void test("language object pins ESLint v9 language behavior fields", () => {
    const language = Lint.plugin.languages.gml as Record<string, unknown>;

    assert.equal(language.fileType, "text");
    assert.equal(language.lineStart, 1);
    assert.equal(language.columnStart, 0);
    assert.equal(language.nodeTypeKey, "type");
    assert.deepEqual(language.defaultLanguageOptions, { recovery: "limited" });
    assert.deepEqual(language.visitorKeys, {});
});

void test("language parse failure returns ESLint parse-failure channel", () => {
    const language = Lint.plugin.languages.gml as {
        parse: (
            file: { body: string; path: string },
            context: { languageOptions: Record<string, unknown> }
        ) =>
            | { ok: true; ast: unknown; parserServices: unknown }
            | { ok: false; errors: Array<{ message: string; line: number; column: number }> };
    };

    const parseResult = language.parse(
        {
            body: "if (",
            path: "broken.gml"
        },
        {
            languageOptions: {}
        }
    );

    assert.equal(parseResult.ok, false);
    if (parseResult.ok) {
        return;
    }

    assert.equal(parseResult.errors.length, 1);
    assert.equal(typeof parseResult.errors[0]?.message, "string");
    assert.equal(typeof parseResult.errors[0]?.line, "number");
    assert.equal(typeof parseResult.errors[0]?.column, "number");
});

void test("language hooks run successfully on minimum ESLint version", async () => {
    await runVersionCompatibilityProbe("eslint-min");
});

void test("language hooks run successfully on latest ESLint version", async () => {
    const result = await lintTextWithESLintVersion(ESLint, "var x = 1;");
    assert.equal(result.fatalErrorCount, 0);
    await runVersionCompatibilityProbe("eslint");
});
