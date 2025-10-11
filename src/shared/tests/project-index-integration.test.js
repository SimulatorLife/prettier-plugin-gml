import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../project-index/index.js";

async function writeFile(rootDir, relativePath, contents) {
    const absolutePath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents, "utf8");
}

test("buildProjectIndex collects symbols and relationships across project files", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gml-project-"));

    try {
        await writeFile(
            tempRoot,
            "MyGame.yyp",
            JSON.stringify({ name: "MyGame", resourceType: "GMProject" })
        );

        await writeFile(
            tempRoot,
            "sprites/spr_enemy/spr_enemy.yy",
            JSON.stringify({
                resourceType: "GMSprite",
                name: "spr_enemy"
            })
        );

        await writeFile(
            tempRoot,
            "scripts/calc_damage/calc_damage.yy",
            JSON.stringify({
                resourceType: "GMScript",
                name: "calc_damage"
            })
        );
        await writeFile(
            tempRoot,
            "scripts/calc_damage/calc_damage.gml",
            "function calc_damage(target) {\n    return max(0, target.hp - target.armor);\n}\n"
        );

        await writeFile(
            tempRoot,
            "scripts/attack/attack.yy",
            JSON.stringify({
                resourceType: "GMScript",
                name: "attack"
            })
        );
        await writeFile(
            tempRoot,
            "scripts/attack/attack.gml",
            [
                "function attack(target) {",
                "    var damage = calc_damage(target);",
                "    return damage;",
                "}",
                ""
            ].join("\n")
        );

        await writeFile(
            tempRoot,
            "objects/obj_enemy/obj_enemy.yy",
            JSON.stringify({
                resourceType: "GMObject",
                name: "obj_enemy",
                spriteId: {
                    name: "spr_enemy",
                    path: "sprites/spr_enemy/spr_enemy.yy"
                },
                eventList: [
                    {
                        name: "Create_0",
                        eventType: 0,
                        eventNum: 0,
                        eventId: {
                            name: "Create_0",
                            path: "objects/obj_enemy/obj_enemy_Create_0.gml"
                        }
                    },
                    {
                        name: "Step_0",
                        eventType: 3,
                        eventNum: 0,
                        eventId: {
                            name: "Step_0",
                            path: "objects/obj_enemy/obj_enemy_Step_0.gml"
                        }
                    }
                ]
            })
        );

        await writeFile(
            tempRoot,
            "objects/obj_enemy/obj_enemy_Create_0.gml",
            ["hp = 100;", "attack(other);", "sprite_index = spr_enemy;"].join("\n")
        );

        await writeFile(
            tempRoot,
            "objects/obj_enemy/obj_enemy_Step_0.gml",
            ["if (hp <= 0) {", "    instance_destroy();", "}"].join("\n")
        );

        const index = await buildProjectIndex(tempRoot);

        assert.ok(
            index.resources["scripts/attack/attack.yy"],
            "expected attack resource to be indexed"
        );
        assert.ok(
            index.resources["objects/obj_enemy/obj_enemy.yy"],
            "expected object resource to be indexed"
        );

        const attackScope = index.scopes["scope:script:attack"];
        assert.ok(attackScope, "expected attack scope to be present");
        assert.ok(
            attackScope.declarations.some((decl) => decl.name === "attack"),
            "expected attack declaration to be captured"
        );

        const attackCalls = attackScope.scriptCalls.map((call) => call.target.name);
        assert.ok(
            attackCalls.includes("calc_damage"),
            "expected attack scope to record calc_damage call"
        );

        const createFile = index.files["objects/obj_enemy/obj_enemy_Create_0.gml"];
        assert.ok(createFile, "expected create event file to be indexed");
        assert.equal(createFile.scriptCalls.length, 1);
        assert.equal(createFile.scriptCalls[0].target.name, "attack");
        assert.equal(createFile.scriptCalls[0].isResolved, true);

        const stepFile = index.files["objects/obj_enemy/obj_enemy_Step_0.gml"];
        assert.ok(stepFile, "expected step event file to be indexed");
        assert.equal(
            stepFile.scriptCalls.length,
            0,
            "expected built-in instance_destroy to be excluded from script calls"
        );

        const calcFile = index.files["scripts/calc_damage/calc_damage.gml"];
        assert.ok(calcFile, "expected calc_damage file to be indexed");
        assert.ok(
            calcFile.ignoredIdentifiers.some(
                (entry) => entry.name === "max" && entry.reason === "built-in"
            ),
            "expected built-in max to be ignored"
        );

        const scriptCallTargets = index.relationships.scriptCalls.map(
            (call) => call.target.name
        );
        assert.deepEqual(scriptCallTargets.sort(), ["attack", "calc_damage"]);

        const spriteReference = index.relationships.assetReferences.find(
            (reference) => reference.targetPath === "sprites/spr_enemy/spr_enemy.yy"
        );
        assert.ok(
            spriteReference,
            "expected sprite asset reference to be recorded"
        );
        assert.equal(
            spriteReference.fromResourcePath,
            "objects/obj_enemy/obj_enemy.yy"
        );
    } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});
