import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "@gml-modules/lint";

import { applyFixOperations, createLocResolver, type ReplaceTextRangeFixOperation } from "./rule-test-harness.js";

type MigrationCase = {
    fixtureName: string;
    ruleName: string;
    assertOutput: (output: string) => void;
};

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const migratedFeatherFixtureCandidates = [
    path.resolve(testDirectory, "fixtures/feather/plugin-migrated"),
    path.resolve(testDirectory, "../../test/fixtures/feather/plugin-migrated")
];
const migratedFeatherFixtureDirectory = migratedFeatherFixtureCandidates.find((candidate) => existsSync(candidate));
if (!migratedFeatherFixtureDirectory) {
    throw new Error(
        `Unable to resolve migrated feather fixture directory from candidates: ${migratedFeatherFixtureCandidates.join(
            ", "
        )}`
    );
}

function lintWithFeatherRule(
    ruleName: string,
    code: string
): { messages: Array<{ messageId: string }>; output: string } {
    const rule = LintWorkspace.Lint.plugin.rules[ruleName];
    const messages: Array<{ messageId: string; fix?: ReplaceTextRangeFixOperation }> = [];
    const getLocFromIndex = createLocResolver(code);

    const context = {
        options: [{}],
        sourceCode: {
            text: code,
            getLocFromIndex
        },
        report(payload: {
            messageId: string;
            fix?: (fixer: {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation;
            }) => ReplaceTextRangeFixOperation | null;
        }) {
            const fixer = {
                replaceTextRange(range: [number, number], text: string): ReplaceTextRangeFixOperation {
                    return { kind: "replace", range, text };
                }
            };
            messages.push({
                messageId: payload.messageId,
                fix: payload.fix ? (payload.fix(fixer) ?? undefined) : undefined
            });
        }
    } as never;

    const listeners = rule.create(context);
    listeners.Program?.({ type: "Program" } as never);

    const output = applyFixOperations(
        code,
        messages.map((message) => message.fix).filter((fix): fix is ReplaceTextRangeFixOperation => fix !== undefined)
    );

    return {
        messages: messages.map((message) => ({ messageId: message.messageId })),
        output
    };
}

async function readMigratedFeatherFixture(fixtureName: string): Promise<string> {
    const inputPath = path.join(migratedFeatherFixtureDirectory, `${fixtureName}.input.gml`);
    return readFile(inputPath, "utf8");
}

function countOccurrences(text: string, needle: string): number {
    return text.split(needle).length - 1;
}

const migrationCases: ReadonlyArray<MigrationCase> = Object.freeze([
    {
        fixtureName: "testGM1000",
        ruleName: "gm1000",
        assertOutput: (output) => {
            assert.equal(output.includes("break;"), false);
            assert.equal(output.includes("value = 42;"), true);
        }
    },
    {
        fixtureName: "testGM1002",
        ruleName: "gm1002",
        assertOutput: (output) => {
            assert.equal(output.includes("global.gameManager"), false);
            assert.equal(output.includes("gameManager = new GameManager("), true);
        }
    },
    {
        fixtureName: "testGM1007",
        ruleName: "gm1007",
        assertOutput: (output) => {
            assert.equal(output.includes("new Point(0, 0) ="), false);
            assert.equal(output.includes("1 = new Point"), false);
        }
    },
    {
        fixtureName: "testGM1008",
        ruleName: "gm1008",
        assertOutput: (output) => {
            assert.equal(/\bworking_directory\b/.test(output), false);
            assert.equal(output.includes("__feather_working_directory"), true);
        }
    },
    {
        fixtureName: "testGM1009",
        ruleName: "gm1009",
        assertOutput: (output) => {
            assert.equal(output.includes("fa_readonly | fa_archive"), true);
            assert.equal(output.includes("room_goto_next()"), true);
        }
    },
    {
        fixtureName: "testGM1010",
        ruleName: "gm1010",
        assertOutput: (output) => {
            assert.equal(output.includes("result = 5 + 5;"), true);
            assert.equal(output.includes("real(numFive)"), true);
        }
    },
    {
        fixtureName: "testGM1015",
        ruleName: "gm1015",
        assertOutput: (output) => {
            assert.equal(output.includes("/= 0"), false);
            assert.equal(output.includes("%= -1"), true);
        }
    },
    {
        fixtureName: "testGM1024",
        ruleName: "gm1024",
        assertOutput: (output) => {
            assert.equal(output.includes("__featherFix_score"), true);
            assert.equal(/\bscore\b\s*=/.test(output), false);
        }
    },
    {
        fixtureName: "testGM1026",
        ruleName: "gm1026",
        assertOutput: (output) => {
            assert.equal(output.includes("var __featherFix_pi = pi;"), true);
            assert.equal(output.includes("__featherFix_pi++;"), true);
        }
    },
    {
        fixtureName: "testGM1028",
        ruleName: "gm1028",
        assertOutput: (output) => {
            assert.equal(output.includes("[?"), false);
            assert.equal(output.includes("[|"), true);
        }
    },
    {
        fixtureName: "testGM1029",
        ruleName: "gm1029",
        assertOutput: (output) => {
            assert.equal(output.includes('"1234"'), false);
            assert.equal(output.includes("draw_sprite(sprite_index, image_index, 1234, 5678);"), true);
        }
    },
    {
        fixtureName: "testGM1030",
        ruleName: "gm1030",
        assertOutput: (output) => {
            assert.equal(output.includes("__featherFix_sprite_index"), true);
            assert.equal(/\bsprite_index\b/.test(output), false);
        }
    },
    {
        fixtureName: "testGM1033",
        ruleName: "gm1033",
        assertOutput: (output) => {
            assert.equal(output.includes(";;"), false);
            assert.equal(output.includes("var value = 1;"), true);
        }
    },
    {
        fixtureName: "testGM1038",
        ruleName: "gm1038",
        assertOutput: (output) => {
            assert.equal(countOccurrences(output, "#macro dbg"), 1);
        }
    },
    {
        fixtureName: "testGM1041",
        ruleName: "gm1041",
        assertOutput: (output) => {
            assert.equal(output.includes('"obj_player"'), false);
            assert.equal(output.includes("obj_player"), true);
        }
    },
    {
        fixtureName: "testGM1051",
        ruleName: "gm1051",
        assertOutput: (output) => {
            assert.equal(output.includes("#macro FOO_SIMPLE 1;"), false);
            assert.equal(output.includes("#macro FOO_SIMPLE 1"), true);
        }
    },
    {
        fixtureName: "testGM1052",
        ruleName: "gm1052",
        assertOutput: (output) => {
            assert.equal(output.includes("delete values;"), false);
            assert.equal(output.includes("values = undefined;"), true);
        }
    },
    {
        fixtureName: "testGM1058",
        ruleName: "gm1058",
        assertOutput: (output) => {
            assert.equal(/function item\(\)\s+constructor/.test(output), true);
        }
    },
    {
        fixtureName: "testGM1063",
        ruleName: "gm1063",
        assertOutput: (output) => {
            assert.equal(output.includes("pointer_null"), true);
            assert.equal(output.includes(": -1"), false);
        }
    },
    {
        fixtureName: "testGM1064",
        ruleName: "gm1064",
        assertOutput: (output) => {
            assert.equal(countOccurrences(output, "function make_game"), 1);
        }
    }
]);

void test("legacy plugin GM fixtures are now lint-owned feather rule tests", async () => {
    for (const migrationCase of migrationCases) {
        const input = await readMigratedFeatherFixture(migrationCase.fixtureName);
        const result = lintWithFeatherRule(migrationCase.ruleName, input);
        assert.equal(result.messages.length > 0, true, `${migrationCase.ruleName} should report diagnostics`);
        migrationCase.assertOutput(result.output);
    }
});
