import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import * as LintWorkspace from "@gml-modules/lint";
import { ESLint } from "eslint";

const { Lint } = LintWorkspace;

type ParseSuccess = {
    ok: true;
    ast: {
        comments?: Array<{ range?: [number, number] }>;
        tokens?: Array<{ range?: [number, number] }>;
        body?: Array<{ arguments?: Array<{ range?: [number, number] }> }>;
    };
    parserServices: {
        gml: {
            filePath: string;
            recovery: Array<{ kind: string; originalOffset: number }>;
            directives: Array<Record<string, unknown>>;
            enums: Array<Record<string, unknown>>;
        };
    };
};

type ParseFailure = {
    ok: false;
    errors: ReadonlyArray<{ message: string; line: number; column: number }>;
};

const execFileAsync = promisify(execFile);

function parseWithOptions(
    sourceText: string,
    recovery: "none" | "limited",
    filePath = "./test.gml"
): ParseSuccess | ParseFailure {
    const language = Lint.plugin.languages.gml as {
        parse: (
            file: { body: string; path: string },
            context: { languageOptions: { recovery: "none" | "limited" } }
        ) => ParseSuccess | ParseFailure;
    };

    return language.parse(
        {
            body: sourceText,
            path: filePath
        },
        {
            languageOptions: { recovery }
        }
    );
}

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

void test("language parse returns ESLint v9 parse channel with ok discriminator", () => {
    const result = parseWithOptions("var x = 1;", "limited");
    assert.equal(result.ok, true);
});

void test("language parse failure returns ESLint parse-failure channel", () => {
    const parseResult = parseWithOptions("if (", "limited");

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

void test("strict parse fails while limited recovery succeeds for missing argument separators", () => {
    const strictResult = parseWithOptions("show_debug_message(1 2);", "none");
    assert.equal(strictResult.ok, false);

    const limitedResult = parseWithOptions("show_debug_message(1 2);", "limited");
    assert.equal(limitedResult.ok, true);

    if (!limitedResult.ok) {
        assert.fail("Expected limited recovery parse success.");
    }

    assert.equal(limitedResult.parserServices.gml.recovery.length, 1);
    assert.equal(limitedResult.parserServices.gml.recovery[0]?.kind, "inserted-argument-separator");

    const recoveredArgumentRange = limitedResult.ast.body?.[0]?.arguments?.[1]?.range;
    assert.deepEqual(recoveredArgumentRange, [21, 22]);
});

void test("limited recovery preserves projected substring invariants for argument ranges", () => {
    const source = "show_debug_message(10 20);";
    const result = parseWithOptions(source, "limited");
    assert.equal(result.ok, true);

    if (!result.ok) {
        assert.fail("Expected limited recovery parse success.");
    }

    const secondArgumentRange = result.ast.body?.[0]?.arguments?.[1]?.range;
    assert.ok(Array.isArray(secondArgumentRange));

    const [start, end] = secondArgumentRange;
    assert.equal(source.slice(start, end), "20");
    assert.equal(result.parserServices.gml.recovery[0]?.originalOffset, 21);
});

void test("parser services contract always shapes canonical path, directives, enums, and recovery", () => {
    const result = parseWithOptions("var x = 1;", "limited");
    assert.equal(result.ok, true);

    if (!result.ok) {
        assert.fail("Expected parse success.");
    }

    assert.equal(typeof result.parserServices.gml.filePath, "string");
    assert.ok(result.parserServices.gml.filePath.endsWith("test.gml"));
    assert.deepEqual(result.parserServices.gml.directives, []);
    assert.deepEqual(result.parserServices.gml.enums, []);
    assert.deepEqual(result.parserServices.gml.recovery, []);
});

void test("utf-16 range projection stays aligned after limited recovery", () => {
    const source = 'show_debug_message("😀" 2);';
    const result = parseWithOptions(source, "limited");
    assert.equal(result.ok, true);

    if (!result.ok) {
        assert.fail("Expected parse success.");
    }

    const firstArgumentRange = result.ast.body?.[0]?.arguments?.[0]?.range;
    assert.deepEqual(firstArgumentRange, [19, 23]);
    assert.equal(source.slice(19, 23), '"😀"');

    const secondArgumentRange = result.ast.body?.[0]?.arguments?.[1]?.range;
    assert.deepEqual(secondArgumentRange, [24, 25]);
    assert.equal(source.slice(24, 25), "2");
});

void test("tokenization source remains original source under limited recovery", () => {
    const source = "show_debug_message(1 2); // tail";
    const result = parseWithOptions(source, "limited");
    assert.equal(result.ok, true);

    if (!result.ok) {
        assert.fail("Expected parse success.");
    }

    for (const token of result.ast.tokens ?? []) {
        if (!Array.isArray(token.range)) {
            continue;
        }

        const [start, end] = token.range;
        assert.ok(start >= 0);
        assert.ok(end <= source.length);
        assert.ok(start <= end);
    }

    for (const comment of result.ast.comments ?? []) {
        if (!Array.isArray(comment.range)) {
            continue;
        }

        const [start, end] = comment.range;
        assert.equal(source.slice(start, end).startsWith("//"), true);
    }
});

void test("parserServices.gml.filePath normalization preserves absolute roots and trims non-root trailing separators", () => {
    const absoluteTargetDirectory = path.resolve(process.cwd(), "contracts");
    const withTrailingSeparator = `${absoluteTargetDirectory}${path.sep}`;
    const normalizedResult = parseWithOptions("var x = 1;", "limited", withTrailingSeparator);

    assert.equal(normalizedResult.ok, true);
    if (!normalizedResult.ok) {
        assert.fail("Expected parse success for trailing separator normalization.");
    }

    assert.equal(path.isAbsolute(normalizedResult.parserServices.gml.filePath), true);
    assert.equal(normalizedResult.parserServices.gml.filePath.endsWith(path.sep), false);

    const rootResult = parseWithOptions("var y = 2;", "limited", path.parse(process.cwd()).root);
    assert.equal(rootResult.ok, true);
    if (!rootResult.ok) {
        assert.fail("Expected parse success for filesystem-root normalization.");
    }

    assert.equal(rootResult.parserServices.gml.filePath, path.parse(process.cwd()).root);
});

void test("directive define-name range invariants remain substring-stable when directive metadata is present", () => {
    const source = "#define FEATURE_FLAG 1\nvar x = FEATURE_FLAG;";
    const result = parseWithOptions(source, "limited");
    assert.equal(result.ok, true);

    if (!result.ok) {
        assert.fail("Expected parse success for directive invariants.");
    }

    for (const directive of result.parserServices.gml.directives) {
        const defineNameRange = directive.defineNameRange;
        const defineName = directive.defineName;

        if (!Array.isArray(defineNameRange)) {
            continue;
        }

        const [start, end] = defineNameRange;
        assert.equal(typeof defineName, "string");
        assert.equal(source.slice(start, end), defineName);
    }
});
