import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../src/project-index/index.js";

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
            "scripts/meta/meta.yy",
            JSON.stringify({
                resourceType: "GMScript",
                name: "meta"
            })
        );
        await writeFile(
            tempRoot,
            "scripts/meta/meta.gml",
            [
                "#macro MAX_ENEMIES 3",
                "globalvar enemy_limit;",
                "enum Difficulty {",
                "    Easy,",
                "    Hard",
                "}",
                "function meta() {",
                "    enemy_limit = MAX_ENEMIES;",
                "    return Difficulty.Hard;",
                "}",
                ""
            ].join("\n")
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
            [
                "hp = 100;",
                "attack(other);",
                "sprite_index = spr_enemy;",
                "enemy_limit = enemy_limit + 1;"
            ].join("\n")
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

        const attackCalls = attackScope.scriptCalls.map(
            (call) => call.target.name
        );
        assert.ok(
            attackCalls.includes("calc_damage"),
            "expected attack scope to record calc_damage call"
        );

        const attackScript = index.identifiers.scripts["scope:script:attack"];
        assert.ok(attackScript, "expected script identifiers to be collected");
        assert.ok(attackScript.declarations.length >= 1);

        const calcScript =
            index.identifiers.scripts["scope:script:calc_damage"];
        assert.ok(calcScript, "expected calc_damage script entry to exist");
        assert.ok(
            calcScript.references.some(
                (reference) =>
                    reference.filePath === "scripts/attack/attack.gml"
            ),
            "expected calc_damage to record references from attack"
        );

        const macroIdentifiers = index.identifiers.macros.MAX_ENEMIES;
        assert.ok(
            macroIdentifiers,
            "expected macro identifiers to be collected"
        );
        assert.equal(macroIdentifiers.declarations.length, 1);
        assert.ok(macroIdentifiers.references.length >= 1);

        const globalIdentifiers = index.identifiers.globalVariables.enemy_limit;
        assert.ok(
            globalIdentifiers,
            "expected global variable identifiers to be collected"
        );
        assert.equal(globalIdentifiers.declarations.length, 1);
        assert.ok(globalIdentifiers.references.length >= 1);

        const enumEntries = Object.values(index.identifiers.enums);
        const difficultyEnum = enumEntries.find(
            (entry) => entry.name === "Difficulty"
        );
        assert.ok(difficultyEnum, "expected Difficulty enum to be indexed");
        assert.equal(difficultyEnum.declarations.length, 1);
        assert.ok(difficultyEnum.references.length >= 1);

        const enumMemberEntries = Object.values(index.identifiers.enumMembers);
        const hardMember = enumMemberEntries.find(
            (entry) => entry.name === "Hard"
        );
        assert.ok(hardMember, "expected enum member Hard to be indexed");
        assert.equal(hardMember.declarations.length, 1);
        assert.ok(hardMember.references.length >= 1);

        const createFile =
            index.files["objects/obj_enemy/obj_enemy_Create_0.gml"];
        assert.ok(createFile, "expected create event file to be indexed");
        assert.equal(createFile.scriptCalls.length, 1);
        assert.equal(createFile.scriptCalls[0].target.name, "attack");
        assert.equal(createFile.scriptCalls[0].isResolved, true);

        const instanceEntries = Object.values(
            index.identifiers.instanceVariables
        );
        const hpInstance = instanceEntries.find((entry) => entry.name === "hp");
        assert.ok(hpInstance, "expected hp instance assignment to be tracked");
        assert.ok(hpInstance.declarations.length >= 1);

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
            (reference) =>
                reference.targetPath === "sprites/spr_enemy/spr_enemy.yy"
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
