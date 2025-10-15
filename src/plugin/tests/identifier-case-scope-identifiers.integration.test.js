import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildProjectIndex } from "../src/project-index/index.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const fixturesDirectory = path.join(
    currentDirectory,
    "identifier-case-fixtures"
);
const scriptFixturePath = path.join(
    fixturesDirectory,
    "scope-identifier-collisions.gml"
);
const objectFixturePath = path.join(
    fixturesDirectory,
    "object-instance-collisions.gml"
);

async function createIdentifierFixtureProject() {
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gml-scope-identifiers-")
    );

    const writeFile = async (relativePath, contents) => {
        const absolutePath = path.join(tempRoot, relativePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, contents, "utf8");
        return absolutePath;
    };

    await writeFile(
        "MyGame.yyp",
        JSON.stringify({ name: "MyGame", resourceType: "GMProject" })
    );

    await writeFile(
        "scripts/scopeCollision/scopeCollision.yy",
        JSON.stringify({ resourceType: "GMScript", name: "scopeCollision" })
    );

    const scriptSource = await fs.readFile(scriptFixturePath, "utf8");
    await writeFile("scripts/scopeCollision/scopeCollision.gml", scriptSource);

    await writeFile(
        "objects/obj_tracker/obj_tracker.yy",
        JSON.stringify({
            resourceType: "GMObject",
            name: "obj_tracker",
            eventList: [
                {
                    name: "Step_0",
                    eventType: 3,
                    eventNum: 0,
                    eventId: {
                        name: "Step_0",
                        path: "objects/obj_tracker/obj_tracker_Step_0.gml"
                    }
                }
            ]
        })
    );

    const objectSource = await fs.readFile(objectFixturePath, "utf8");
    await writeFile("objects/obj_tracker/obj_tracker_Step_0.gml", objectSource);

    return { projectRoot: tempRoot };
}

describe("project index identifier tracking", () => {
    it("assigns identifier ids per scope and preserves collision entries", async () => {
        const { projectRoot } = await createIdentifierFixtureProject();

        try {
            const index = await buildProjectIndex(projectRoot);

            const scriptEntry =
                index.identifiers.scripts["scope:script:scopeCollision"];
            assert.ok(scriptEntry, "expected scopeCollision script entry");
            assert.equal(
                scriptEntry.identifierId,
                "script:scope:script:scopeCollision"
            );

            const macros = index.identifiers.macros;
            assert.ok(macros.MACRO_VALUE);
            assert.equal(macros.MACRO_VALUE.identifierId, "macro:MACRO_VALUE");
            assert.ok(macros.macro_value);
            assert.equal(macros.macro_value.identifierId, "macro:macro_value");
            assert.ok(macros.MacroValue);
            assert.equal(macros.MacroValue.identifierId, "macro:MacroValue");

            const globalVars = index.identifiers.globalVariables;
            assert.equal(
                globalVars.global_rate.identifierId,
                "global:global_rate"
            );
            assert.equal(
                globalVars.GLOBAL_RATE.identifierId,
                "global:GLOBAL_RATE"
            );

            const enumEntries = Object.values(index.identifiers.enums);
            assert.ok(enumEntries.length >= 2, "expected enum entries");
            for (const entry of enumEntries) {
                assert.ok(
                    entry.identifierId?.startsWith("enum:"),
                    "expected enum identifier prefix"
                );
            }

            const enumMembers = Object.values(index.identifiers.enumMembers);
            const sharedMembers = enumMembers.filter(
                (entry) => entry.name === "Bronze"
            );
            assert.ok(sharedMembers.length >= 2);
            for (const member of sharedMembers) {
                assert.ok(
                    member.identifierId?.startsWith("enum-member:"),
                    "expected enum member identifier prefix"
                );
            }

            const instanceEntries = Object.values(
                index.identifiers.instanceVariables
            );
            const speedBonusNames = instanceEntries.filter((entry) =>
                ["speed_bonus", "SpeedBonus", "speedBonus"].includes(entry.name)
            );
            assert.equal(speedBonusNames.length, 3);
            for (const instance of speedBonusNames) {
                assert.ok(
                    instance.identifierId?.startsWith("instance:"),
                    "expected instance identifier prefix"
                );
            }
        } finally {
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });
});
