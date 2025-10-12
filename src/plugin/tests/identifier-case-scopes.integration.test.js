import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildProjectIndex } from "../../shared/project-index/index.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const fixturesDirectory = path.join(
    currentDirectory,
    "identifier-case-fixtures"
);
const scopeFixturePath = path.join(fixturesDirectory, "scope-collisions.gml");
const instanceFixturePath = path.join(
    fixturesDirectory,
    "instance-collisions.gml"
);

async function createScopeFixtureProject() {
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gml-scope-tests-")
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
        "scripts/scopeTester/scopeTester.yy",
        JSON.stringify({ resourceType: "GMScript", name: "scopeTester" })
    );

    const fixtureSource = await fs.readFile(scopeFixturePath, "utf8");
    await writeFile("scripts/scopeTester/scopeTester.gml", fixtureSource);

    return { projectRoot: tempRoot, fixtureSource };
}

async function createInstanceFixtureProject() {
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gml-instance-tests-")
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
        "objects/obj_scope/obj_scope.yy",
        JSON.stringify({
            resourceType: "GMObject",
            name: "obj_scope",
            eventList: [
                {
                    name: "Create_0",
                    eventType: 0,
                    eventNum: 0,
                    eventId: {
                        name: "Create_0",
                        path: "objects/obj_scope/obj_scope_Create_0.gml"
                    }
                }
            ]
        })
    );

    const fixtureSource = await fs.readFile(instanceFixturePath, "utf8");
    await writeFile("objects/obj_scope/obj_scope_Create_0.gml", fixtureSource);

    return { projectRoot: tempRoot, fixtureSource };
}

describe("project index scope tracking", () => {
    it("collects identifiers across macros, enums, and globals", async () => {
        const { projectRoot } = await createScopeFixtureProject();

        try {
            const index = await buildProjectIndex(projectRoot);

            const macros = index.identifiers.macros;
            assert.ok(
                macros.MAX_COUNT,
                "expected MAX_COUNT macro to be indexed"
            );
            assert.ok(
                macros.max_count,
                "expected max_count macro to be indexed"
            );
            assert.equal(macros.MAX_COUNT.declarations.length, 1);
            assert.equal(macros.max_count.declarations.length, 1);

            const globalVars = index.identifiers.globalVariables;
            assert.ok(
                globalVars.global_score,
                "expected global_score declaration to be tracked"
            );
            assert.ok(
                globalVars.GLOBAL_SCORE,
                "expected GLOBAL_SCORE declaration to be tracked"
            );

            const enumEntries = Object.values(index.identifiers.enums);
            const difficultyEnum = enumEntries.find(
                (entry) => entry.name === "Difficulty"
            );
            const difficultyCopyEnum = enumEntries.find(
                (entry) => entry.name === "DifficultyCopy"
            );
            assert.ok(difficultyEnum, "expected Difficulty enum to be present");
            assert.ok(
                difficultyCopyEnum,
                "expected DifficultyCopy enum to be present"
            );

            const enumMembers = Object.values(index.identifiers.enumMembers);
            const hasEasyMember = enumMembers.filter(
                (entry) => entry.name === "Easy"
            );
            assert.ok(
                hasEasyMember.length >= 2,
                "expected both Easy members to be tracked"
            );

            const scriptEntry =
                index.identifiers.scripts["scope:script:scopeTester"];
            assert.ok(scriptEntry, "expected script entry for scopeTester");
            assert.equal(scriptEntry.declarations.length >= 1, true);
        } finally {
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });

    it("tracks instance field collisions within object scopes", async () => {
        const { projectRoot } = await createInstanceFixtureProject();

        try {
            const index = await buildProjectIndex(projectRoot);

            const createScope =
                index.scopes["scope:object:obj_scope::Create_0"] ?? null;
            assert.ok(createScope, "expected object scope to be present");

            const instanceMap =
                createScope.identifiers?.instanceVariables ?? {};
            const hpValueEntry =
                instanceMap["scope:object:obj_scope::Create_0:hpValue"] ?? null;
            const hpSnakeEntry =
                instanceMap["scope:object:obj_scope::Create_0:hp_value"] ??
                null;
            assert.ok(
                hpValueEntry,
                "expected camelCase instance variable to be tracked"
            );
            assert.ok(
                hpSnakeEntry,
                "expected snake_case instance variable to be tracked"
            );

            const projectInstanceMap =
                index.identifiers.instanceVariables ?? {};
            assert.ok(
                projectInstanceMap["scope:object:obj_scope::Create_0:hpValue"],
                "expected project-level instance map to include hpValue"
            );
            assert.ok(
                projectInstanceMap["scope:object:obj_scope::Create_0:hp_value"],
                "expected project-level instance map to include hp_value"
            );
        } finally {
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });
});
