import assert from "node:assert/strict";
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildProjectIndex } from "../src/project-index/index.js";

type IdentifierIndexEntry = {
    identifierId?: string;
    name?: string;
    declarations?: unknown[];
};

type IdentifierCollections = {
    enums: Record<string, IdentifierIndexEntry>;
    enumMembers: Record<string, IdentifierIndexEntry>;
    globalVariables: Record<string, IdentifierIndexEntry>;
    macros: Record<string, IdentifierIndexEntry>;
    scripts: Record<string, IdentifierIndexEntry>;
};

type ProjectIndexSnapshot = { identifiers: IdentifierCollections };

function valuesAs<T>(record: Record<string, T>): T[] {
    return Object.values(record);
}

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const fixturesDirectory = resolveFixturesDirectory(currentDirectory);
const scopeFixturePath = path.join(fixturesDirectory, "scope-collisions.gml");

function resolveFixturesDirectory(baseDirectory: string) {
    const candidates = [
        path.join(baseDirectory, "identifier-case-fixtures"),
        path.resolve(baseDirectory, "../../test/identifier-case-fixtures")
    ];
    const sampleFixture = "locals.gml";

    for (const candidate of candidates) {
        if (existsSync(path.join(candidate, sampleFixture))) {
            return candidate;
        }
    }

    return candidates[0];
}

async function createScopeFixtureProject() {
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gml-scope-tests-")
    );
    const writeFile = async (relativePath: string, contents: string) => {
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

void describe("project index scope tracking", () => {
    void it("collects identifiers across macros, enums, and globals", async () => {
        const { projectRoot } = await createScopeFixtureProject();

        try {
            const index = (await buildProjectIndex(
                projectRoot
            )) as ProjectIndexSnapshot;

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

            const enumEntries = valuesAs<IdentifierIndexEntry>(
                index.identifiers.enums
            );
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

            const enumMembers = valuesAs<IdentifierIndexEntry>(
                index.identifiers.enumMembers
            );
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
            assert.equal(scriptEntry.declarations.length > 0, true);
        } finally {
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });
});
