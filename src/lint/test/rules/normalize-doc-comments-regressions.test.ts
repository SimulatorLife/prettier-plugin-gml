import { test } from "node:test";

import { assertEquals } from "../assertions.js";
import { lintWithRule } from "./lint-rule-test-harness.js";

void test("normalize-doc-comments preserves non-return tag ordering while reordering @param lines", () => {
    const input = [
        "/// @description Updates movement for the active player.",
        "/// @param speed The per-step speed scalar.",
        "/// @customTag keep this custom metadata",
        "/// @param [angle=90] Current heading in degrees.",
        "function update_movement(angle = 90, speed) {",
        "    return;",
        "}",
        ""
    ].join("\n");

    const expected = [
        "/// @description Updates movement for the active player.",
        "/// @param [angle=90] Current heading in degrees.",
        "/// @customTag keep this custom metadata",
        "/// @param speed The per-step speed scalar.",
        "/// @returns {undefined}",
        "function update_movement(angle = 90, speed) {",
        "    return;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("normalize-doc-comments", input, {});
    assertEquals(result.output, expected);
});

void test("normalize-doc-comments synthesizes docs for struct-literal property functions with named params", () => {
    const input = [
        "function build_enemy_struct(name, hp = 100) {",
        "    return {",
        "        name: name,",
        "        hp: hp,",
        "        heal: function (amount) {",
        "            hp += amount;",
        "        },",
        "        label: function () {",
        "            return string(name);",
        "        }",
        "    };",
        "}",
        ""
    ].join("\n");

    const expected = [
        "/// @param name",
        "/// @param [hp=100]",
        "function build_enemy_struct(name, hp = 100) {",
        "    return {",
        "        name: name,",
        "        hp: hp,",
        "/// @param amount",
        "/// @returns {undefined}",
        "        heal: function (amount) {",
        "            hp += amount;",
        "        },",
        "        label: function () {",
        "            return string(name);",
        "        }",
        "    };",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("normalize-doc-comments", input, {});
    assertEquals(result.output, expected);
});

void test("normalize-doc-comments synthesizes @returns for inherited constructors", () => {
    const input = [
        "function EnemyConfig(_type, _speed = 4) : EntityConfig(_speed) constructor {",
        "    type = _type;",
        "    speed = _speed;",
        "}",
        ""
    ].join("\n");

    const expected = [
        "/// @param type",
        "/// @param [speed=4]",
        "/// @returns {undefined}",
        "function EnemyConfig(_type, _speed = 4) : EntityConfig(_speed) constructor {",
        "    type = _type;",
        "    speed = _speed;",
        "}",
        ""
    ].join("\n");

    const result = lintWithRule("normalize-doc-comments", input, {});
    assertEquals(result.output, expected);
});
