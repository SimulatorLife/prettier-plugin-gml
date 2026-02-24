import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "@gml-modules/lint";

import {
    applyFixOperations,
    createLocResolver,
    type InsertTextAfterRangeFixOperation,
    type ReplaceTextRangeFixOperation,
    type RuleTestFixOperation
} from "./rule-test-harness.js";

const { Lint } = LintWorkspace;

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureRootCandidates = [
    path.resolve(testDirectory, "fixtures"),
    path.resolve(testDirectory, "../../test/fixtures")
];
const fixtureRoot = fixtureRootCandidates.find((candidate) => existsSync(candidate));
if (!fixtureRoot) {
    throw new Error(`Unable to resolve lint fixture root from candidates: ${fixtureRootCandidates.join(", ")}`);
}
const allCapabilities = new Set([
    "IDENTIFIER_OCCUPANCY",
    "IDENTIFIER_OCCURRENCES",
    "LOOP_HOIST_NAME_RESOLUTION",
    "RENAME_CONFLICT_PLANNING"
]);

function resolveLoopHoistIdentifierForTests(
    preferredName: string,
    localIdentifierNames: ReadonlySet<string>
): string | null {
    if (preferredName.length === 0) {
        return null;
    }

    if (!localIdentifierNames.has(preferredName)) {
        return preferredName;
    }

    for (let suffix = 1; suffix <= 1000; suffix += 1) {
        const candidate = `${preferredName}_${suffix}`;
        if (!localIdentifierNames.has(candidate)) {
            return candidate;
        }
    }

    return null;
}

function parseProgramNode(code: string): Record<string, unknown> {
    const language = Lint.plugin.languages.gml as {
        parse: (
            file: { body: string; path: string; physicalPath: string; bom: boolean },
            context: { languageOptions: { recovery: "none" | "limited" } }
        ) => { ok: true; ast: Record<string, unknown> } | { ok: false };
    };

    const parseResult = language.parse(
        {
            body: code,
            path: "test.gml",
            physicalPath: "test.gml",
            bom: false
        },
        {
            languageOptions: { recovery: "limited" }
        }
    );

    if (parseResult.ok) {
        return parseResult.ast;
    }

    return { type: "Program", body: [] };
}

function lintWithRule(ruleName: string, code: string, options?: Record<string, unknown>) {
    const rule = Lint.plugin.rules[ruleName];
    const messages: Array<{
        messageId: string;
        loc?: { line: number; column: number };
        fix?: Array<RuleTestFixOperation>;
    }> = [];
    const getLocFromIndex = createLocResolver(code);

    const context = {
        options: [options ?? {}],
        settings: {
            gml: {
                project: {
                    getContext: () => ({
                        capabilities: allCapabilities,
                        isIdentifierNameOccupiedInProject: () => false,
                        listIdentifierOccurrenceFiles: () => new Set<string>(),
                        planFeatherRenames: (
                            requests: ReadonlyArray<{ identifierName: string; preferredReplacementName: string }>
                        ) =>
                            requests.map((request) => ({
                                identifierName: request.identifierName,
                                preferredReplacementName: request.preferredReplacementName,
                                safe: true,
                                reason: null
                            })),
                        assessGlobalVarRewrite: () => ({ allowRewrite: true, reason: null }),
                        resolveLoopHoistIdentifier: resolveLoopHoistIdentifierForTests
                    })
                }
            }
        },
        sourceCode: {
            text: code,
            parserServices: {
                gml: {
                    filePath: "test.gml"
                }
            },
            getLocFromIndex
        },
        report(payload: {
            messageId: string;
            loc?: { line: number; column: number };
            fix?: (fixer: {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation;
                insertTextAfterRange(range: [number, number], text: string): InsertTextAfterRangeFixOperation;
            }) => RuleTestFixOperation | Array<RuleTestFixOperation> | null;
        }) {
            const fixer = {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation {
                    return { kind: "replace", range, text };
                },
                insertTextAfterRange(range: [number, number], text: string): InsertTextAfterRangeFixOperation {
                    return { kind: "insert-after", range, text };
                }
            };

            let fixes: Array<RuleTestFixOperation> | undefined;
            if (payload.fix) {
                const output = payload.fix(fixer);
                fixes = output ? (Array.isArray(output) ? output : [output]) : undefined;
            }

            messages.push({ messageId: payload.messageId, loc: payload.loc, fix: fixes });
        }
    } as never;

    const listeners = rule.create(context);
    listeners.Program?.(parseProgramNode(code) as never);

    return {
        messages,
        output: applyFixOperations(
            code,
            messages
                .flatMap((message) => message.fix ?? [])
                .filter((fix) => fix.kind === "replace" || fix.kind === "insert-after")
        )
    };
}

async function readFixture(...segments: Array<string>): Promise<string> {
    return readFile(path.join(fixtureRoot, ...segments), "utf8");
}

type FixturePair = Readonly<{
    ruleName: string;
    inputFilePath: string;
    fixedFilePath: string;
    relativeInputPath: string;
    options: Record<string, unknown>;
}>;

function normalizeFixtureRelativePath(absolutePath: string): string {
    return path.relative(fixtureRoot, absolutePath).split(path.sep).join("/");
}

function deriveFixedFixturePath(inputFilePath: string): string | null {
    const inputFileName = path.basename(inputFilePath);
    if (inputFileName === "input.gml") {
        return path.join(path.dirname(inputFilePath), "fixed.gml");
    }

    const suffix = ".input.gml";
    if (!inputFileName.endsWith(suffix)) {
        return null;
    }

    const stem = inputFileName.slice(0, -suffix.length);
    return path.join(path.dirname(inputFilePath), `${stem}.fixed.gml`);
}

function deriveRuleNameFromFixturePath(inputFilePath: string): string {
    const relativeDirectoryPath = path.relative(fixtureRoot, path.dirname(inputFilePath));
    const relativeSegments = relativeDirectoryPath.split(path.sep).filter((segment) => segment.length > 0);
    if (relativeSegments.length === 0) {
        throw new Error(`Unable to derive rule name from fixture path: ${inputFilePath}`);
    }

    const [firstSegment, secondSegment] = relativeSegments;
    if (firstSegment === "feather") {
        const maybeFeatherRuleName = secondSegment ?? "";
        const featherRuleMatch = /^gm\d{4}/u.exec(maybeFeatherRuleName);
        if (!featherRuleMatch) {
            throw new Error(`Unable to derive feather rule name from fixture path: ${inputFilePath}`);
        }
        return featherRuleMatch[0];
    }

    return firstSegment;
}

async function collectFixtureFilesRecursively(directoryPath: string): Promise<Array<string>> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    const files: Array<string> = [];
    for (const entry of entries) {
        const entryPath = path.join(directoryPath, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectFixtureFilesRecursively(entryPath)));
            continue;
        }

        if (entry.isFile()) {
            files.push(entryPath);
        }
    }
    return files;
}

async function readFixtureOptions(fixtureDirectoryPath: string): Promise<Record<string, unknown>> {
    const optionsPath = path.join(fixtureDirectoryPath, "options.json");
    if (!existsSync(optionsPath)) {
        return {};
    }

    const optionsJson = await readFile(optionsPath, "utf8");
    const parsed = JSON.parse(optionsJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TypeError(`Fixture options must be an object: ${normalizeFixtureRelativePath(optionsPath)}`);
    }

    return parsed as Record<string, unknown>;
}

async function collectFixturePairs(): Promise<Array<FixturePair>> {
    const allFixtureFiles = await collectFixtureFilesRecursively(fixtureRoot);
    const inputFixturePaths = allFixtureFiles.filter((filePath) => {
        const relativePath = normalizeFixtureRelativePath(filePath);
        if (relativePath.startsWith("feather/")) {
            return false;
        }

        const fileName = path.basename(filePath);
        return fileName === "input.gml" || fileName.endsWith(".input.gml");
    });

    const pairs: Array<FixturePair> = [];
    for (const inputFilePath of inputFixturePaths) {
        const fixedFilePath = deriveFixedFixturePath(inputFilePath);
        if (!fixedFilePath || !existsSync(fixedFilePath)) {
            continue;
        }

        const ruleName = deriveRuleNameFromFixturePath(inputFilePath);
        const options = await readFixtureOptions(path.dirname(inputFilePath));
        const relativeInputPath = normalizeFixtureRelativePath(inputFilePath);
        if (relativeInputPath === "normalize-doc-comments/input.gml") {
            // Legacy fixture expects deprecated synthetic `@returns {undefined}` behavior.
            // Canonical normalize-doc-comments behavior is verified by targeted unit tests below.
            continue;
        }

        pairs.push({
            ruleName,
            inputFilePath,
            fixedFilePath,
            relativeInputPath,
            options
        });
    }

    return pairs.toSorted((left, right) => left.relativeInputPath.localeCompare(right.relativeInputPath));
}

void test("all discovered fixture input/fixed pairs apply expected lint fixes", async () => {
    const fixturePairs = await collectFixturePairs();
    assert.equal(fixturePairs.length > 0, true, "Expected at least one fixture input/fixed pair.");

    for (const fixturePair of fixturePairs) {
        const input = await readFile(fixturePair.inputFilePath, "utf8");
        const expected = await readFile(fixturePair.fixedFilePath, "utf8");
        const result = lintWithRule(fixturePair.ruleName, input, fixturePair.options);

        assert.equal(
            result.output,
            expected,
            `${fixturePair.ruleName} should produce expected output for ${fixturePair.relativeInputPath}`
        );
    }
});

void test("prefer-struct-literal-assignments ignores non-identifier struct bases", async () => {
    const input = await readFixture("prefer-struct-literal-assignments", "non-identifier-base.gml");
    const result = lintWithRule("prefer-struct-literal-assignments", input);
    assert.equal(result.messages.length, 0);
});

void test("prefer-struct-literal-assignments ignores duplicate property update clusters", () => {
    const input = [
        "function collide(other) {",
        "    other.pos = other.pos.Add(step);",
        "    other.pos = other.pos.Add(step2);",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-struct-literal-assignments", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("prefer-struct-literal-assignments never collapses built-in global property writes", () => {
    const input = ["global.AsyncLoaderQueue = ds_queue_create();", "global.AsyncLoaderHandle = -1;", ""].join("\n");
    const result = lintWithRule("prefer-struct-literal-assignments", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("prefer-struct-literal-assignments reports the first matching assignment location", () => {
    const input = [
        "#macro STILE_PLATFORM_HEIGHT 120",
        "",
        "function demo() {",
        "    settings.speed = 10;",
        '    settings.mode = "arcade";',
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-struct-literal-assignments", input);
    assert.equal(result.messages.length, 1);
    assert.deepEqual(result.messages[0]?.loc, { line: 4, column: 4 });
});

void test("normalize-doc-comments removes placeholder description equal to function name", () => {
    const input = [
        "/// @description __ChatterboxClassSource",
        "/// @param filename",
        "/// @param buffer",
        "/// @param compile",
        "/// @returns {undefined}",
        "function __ChatterboxClassSource(_filename, _buffer, _compile) constructor { /* ... */ }",
        ""
    ].join("\n");
    const expected = [
        "/// @param filename",
        "/// @param buffer",
        "/// @param compile",
        "/// @returns {undefined}",
        "function __ChatterboxClassSource(_filename, _buffer, _compile) constructor { /* ... */ }",
        ""
    ].join("\n");

    const result = lintWithRule("normalize-doc-comments", input, {});
    assert.equal(result.output, expected);
});

void test("normalize-doc-comments aligns multiline description continuations", () => {
    const input = ["/// Alpha summary", "/// Beta continuation", "function demo() {", "    return 1;", "}", ""].join(
        "\n"
    );
    const expected = [
        "/// @description Alpha summary",
        "///              Beta continuation",
        "function demo() {",
        "    return 1;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("normalize-doc-comments", input, {});
    assert.equal(result.output, expected);
});

void test("normalize-doc-comments converts legacy returns description text to @returns metadata", () => {
    const input = [
        "/// Summary",
        "/// Returns: Boolean, indicating if check passed",
        "function demo() {",
        "    return true;",
        "}",
        ""
    ].join("\n");
    const expected = [
        "/// @description Summary",
        "/// @returns {Boolean} Indicating if check passed",
        "function demo() {",
        "    return true;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("normalize-doc-comments", input, {});
    assert.equal(result.output, expected);
});

void test("normalize-doc-comments only synthesizes @returns {undefined} for functions without concrete return values", () => {
    const input = [
        "function no_return() {",
        "    var x = 1;",
        "}",
        "",
        "function returns_value() {",
        "    return 123;",
        "}",
        "",
        "function returns_undefined_only() {",
        "    if (keyboard_check(vk_space)) {",
        "        return undefined;",
        "    }",
        "    return;",
        "}",
        ""
    ].join("\n");
    const expected = [
        "/// @returns {undefined}",
        "function no_return() {",
        "    var x = 1;",
        "}",
        "",
        "function returns_value() {",
        "    return 123;",
        "}",
        "",
        "/// @returns {undefined}",
        "function returns_undefined_only() {",
        "    if (keyboard_check(vk_space)) {",
        "        return undefined;",
        "    }",
        "    return;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("normalize-doc-comments", input, {});
    assert.equal(result.output, expected);
});

void test("normalize-directives preserves spacing and semicolons on canonical #macro lines", () => {
    const input = [
        "#macro __SCRIBBLE_PARSER_INSERT_NUKTA  ds_grid_set_grid_region(_temp_grid, _glyph_grid, _i+1, 0, _glyph_count+3, __SCRIBBLE_GEN_GLYPH.__SIZE, 0, 0);",
        "#macro KEEP_MACRO_SEMICOLON value;",
        ""
    ].join("\n");

    const result = lintWithRule("normalize-directives", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("gml semantic fix rules do not reformat canonical macro declaration spacing", () => {
    const input =
        "#macro __SCRIBBLE_PARSER_INSERT_NUKTA  ds_grid_set_grid_region(_temp_grid, _glyph_grid, _i+1, 0, _glyph_count+3, __SCRIBBLE_GEN_GLYPH.__SIZE, 0, 0);\n";
    const semanticFixRuleNames = [
        "prefer-loop-length-hoist",
        "prefer-repeat-loops",
        "prefer-struct-literal-assignments",
        "optimize-logical-flow",
        "no-globalvar",
        "normalize-doc-comments",
        "normalize-directives",
        "require-control-flow-braces",
        "no-assignment-in-condition",
        "prefer-is-undefined-check",
        "prefer-epsilon-comparisons",
        "normalize-operator-aliases",
        "prefer-string-interpolation",
        "optimize-math-expressions",
        "require-argument-separators",
        "normalize-data-structure-accessors",
        "require-trailing-optional-defaults"
    ] as const;

    for (const ruleName of semanticFixRuleNames) {
        const result = lintWithRule(ruleName, input, {});
        assert.equal(result.output, input, `${ruleName} should not apply formatter-owned macro spacing changes`);
    }
});

void test("require-argument-separators preserves separator payload comments", async () => {
    const input = await readFixture("require-argument-separators", "separator-payload.gml");
    const result = lintWithRule("require-argument-separators", input, {});
    assert.equal(result.output, "show_debug_message_ext(name, /* keep */ payload);\n");
});

void test("require-trailing-optional-defaults lifts leading argument_count ternary fallbacks into params", () => {
    const input = [
        "function greet() {",
        '    var name = argument_count > 0 ? argument[0] : "friend";',
        '    var greeting = argument_count > 1 ? argument[1] : "Hello";',
        '    return $"{greeting}, {name}";',
        "}",
        ""
    ].join("\n");
    const expected = [
        'function greet(name = "friend", greeting = "Hello") {',
        '    return $"{greeting}, {name}";',
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-trailing-optional-defaults", input, {});
    assert.equal(result.output, expected);
});

void test("require-trailing-optional-defaults condenses var+if argument_count fallback and adds trailing params", () => {
    const input = [
        "function spring(a, b, dst, force) {",
        "    var push_out = true;",
        "    if (argument_count > 4) {",
        "        push_out = argument[4];",
        "    }",
        "    return push_out;",
        "}",
        "",
        "my_func4(undefined, undefined);",
        ""
    ].join("\n");
    const expected = [
        "function spring(a, b, dst, force, push_out = true) {",
        "    return push_out;",
        "}",
        "",
        "my_func4(undefined);",
        ""
    ].join("\n");

    const result = lintWithRule("require-trailing-optional-defaults", input, {});
    assert.equal(result.output, expected);
});

void test("reportUnsafe=false suppresses unsafe-only diagnostics", () => {
    const input = 'message = "HP: " + string(_i++);\n';
    const result = lintWithRule("prefer-string-interpolation", input, { reportUnsafe: false });
    assert.equal(result.messages.length, 0);
});

void test("prefer-string-interpolation rewrites string literal + string(variable) chains", () => {
    const input = [
        "for (var _i = vk_f1 + 12; _i < vk_f1 + 32; _i++) {",
        '    __input_key_name_set(_i, "f" + string(_i));',
        "}",
        ""
    ].join("\n");
    const expected = [
        "for (var _i = vk_f1 + 12; _i < vk_f1 + 32; _i++) {",
        '    __input_key_name_set(_i, $"f{_i}");',
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-string-interpolation", input, {});
    assert.equal(result.output, expected);
});

void test("prefer-string-interpolation rewrites string coercion calls with non-trivial expressions", () => {
    const input = 'message = "HP: " + string(random(99));\n';
    const expected = 'message = $"HP: {random(99)}";\n';
    const result = lintWithRule("prefer-string-interpolation", input, {});
    assert.equal(result.output, expected);
});

void test("prefer-is-undefined-check rewrites undefined comparisons in either operand position", () => {
    const input = [
        "if (score == undefined) return;",
        "if (undefined == lives) return;",
        "if (score != undefined) return;",
        "if (undefined != lives) return;",
        "if (!(score == undefined)) return;",
        "if (!(undefined == lives)) return;",
        ""
    ].join("\n");
    const expected = [
        "if (is_undefined(score)) return;",
        "if (is_undefined(lives)) return;",
        "if (!is_undefined(score)) return;",
        "if (!is_undefined(lives)) return;",
        "if (!is_undefined(score)) return;",
        "if (!is_undefined(lives)) return;",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-is-undefined-check", input, {});
    assert.equal(result.output, expected);
});

void test("prefer-is-undefined-check preserves grouped multiline conditions", () => {
    const input = [
        "if ((_index == undefined)",
        "||  (_index < 0)",
        "||  (_index >= array_length(_global.__gamepads)))",
        "{",
        "    return;",
        "}",
        ""
    ].join("\n");
    const expected = [
        "if (is_undefined(_index)",
        "||  (_index < 0)",
        "||  (_index >= array_length(_global.__gamepads)))",
        "{",
        "    return;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-is-undefined-check", input, {});
    assert.equal(result.output, expected);
});

void test("prefer-epsilon-comparisons rewrites direct zero checks for preceding math assignments", () => {
    const input = [
        "var actual_dist = sqr(xoff) + sqr(yoff);",
        "if (actual_dist == 0) {",
        "    return false;",
        "}",
        ""
    ].join("\n");
    const expected = [
        "var actual_dist = sqr(xoff) + sqr(yoff);",
        "var eps = math_get_epsilon();",
        "if (actual_dist <= eps) {",
        "    return false;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-epsilon-comparisons", input, {});
    assert.equal(result.output, expected);
});

void test("prefer-epsilon-comparisons does not rewrite non-math zero checks", () => {
    const input = ["var queue_size = array_length(queue);", "if (queue_size == 0) {", "    return;", "}", ""].join(
        "\n"
    );

    const result = lintWithRule("prefer-epsilon-comparisons", input, {});
    assert.equal(result.output, input);
});

void test("prefer-epsilon-comparisons reuses existing epsilon declarations in a block", () => {
    const input = [
        "var actual_dist = sqr(xoff) + sqr(yoff);",
        "var eps = math_get_epsilon();",
        "if (actual_dist == 0) {",
        "    return false;",
        "}",
        ""
    ].join("\n");
    const expected = [
        "var actual_dist = sqr(xoff) + sqr(yoff);",
        "var eps = math_get_epsilon();",
        "if (actual_dist <= eps) {",
        "    return false;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-epsilon-comparisons", input, {});
    assert.equal(result.output, expected);
});

void test("no-assignment-in-condition does not rewrite grouped multiline conditions without assignments", () => {
    const input = [
        "if ((_index == undefined)",
        "||  (_index < 0)",
        "||  (_index >= array_length(_global.__gamepads)))",
        "{",
        "    return;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("no-assignment-in-condition", input, {});
    assert.equal(result.output, input);
});

void test("no-globalvar rewrites declared globals and preserves non-matching identifiers", async () => {
    const input = await readFixture("no-globalvar", "rewrite-scope.gml");
    const result = lintWithRule("no-globalvar", input, {});
    assert.equal(result.output.includes("globalvarToken"), true);
    assert.equal(result.output.includes("globalvar score"), false);
    assert.equal(result.output.includes("global.globalvarToken"), false);
});

void test("no-globalvar rewrites comma-separated declarations and identifier uses", () => {
    const input = ["globalvar score, lives;", "score = 1;", "if (lives > 0) {", "    score += lives;", "}", ""].join(
        "\n"
    );
    const expected = [
        "global.score = 1;",
        "if (global.lives > 0) {",
        "    global.score += global.lives;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("no-globalvar", input, {});
    assert.equal(result.output, expected);
});

void test("prefer-loop-length-hoist respects null suffix override by disabling hoist generation", async () => {
    const input = await readFixture("prefer-loop-length-hoist", "input.gml");
    const result = lintWithRule("prefer-loop-length-hoist", input, {
        functionSuffixes: {
            array_length: null
        }
    });
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("prefer-repeat-loops skips conversion when loop iterator is used in body", () => {
    const input = ["for (var i = 0; i < array_length(items); i++) {", "    sum += i;", "}", ""].join("\n");
    const result = lintWithRule("prefer-repeat-loops", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("full-file rewrite rules report the first changed source location", () => {
    const locationCases = [
        {
            ruleName: "normalize-doc-comments",
            input: ["var keep = 1;", "// @description convert me", "function demo() {}", ""].join("\n"),
            expectedLoc: { line: 2, column: 2 }
        },
        {
            ruleName: "normalize-directives",
            input: ["var keep = 1;", "// #region Setup", ""].join("\n"),
            expectedLoc: { line: 2, column: 0 }
        },
        {
            ruleName: "require-control-flow-braces",
            input: ["var keep = 1;", "if (ready) step();", ""].join("\n"),
            expectedLoc: { line: 2, column: 11 }
        },
        {
            ruleName: "no-assignment-in-condition",
            input: ["var keep = 1;", "if (left = right) value = 1;", ""].join("\n"),
            expectedLoc: { line: 2, column: 10 }
        },
        {
            ruleName: "normalize-operator-aliases",
            input: ["var keep = 1;", "if (not right) {", "    keep = 2;", "}", ""].join("\n"),
            expectedLoc: { line: 2, column: 4 }
        }
    ] as const;

    for (const locationCase of locationCases) {
        const result = lintWithRule(locationCase.ruleName, locationCase.input, {});
        assert.equal(result.messages.length, 1, `${locationCase.ruleName} should report exactly one diagnostic`);
        assert.deepEqual(
            result.messages[0]?.loc,
            locationCase.expectedLoc,
            `${locationCase.ruleName} should report its first changed location`
        );
    }
});

void test("prefer-hoistable-loop-accessors reports the first matching accessor location", () => {
    const input = [
        "#macro STILE_PLATFORM_HEIGHT 120",
        "",
        "function demo(items) {",
        "    while (ready) {",
        "        var total = array_length(items);",
        "        total += array_length(items);",
        "    }",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-hoistable-loop-accessors", input);
    assert.equal(result.messages.length, 1);
    assert.deepEqual(result.messages[0]?.loc, { line: 5, column: 20 });
});

void test("prefer-hoistable-loop-accessors suppresses diagnostics for loops owned by prefer-loop-length-hoist", () => {
    const input = ["for (var i = 0; i < array_length(items); i++) {", "    sum += array_length(items);", "}", ""].join(
        "\n"
    );

    const result = lintWithRule("prefer-hoistable-loop-accessors", input, {});
    assert.equal(result.messages.length, 0);
});

void test("prefer-loop-length-hoist reports unsafeFix when insertion requires brace synthesis", () => {
    const input = [
        "if (ready)",
        "    for (var i = 0; i < array_length(items); i++) {",
        "        sum += 1;",
        "    }",
        ""
    ].join("\n");

    const result = lintWithRule("prefer-loop-length-hoist", input, {});
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0]?.messageId, "unsafeFix");
});

void test("require-control-flow-braces does not rewrite multiline condition continuations", () => {
    const input = [
        "if (p.DistanceTo(vertices[0][0].p) < self.vertLength * 1.5)",
        "|| (p.DistanceTo(vertices[1][0].p) < self.vertLength * 1.5)",
        "{",
        "    __addVert(vertices[0]);",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("require-control-flow-braces wraps inline statements with nested call parentheses safely", () => {
    const input = String.raw`if (_starting_font == undefined) __scribble_error("The default font has not been set\nCheck that you've added fonts to Scribble (scribble_font_add() / scribble_font_add_from_sprite() etc.)");
`;
    const expected = [
        "if (_starting_font == undefined) {",
        String.raw`    __scribble_error("The default font has not been set\nCheck that you've added fonts to Scribble (scribble_font_add() / scribble_font_add_from_sprite() etc.)");`,
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.output, expected);
});

void test("require-control-flow-braces rewrites legacy then inline if clauses", () => {
    const input = ["if my_var == your_var++ then their_var;", "if my_var == your_var THEN ++their_var;", ""].join("\n");
    const expected = [
        "if (my_var == your_var++) {",
        "    their_var;",
        "}",
        "if (my_var == your_var) {",
        "    ++their_var;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.output, expected);
});

void test("require-control-flow-braces wraps repeat statements with nested index expressions safely", () => {
    const input = 'repeat(_tag_parameter_count-1) _command_string += "," + string(_tag_parameters[_j++]);\n';
    const expected = [
        "repeat (_tag_parameter_count-1) {",
        '    _command_string += "," + string(_tag_parameters[_j++]);',
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.output, expected);
});

void test("optimize-math-expressions does not rewrite decimal literals that start with zero", () => {
    const input = "__fit_scale = _lower_limit + 0.5*(_upper_limit - _lower_limit);\n";
    const result = lintWithRule("optimize-math-expressions", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("optimize-math-expressions does not rewrite decimal literals with missing leading/trailing zeros", () => {
    // Adding leading/trailing zeros to these literals is strictly a formatting change, and owned exclusively by the formatter ('@gml-modules/format')
    // However, when a math-optimization condenses an expression containing two or more of these literals into a single literal, the resulting literal
    // is expected to be a normalized form that the formatter would produce, to avoid unnecessary churn from subsequent formatter rewrites
    const input = ["var a = .5;", "var b = 1. - .5;", "var c = 5.;", ""].join("\n");
    const expected = ["var a = .5;", "var b = 0.5;", "var c = 5.;", ""].join("\n");
    const result = lintWithRule("optimize-math-expressions", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, expected);
});

void test("optimize-math-expressions folds lengthdir_x half-subtraction pattern into a single initializer", () => {
    const input = ["var s = 1.3 * size * 0.12 / 1.5;", "s = s - s / 2 - lengthdir_x(s / 2, swim_rot);", ""].join("\n");
    const expected = ["var s = size * 0.052 * (1 - lengthdir_x(1, swim_rot));", ""].join("\n");

    const result = lintWithRule("optimize-math-expressions", input, {});
    assert.equal(result.output, expected);
});

void test("optimize-math-expressions keeps non-math expressions unchanged", () => {
    const input = "var config = settings ?? global.default_settings;\n";
    const result = lintWithRule("optimize-math-expressions", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("optimize-math-expressions rewrites reciprocal ratios and removes *= 1 statements", () => {
    const input = ["var s7 = ((hp / max_hp) * 100) / 10;", "var s37b = 1 * width;", "s37b *= 1;", ""].join("\n");
    const expected = ["var s7 = (hp / max_hp) * 10;", "var s37b = width;", ""].join("\n");

    const result = lintWithRule("optimize-math-expressions", input, {});
    assert.equal(result.output, expected);
});

void test("normalize-operator-aliases does not replace punctuation exclamation marks", () => {
    const input = ["#region Emergency!", "var ready_state = !ready;", ""].join("\n");
    const expected = ["#region Emergency!", "var ready_state = !ready;", ""].join("\n");
    const result = lintWithRule("normalize-operator-aliases", input, {});
    assert.equal(result.output, expected);
});

void test("normalize-operator-aliases replaces invalid logical keyword 'not' with '!'", () => {
    const input = ["if (not ready) {", "    value = not(extra);", "}", ""].join("\n");
    const expected = ["if (! ready) {", "    value = !(extra);", "}", ""].join("\n");
    const result = lintWithRule("normalize-operator-aliases", input, {});
    assert.equal(result.output, expected);
});

void test("normalize-operator-aliases does not rewrite identifier usage of 'not'", () => {
    const input = ["var not = 1;", "value = not + 2;", ""].join("\n");
    const result = lintWithRule("normalize-operator-aliases", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("require-control-flow-braces skips macro continuation blocks", () => {
    const input = [
        '#macro __SCRIBBLE_MARKDOWN_TOGGLE_BOLD  if (_new_style == "body")\\',
        "                                        {\\",
        '                                            _new_style = "bold";\\',
        "                                        }\\",
        "                                        if (_old_style != _new_style) _write_style = true;",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("require-control-flow-braces does not reinterpret already braced headers with trailing comments", () => {
    const input = [
        "if (point_in_triangle(D.x, D.y, A.x, A.y, B.x, B.y, C.x, C.y)) { // stile_point_in_triangle(x3, y3, z3, x0, y0, z0, x1, y1, z1, x2, y2, z2, N)",
        '    // show_debug_message("Verts inside");',
        "    good = false;",
        "    break;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("require-control-flow-braces", input, {});
    assert.equal(result.messages.length, 0);
    assert.equal(result.output, input);
});

void test("optimize-logical-flow removes double negation without collapsing if/return patterns", () => {
    const input = [
        "function bool_passthrough(condition) {",
        "    if (!!condition) {",
        "        return true;",
        "    }",
        "",
        "    return false;",
        "}",
        ""
    ].join("\n");

    const expected = [
        "function bool_passthrough(condition) {",
        "    if (condition) {",
        "        return true;",
        "    }",
        "",
        "    return false;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("optimize-logical-flow", input, {});
    assert.equal(result.messages.length, 1, "optimize-logical-flow should report one diagnostic");
    assert.equal(
        result.output,
        expected,
        "optimize-logical-flow should remove !! but not collapse the if/return pattern"
    );
});
