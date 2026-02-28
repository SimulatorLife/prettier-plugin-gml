import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { promisify } from "node:util";

import * as LintWorkspace from "@gml-modules/lint";
import { ESLint, type Linter } from "eslint";

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
            directives: Array<string>;
            enums: Array<string>;
        };
    };
};

type ParseFailure = {
    ok: false;
    errors: ReadonlyArray<{ message: string; line: number; column: number }>;
};

const execFileAsync = promisify(execFile);

function parseWithOptions(sourceText: string, recovery: "none" | "limited"): ParseSuccess | ParseFailure {
    const language = Lint.plugin.languages.gml as {
        parse: (
            file: { body: string; path: string },
            context: { languageOptions: { recovery: "none" | "limited" } }
        ) => ParseSuccess | ParseFailure;
    };

    return language.parse(
        {
            body: sourceText,
            path: "./test.gml"
        },
        {
            languageOptions: { recovery }
        }
    );
}

function collectTypedNodesMissingLocationMetadata(root: unknown): Array<string> {
    const missingTypes: Array<string> = [];
    const seen = new Set<object>();
    const pending: Array<unknown> = [root];

    while (pending.length > 0) {
        const current = pending.pop();
        if (!current || typeof current !== "object") {
            continue;
        }

        if (seen.has(current)) {
            continue;
        }
        seen.add(current);

        if (Array.isArray(current)) {
            for (const entry of current) {
                pending.push(entry);
            }
            continue;
        }

        const record = current as Record<string, unknown>;
        if (typeof record.type === "string") {
            const hasLoc =
                record.loc &&
                typeof record.loc === "object" &&
                (record.loc as { start?: { line?: unknown } }).start &&
                typeof (record.loc as { start: { line?: unknown } }).start.line === "number";
            const hasRange =
                Array.isArray(record.range) &&
                record.range.length === 2 &&
                typeof record.range[0] === "number" &&
                typeof record.range[1] === "number";
            if (!hasLoc || !hasRange) {
                missingTypes.push(record.type);
            }
        }

        for (const value of Object.values(record)) {
            pending.push(value);
        }
    }

    return missingTypes;
}

async function lintTextWithESLintVersion(ESLintImplementation: typeof ESLint, sourceText: string) {
    return lintTextWithConfiguredRules(
        ESLintImplementation,
        sourceText,
        {
            "gml/no-globalvar": "off"
        },
        false
    );
}

async function lintTextWithConfiguredRules(
    ESLintImplementation: typeof ESLint,
    sourceText: string,
    rules: Linter.RulesRecord,
    fix: boolean
) {
    const eslint = new ESLintImplementation({
        overrideConfigFile: true,
        fix,
        overrideConfig: [
            {
                files: ["**/*.gml"],
                plugins: {
                    gml: Lint.plugin
                },
                language: "gml/gml",
                rules
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

    const probeCwdCandidates = [
        new URL("../", import.meta.url),
        new URL("../../", import.meta.url),
        new URL("../../../", import.meta.url)
    ];
    const probeCwd = probeCwdCandidates.find((candidate) => {
        try {
            const pluginPath = new URL("src/plugin.js", candidate);
            return existsSync(pluginPath);
        } catch {
            return false;
        }
    });
    if (!probeCwd) {
        throw new Error("Unable to resolve compatibility probe cwd");
    }

    await execFileAsync("node", ["--input-type=module", "-e", languageProbe], {
        cwd: probeCwd
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

void test("language parse projects loc/range metadata for try/catch branches", () => {
    const source = [
        "function test_projection() {",
        "    try {",
        "        values = [1, 2, 3];",
        "    } catch (error) {",
        "        values = [0, 0, 0];",
        "    }",
        "    return values[0];",
        "}",
        ""
    ].join("\n");
    const parseResult = parseWithOptions(source, "limited");
    assert.equal(parseResult.ok, true);

    if (!parseResult.ok) {
        return;
    }

    const missingTypes = collectTypedNodesMissingLocationMetadata(parseResult.ast);
    assert.deepEqual(missingTypes, []);
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

void test("switch cases expose estree consequent arrays for ESLint code-path analysis", async () => {
    const source = [
        "switch (state) {",
        "    case 0:",
        "        value = 1;",
        "        break;",
        "    default:",
        "        break;",
        "}"
    ].join("\n");
    const result = await lintTextWithESLintVersion(ESLint, source);

    assert.equal(result.fatalErrorCount, 0);
    assert.equal(
        result.messages.some((message) => message.fatal),
        false
    );

    const parseResult = parseWithOptions(source, "limited");
    assert.equal(parseResult.ok, true);
    if (!parseResult.ok) {
        return;
    }

    const firstStatement = parseResult.ast.body?.[0] as { cases?: Array<{ consequent?: unknown[]; body?: unknown[] }> };
    const firstCase = firstStatement.cases?.[0];

    assert.ok(Array.isArray(firstCase?.consequent));
    assert.ok(Array.isArray(firstCase?.body));
});

void test("switch blocks ignore non-case directives in cases array for ESLint compatibility", async () => {
    const source = [
        "switch (state) {",
        "    #region parser-state",
        "    case 0:",
        "        value = 1;",
        "        break;",
        "}"
    ].join("\n");

    const result = await lintTextWithESLintVersion(ESLint, source);
    assert.equal(result.fatalErrorCount, 0);

    const parseResult = parseWithOptions(source, "limited");
    assert.equal(parseResult.ok, true);
    if (!parseResult.ok) {
        return;
    }

    const firstStatement = parseResult.ast.body?.[0] as { cases?: Array<{ type?: string }> };
    const caseTypes = (firstStatement.cases ?? []).map((entry) => entry.type);
    assert.deepEqual(caseTypes, ["SwitchCase"]);
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

void test("limited recovery inserts exactly one separator across block-comment payload gaps", () => {
    const source = "show_debug_message_ext(name /* keep */ payload);\n";

    const strictResult = parseWithOptions(source, "none");
    assert.equal(strictResult.ok, false);

    const limitedResult = parseWithOptions(source, "limited");
    assert.equal(limitedResult.ok, true);

    if (!limitedResult.ok) {
        assert.fail("Expected limited recovery parse success.");
    }

    assert.equal(limitedResult.parserServices.gml.recovery.length, 1);
    assert.equal(limitedResult.parserServices.gml.recovery[0]?.originalOffset, source.indexOf(" /* keep */"));
});

void test("require-argument-separators ignores macros, declarations, comments, and strings", async () => {
    const source = [
        "#macro STILE_PLATFORM_HEIGHT 120",
        "function scribble_rgb_to_bgr(_rgb) {",
        "    // (the industry standard)",
        '    var label = "Colour values should be in the format (RGB)."',
        "    return _rgb;",
        "}",
        "function scribble_color_set(_name, _colour) {",
        "    show_debug_message(_name);",
        "}"
    ].join("\n");

    const result = await lintTextWithConfiguredRules(
        ESLint,
        source,
        {
            "gml/no-globalvar": "off",
            "gml/require-argument-separators": "error"
        },
        false
    );

    assert.equal(result.fatalErrorCount, 0);
    assert.equal(result.errorCount, 0);
});

void test("require-argument-separators reports precise location and fixes comment payload gaps", async () => {
    const source = "show_debug_message_ext(name /* keep */ payload);\n";
    const expectedColumn = source.indexOf(" /* keep */") + 1;

    const diagnosticResult = await lintTextWithConfiguredRules(
        ESLint,
        source,
        {
            "gml/no-globalvar": "off",
            "gml/require-argument-separators": "error"
        },
        false
    );

    assert.equal(diagnosticResult.fatalErrorCount, 0);
    assert.equal(diagnosticResult.messages.length, 1);
    assert.equal(diagnosticResult.messages[0]?.line, 1);
    assert.equal(diagnosticResult.messages[0]?.column, expectedColumn);

    const fixedResult = await lintTextWithConfiguredRules(
        ESLint,
        source,
        {
            "gml/no-globalvar": "off",
            "gml/require-argument-separators": "error"
        },
        true
    );
    assert.equal(fixedResult.output, "show_debug_message_ext(name, /* keep */ payload);\n");
});

void test("optimize-math-expressions fix pipeline converges without parenthesis oscillation", async () => {
    const source = [
        "if (global.disableDraw) {",
        "    exit;",
        "}",
        "var angle = (((current_time / 300) + x) + y) + z;",
        "var x1 = x - ((radius / 10) * cos(angle));",
        "var y1 = y - ((radius / 10) * sin(angle));",
        "var z1 = z;",
        "var x2 = x + ((radius / 10) * cos(angle));",
        "var y2 = y + ((radius / 10) * sin(angle));",
        "var z2 = z;",
        "cm_debug_draw(cm_cylinder(x1, y1, z1, x2, y2, z2, radius), -1, c_yellow);",
        ""
    ].join("\n");
    const rules: Linter.RulesRecord = {
        "gml/no-globalvar": "off",
        "gml/optimize-math-expressions": "warn"
    };

    const firstPass = await lintTextWithConfiguredRules(ESLint, source, rules, true);
    const stabilizedOutput = typeof firstPass.output === "string" ? firstPass.output : source;
    const secondPass = await lintTextWithConfiguredRules(ESLint, stabilizedOutput, rules, false);

    assert.equal(secondPass.fatalErrorCount, 0);
    assert.equal(secondPass.messages.length, 0);
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
