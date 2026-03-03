import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as LintWorkspace from "@gml-modules/lint";

import { lintWithFeatherRule } from "./rule-test-harness.js";

type MigrationCase = {
    fixtureDirectory: string;
    ruleName: string;
    assertOutput: (output: string, input: string) => void;
};

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const migratedFeatherFixtureCandidates = [
    path.resolve(testDirectory, "fixtures/feather"),
    path.resolve(testDirectory, "../../test/fixtures/feather"),
    path.resolve(testDirectory, "../../../test/fixtures/feather")
];
const migratedFeatherFixtureDirectory = migratedFeatherFixtureCandidates.find((candidate) => existsSync(candidate));
if (!migratedFeatherFixtureDirectory) {
    throw new Error(
        `Unable to resolve migrated feather fixture directory from candidates: ${migratedFeatherFixtureCandidates.join(
            ", "
        )}`
    );
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
        fixtureDirectory: "gm1012",
        ruleName: "gm1012",
        assertOutput: (output) => {
            assert.equal(output.includes("/// @param value"), true);
            assert.equal(output.includes("string_length("), true);
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
        fixtureDirectory: "gm1017",
        ruleName: "gm1017",
        assertOutput: (output) => {
            assert.equal(output.includes("start_new_game();"), true);
            assert.equal(output.includes("make_game();"), false);
        }
    },
    {
        fixtureDirectory: "gm1021",
        ruleName: "gm1021",
        assertOutput: (output) => {
            assert.equal(output.includes("argument[0]"), false);
            assert.equal(output.includes("var first = value;"), true);
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
        assertOutput: (output, input) => {
            assert.equal(output, input);
            assert.equal(output.includes(";;"), true);
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
        assertOutput: (output, input) => {
            assert.equal(output, input);
            assert.equal(output.includes("#macro FOO_SIMPLE 1;"), true);
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
        fixtureDirectory: "gm1054",
        ruleName: "gm1054",
        assertOutput: (output) => {
            assert.equal(output.includes("array_length_1d("), false);
            assert.equal(output.includes("array_length("), true);
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
        fixtureDirectory: "gm1100",
        ruleName: "gm1100",
        assertOutput: (output) => {
            assert.equal(output.includes("_this * something;"), false);
            assert.equal(output.includes("= 48;"), false);
        }
    },
    {
        fixtureDirectory: "gm1013",
        ruleName: "gm1013",
        assertOutput: (output) => {
            assert.equal(output.includes("/// @param [attack_bonus=10]"), true);
            assert.equal(output.includes("other.attack_bonus"), true);
        }
    },
    {
        fixtureDirectory: "gm1032",
        ruleName: "gm1032",
        assertOutput: (output) => {
            assert.equal(output.includes("function sample3(zero, one, two, three)"), true);
            assert.equal(output.includes("/// @param argument0"), true);
        }
    },
    {
        fixtureDirectory: "gm1034",
        ruleName: "gm1034",
        assertOutput: (output) => {
            assert.equal(output.includes("/// @param first_parameter"), true);
            assert.equal(output.includes("function func_args(_first_parameter) {"), true);
        }
    },
    {
        fixtureDirectory: "gm1036",
        ruleName: "gm1036",
        assertOutput: (output) => {
            assert.equal(output.includes("[0][1][2][3]"), true);
            assert.equal(output.includes("/// @param mat"), true);
        }
    },
    {
        fixtureDirectory: "gm1056",
        ruleName: "gm1056",
        assertOutput: (output) => {
            assert.equal(output.includes("c = undefined"), true);
            assert.equal(output.includes("/// @param [c]"), true);
        }
    },
    {
        fixtureDirectory: "gm1059",
        ruleName: "gm1059",
        assertOutput: (output) => {
            assert.equal(output.includes("function example(value, value2)"), true);
            assert.equal(output.includes("value, value, value"), false);
        }
    },
    {
        fixtureDirectory: "gm1062",
        ruleName: "gm1062",
        assertOutput: (output) => {
            assert.equal(output.includes("/// @description"), true);
            assert.equal(output.includes("{Id.Instance}"), true);
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
        fixtureDirectory: "gm2004",
        ruleName: "gm2004",
        assertOutput: (output) => {
            assert.equal(output.includes("repeat (amount)"), true);
            assert.equal(output.includes("for (var i = 0;"), false);
        }
    },
    {
        fixtureDirectory: "gm2005",
        ruleName: "gm2005",
        assertOutput: (output) => {
            assert.equal(output.includes("surface_reset_target();"), true);
        }
    },
    {
        fixtureDirectory: "gm2007",
        ruleName: "gm2007",
        assertOutput: (output, input) => {
            assert.equal(output, input);
            assert.equal(output.includes("var missing"), true);
        }
    },
    {
        fixtureDirectory: "gm2008",
        ruleName: "gm2008",
        assertOutput: (output) => {
            assert.equal(output.includes("vertex_end(vb);"), true);
        }
    },
    {
        fixtureDirectory: "gm2009",
        ruleName: "gm2009",
        assertOutput: (output) => {
            assert.equal(output.includes("vertex_end("), false);
        }
    },
    {
        fixtureDirectory: "gm2011",
        ruleName: "gm2011",
        assertOutput: (output) => {
            assert.equal(output.includes("vertex_end(vb);"), true);
        }
    },
    {
        fixtureDirectory: "gm2012",
        ruleName: "gm2012",
        assertOutput: (output) => {
            assert.equal(output.includes("vertex_format_add_position_3d();"), false);
        }
    },
    {
        fixtureDirectory: "gm2015",
        ruleName: "gm2015",
        assertOutput: (output) => {
            assert.equal(output.includes("TODO: Incomplete vertex format definition"), true);
            assert.equal(output.includes("//vertex_format_begin();"), true);
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
        fixtureDirectory: "gm2023",
        ruleName: "gm2023",
        assertOutput: (output) => {
            assert.equal(output.includes("draw_set_alpha(1);"), true);
        }
    },
    {
        fixtureDirectory: "gm2025",
        ruleName: "gm2025",
        assertOutput: (output) => {
            assert.equal(output.includes("draw_set_color(c_white);"), true);
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
        fixtureDirectory: "gm2029",
        ruleName: "gm2029",
        assertOutput: (output) => {
            assert.equal(output.includes("draw_primitive_begin(pr_trianglelist);"), true);
            assert.equal(countOccurrences(output, "draw_primitive_end();") <= 1, true);
        }
    },
    {
        fixtureDirectory: "gm2029-attachment",
        ruleName: "gm2029",
        assertOutput: (output) => {
            assert.equal(output.includes("draw_primitive_begin(pr_trianglelist);"), true);
        }
    },
    {
        fixtureDirectory: "gm2030",
        ruleName: "gm2030",
        assertOutput: (output) => {
            assert.equal(countOccurrences(output, "draw_primitive_end();"), 1);
        }
    },
    {
        fixtureDirectory: "gm2031",
        ruleName: "gm2031",
        assertOutput: (output) => {
            assert.equal(output.includes("file_find_close();"), true);
        }
    },
    {
        fixtureDirectory: "gm2033",
        ruleName: "gm2033",
        assertOutput: (output) => {
            assert.equal(output.trimEnd().endsWith("file_find_next();"), false);
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
        fixtureDirectory: "gm2040",
        ruleName: "gm2040",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_set_zwriteenable(true);"), true);
        }
    },
    {
        fixtureDirectory: "gm2042",
        ruleName: "gm2042",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_push_state();\ngpu_push_state();"), false);
        }
    },
    {
        fixtureDirectory: "gm2043",
        ruleName: "gm2043",
        assertOutput: (output) => {
            assert.equal(output.includes("var i = 0;"), true);
            assert.equal(output.includes("var i = 34;"), false);
        }
    },
    {
        fixtureDirectory: "gm2044",
        ruleName: "gm2044",
        assertOutput: (output) => {
            assert.equal(output.includes("/// @returns {undefined}"), true);
            assert.equal(output.includes("var total = total + 1;"), false);
        }
    },
    {
        fixtureDirectory: "gm2046",
        ruleName: "gm2046",
        assertOutput: (output) => {
            assert.equal(countOccurrences(output, "surface_reset_target();") >= 2, true);
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
    },
    {
        fixtureDirectory: "gm2064",
        ruleName: "gm2064",
        assertOutput: (output) => {
            assert.equal(output.includes("gpu_set_ztestenable(true);"), true);
        }
    }
]);

void test("legacy plugin GM fixtures are now lint-owned feather rule tests", async () => {
    for (const migrationCase of migrationCases) {
        const input = await readMigratedFeatherFixture(migrationCase.fixtureDirectory);
        const result = lintWithFeatherRule(LintWorkspace.Lint.featherPlugin, migrationCase.ruleName, input);
        assert.equal(result.messages.length > 0, true, `${migrationCase.ruleName} should report diagnostics`);
        migrationCase.assertOutput(result.output, input);
    }
});

void test("gm1013 applies generic rewrites beyond fixture-specific symbols", () => {
    const input = `function DamageHandler (speed = 12) constructor {
    /// @function trigger
    static strike = function () {
        with (other) {
            var total = (base + speed);
        }
    }
}

runner = function () constructor {
    value = 1;
}
`;

    const { output } = lintWithFeatherRule(LintWorkspace.Lint.featherPlugin, "gm1013", input);

    assert.equal(output.includes("/// @param [speed=12]"), true);
    assert.equal(output.includes("function DamageHandler(speed = 12) constructor {"), true);
    assert.equal(output.includes("/// @returns {undefined}"), true);
    assert.equal(output.includes("var total = base + other.speed;"), true);
    assert.equal(output.includes("static strike = function () {"), true);
    assert.equal(output.includes("runner = function () constructor {"), true);
    assert.equal(output.includes("};"), true);
});
