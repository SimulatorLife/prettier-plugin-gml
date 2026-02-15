import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "@gml-modules/lint";

import { applyFixOperations, createLocResolver, type ReplaceTextRangeFixOperation } from "./rule-test-harness.js";

type MigrationCase = {
    fixtureDirectory: string;
    ruleName: string;
    assertOutput: (output: string) => void;
};

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const migratedFeatherFixtureCandidates = [
    path.resolve(testDirectory, "fixtures/feather"),
    path.resolve(testDirectory, "../../test/fixtures/feather")
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

async function readMigratedFeatherFixture(fixtureDirectory: string): Promise<string> {
    const inputPath = path.join(migratedFeatherFixtureDirectory, fixtureDirectory, "input.gml");
    return readFile(inputPath, "utf8");
}

function countOccurrences(text: string, needle: string): number {
    return text.split(needle).length - 1;
}

const migrationCases: ReadonlyArray<MigrationCase> = Object.freeze([
    {
        fixtureDirectory: "gm1000",
        ruleName: "gm1000",
        assertOutput: (output) => {
            assert.equal(output.includes("break;"), false);
            assert.equal(output.includes("value = 42;"), true);
        }
    },
    {
        fixtureDirectory: "gm1002",
        ruleName: "gm1002",
        assertOutput: (output) => {
            assert.equal(output.includes("global.gameManager"), false);
            assert.equal(output.includes("gameManager = new GameManager("), true);
        }
    },
    {
        fixtureDirectory: "gm1007",
        ruleName: "gm1007",
        assertOutput: (output) => {
            assert.equal(output.includes("new Point(0, 0) ="), false);
            assert.equal(output.includes("1 = new Point"), false);
        }
    },
    {
        fixtureDirectory: "gm1008",
        ruleName: "gm1008",
        assertOutput: (output) => {
            assert.equal(/\bworking_directory\b/.test(output), false);
            assert.equal(output.includes("__feather_working_directory"), true);
        }
    },
    {
        fixtureDirectory: "gm1009",
        ruleName: "gm1009",
        assertOutput: (output) => {
            assert.equal(output.includes("fa_readonly | fa_archive"), true);
            assert.equal(output.includes("room_goto_next()"), true);
        }
    },
    {
        fixtureDirectory: "gm1010",
        ruleName: "gm1010",
        assertOutput: (output) => {
            assert.equal(output.includes("result = 5 + 5;"), true);
            assert.equal(output.includes("real(numFive)"), true);
        }
    },
    {
        fixtureDirectory: "gm1015",
        ruleName: "gm1015",
        assertOutput: (output) => {
            assert.equal(output.includes("/= 0"), false);
            assert.equal(output.includes("%= -1"), true);
        }
    },
    {
        fixtureDirectory: "gm1024",
        ruleName: "gm1024",
        assertOutput: (output) => {
            assert.equal(output.includes("__featherFix_score"), true);
            assert.equal(/\bscore\b\s*=/.test(output), false);
        }
    },
    {
        fixtureDirectory: "gm1026",
        ruleName: "gm1026",
        assertOutput: (output) => {
            assert.equal(output.includes("var __featherFix_pi = pi;"), true);
            assert.equal(output.includes("__featherFix_pi++;"), true);
        }
    },
    {
        fixtureDirectory: "gm1028",
        ruleName: "gm1028",
        assertOutput: (output) => {
            assert.equal(output.includes("[?"), false);
            assert.equal(output.includes("[|"), true);
        }
    },
    {
        fixtureDirectory: "gm1029",
        ruleName: "gm1029",
        assertOutput: (output) => {
            assert.equal(output.includes('"1234"'), false);
            assert.equal(output.includes("draw_sprite(sprite_index, image_index, 1234, 5678);"), true);
        }
    },
    {
        fixtureDirectory: "gm1030",
        ruleName: "gm1030",
        assertOutput: (output) => {
            assert.equal(output.includes("__featherFix_sprite_index"), true);
            assert.equal(/\bsprite_index\b/.test(output), false);
        }
    },
    {
        fixtureDirectory: "gm1033",
        ruleName: "gm1033",
        assertOutput: (output) => {
            assert.equal(output.includes(";;"), false);
            assert.equal(output.includes("var value = 1;"), true);
        }
    },
    {
        fixtureDirectory: "gm1038",
        ruleName: "gm1038",
        assertOutput: (output) => {
            assert.equal(countOccurrences(output, "#macro dbg"), 1);
        }
    },
    {
        fixtureDirectory: "gm1041",
        ruleName: "gm1041",
        assertOutput: (output) => {
            assert.equal(output.includes('"obj_player"'), false);
            assert.equal(output.includes("obj_player"), true);
        }
    },
    {
        fixtureDirectory: "gm1051",
        ruleName: "gm1051",
        assertOutput: (output) => {
            assert.equal(output.includes("#macro FOO_SIMPLE 1;"), false);
            assert.equal(output.includes("#macro FOO_SIMPLE 1"), true);
        }
    },
    {
        fixtureDirectory: "gm1052",
        ruleName: "gm1052",
        assertOutput: (output) => {
            assert.equal(output.includes("delete values;"), false);
            assert.equal(output.includes("values = undefined;"), true);
        }
    },
    {
        fixtureDirectory: "gm1058",
        ruleName: "gm1058",
        assertOutput: (output) => {
            assert.equal(/function item\(\)\s+constructor/.test(output), true);
        }
    },
    {
        fixtureDirectory: "gm1063",
        ruleName: "gm1063",
        assertOutput: (output) => {
            assert.equal(output.includes("pointer_null"), true);
            assert.equal(output.includes(": -1"), false);
        }
    },
    {
        fixtureDirectory: "gm1064",
        ruleName: "gm1064",
        assertOutput: (output) => {
            assert.equal(countOccurrences(output, "function make_game"), 1);
        }
    },
    {
        fixtureDirectory: "gm2000",
        ruleName: "gm2000",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_set_blendmode(bm_normal);"), true);
        }
    },
    {
        fixtureDirectory: "gm2003",
        ruleName: "gm2003",
        assertOutput: (output) => {
            assert.equal(output.includes("shader_reset();"), true);
        }
    },
    {
        fixtureDirectory: "gm2020",
        ruleName: "gm2020",
        assertOutput: (output) => {
            assert.equal(output.includes("with (all) {"), true);
            assert.equal(output.includes("all.hp ="), false);
        }
    },
    {
        fixtureDirectory: "gm2026",
        ruleName: "gm2026",
        assertOutput: (output) => {
            assert.equal(output.includes("draw_set_halign(fa_left);"), true);
        }
    },
    {
        fixtureDirectory: "gm2028",
        ruleName: "gm2028",
        assertOutput: (output) => {
            assert.equal(output.includes("draw_primitive_end();"), false);
        }
    },
    {
        fixtureDirectory: "gm2032",
        ruleName: "gm2032",
        assertOutput: (output) => {
            assert.equal(output.includes("file_find_close();"), false);
        }
    },
    {
        fixtureDirectory: "gm2035",
        ruleName: "gm2035",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_pop_state();"), true);
        }
    },
    {
        fixtureDirectory: "gm2048",
        ruleName: "gm2048",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_set_blendenable(true);"), true);
        }
    },
    {
        fixtureDirectory: "gm2050",
        ruleName: "gm2050",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_set_fog(false, c_black, 0, 1);"), true);
        }
    },
    {
        fixtureDirectory: "gm2051",
        ruleName: "gm2051",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_set_cullmode(cull_noculling);"), true);
        }
    },
    {
        fixtureDirectory: "gm2052",
        ruleName: "gm2052",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_set_colourwriteenable(true, true, true, true);"), true);
        }
    },
    {
        fixtureDirectory: "gm2053",
        ruleName: "gm2053",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_set_alphatestenable(false);"), true);
        }
    },
    {
        fixtureDirectory: "gm2054",
        ruleName: "gm2054",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_set_alphatestref(0);"), true);
        }
    },
    {
        fixtureDirectory: "gm2056",
        ruleName: "gm2056",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_set_texrepeat(false);"), true);
        }
    },
    {
        fixtureDirectory: "gm2061",
        ruleName: "gm2061",
        assertOutput: (output) => {
            assert.equal(output.includes("?? []"), true);
            assert.equal(output.includes("== undefined"), false);
        }
    }
]);

void test("legacy plugin GM fixtures are now lint-owned feather rule tests", async () => {
    for (const migrationCase of migrationCases) {
        const input = await readMigratedFeatherFixture(migrationCase.fixtureDirectory);
        const result = lintWithFeatherRule(migrationCase.ruleName, input);
        assert.equal(result.messages.length > 0, true, `${migrationCase.ruleName} should report diagnostics`);
        migrationCase.assertOutput(result.output);
    }
});
