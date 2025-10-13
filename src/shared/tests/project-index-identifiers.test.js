import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildProjectIndex } from "../../plugin/src/project-index/index.js";

async function writeFile(rootDir, relativePath, contents) {
    const absolutePath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents, "utf8");
}

test("buildProjectIndex assigns identifier ids for each scope", async () => {
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gml-index-scope-")
    );

    try {
        await writeFile(
            tempRoot,
            "MyGame.yyp",
            JSON.stringify({ name: "MyGame", resourceType: "GMProject" })
        );

        await writeFile(
            tempRoot,
            "scripts/scopeCollision/scopeCollision.yy",
            JSON.stringify({
                resourceType: "GMScript",
                name: "scopeCollision"
            })
        );

        await writeFile(
            tempRoot,
            "scripts/scopeCollision/scopeCollision.gml",
            [
                "#macro MACRO_VALUE 10",
                "#macro macro_value 20",
                "globalvar global_rate, GLOBAL_RATE;",
                "global.GLOBALPOINT = 1;",
                "global.globalPoint = 2;",
                "enum RewardLevel {",
                "    Bronze,",
                "    bronze",
                "}",
                "function scopeCollision() {",
                "    var local_total = MACRO_VALUE + macro_value;",
                "    global_rate = local_total;",
                "    GLOBAL_RATE = globalPoint + GLOBALPOINT;",
                "    return RewardLevel.Bronze;",
                "}",
                ""
            ].join("\n")
        );

        await writeFile(
            tempRoot,
            "objects/obj_tracker/obj_tracker.yy",
            JSON.stringify({
                resourceType: "GMObject",
                name: "obj_tracker",
                eventList: [
                    {
                        name: "Create_0",
                        eventType: 0,
                        eventNum: 0,
                        eventId: {
                            name: "Create_0",
                            path: "objects/obj_tracker/obj_tracker_Create_0.gml"
                        }
                    }
                ]
            })
        );

        await writeFile(
            tempRoot,
            "objects/obj_tracker/obj_tracker_Create_0.gml",
            [
                "speed_bonus = 1;",
                "SpeedBonus = speed_bonus + 1;",
                "speedBonus = SpeedBonus + 1;",
                ""
            ].join("\n")
        );

        const index = await buildProjectIndex(tempRoot);

        const scriptEntry =
            index.identifiers.scripts["scope:script:scopeCollision"];
        assert.ok(scriptEntry);
        assert.equal(
            scriptEntry.identifierId,
            "script:scope:script:scopeCollision"
        );

        const macroUpper = index.identifiers.macros.MACRO_VALUE;
        assert.equal(macroUpper.identifierId, "macro:MACRO_VALUE");
        const macroLower = index.identifiers.macros.macro_value;
        assert.equal(macroLower.identifierId, "macro:macro_value");

        const globalLower = index.identifiers.globalVariables.global_rate;
        assert.equal(globalLower.identifierId, "global:global_rate");
        const globalUpper = index.identifiers.globalVariables.GLOBAL_RATE;
        assert.equal(globalUpper.identifierId, "global:GLOBAL_RATE");

        const enumEntries = Object.values(index.identifiers.enums);
        assert.ok(enumEntries.length >= 1);
        for (const entry of enumEntries) {
            assert.ok(entry.identifierId?.startsWith("enum:"));
        }

        const instanceEntries = Object.values(
            index.identifiers.instanceVariables
        );
        const instanceIds = instanceEntries.map((entry) => entry.identifierId);
        assert.ok(instanceIds.every((id) => id?.startsWith("instance:")));
        const uniqueInstanceIds = new Set(instanceIds);
        assert.ok(uniqueInstanceIds.size >= 3);
    } finally {
        await fs.rm(tempRoot, { recursive: true, force: true });
    }
});
