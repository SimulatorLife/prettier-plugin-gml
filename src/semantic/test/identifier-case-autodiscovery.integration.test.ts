/**
 * Integration test for identifier-case autodiscovery.
 *
 * ARCHITECTURE SMELL: This integration test lives in the 'semantic' package but
 * requires importing the full 'format' package (via Prettier), creating a reverse
 * dependency from a lower layer to a higher layer. The dependency flow should be:
 *   Core ← Parser ← Semantic ← Format
 *
 * Integration tests that exercise the full pipeline (Prettier → Format → Semantic → Parser)
 * should not live inside a workspace that's supposed to be lower in the stack.
 *
 * CURRENT STATE: The test here imports Prettier and the format workspace, formats GML source,
 * and verifies that identifier-case analysis works end-to-end. This forces the
 * 'semantic' package to have a dev-dependency on 'format', which is backwards.
 *
 * RECOMMENDATION: Move all integration tests to a top-level 'test/' directory at the
 * repository root, outside any individual workspace. This directory can depend on
 * all packages and test the full pipeline without creating circular dependencies.
 * The 'semantic' package should only contain unit tests that test its own exports
 * in isolation, using mocked or minimal inputs from lower layers (Core, Parser).
 *
 * WHAT WOULD BREAK: Leaving integration tests in lower-layer packages prevents
 * clean layering, makes it harder to build packages independently, and forces
 * contributors to reason about reverse dependencies during development.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { clearIdentifierCaseOptionStore, getIdentifierCaseOptionStore } from "../src/identifier-case/option-store.js";
import { getFormat } from "./format-loader.js";
import { createIdentifierCaseProject, resolveIdentifierCaseFixturesDirectory } from "./identifier-case-test-helpers.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const fixturesDirectory = resolveIdentifierCaseFixturesDirectory(currentDirectory);

async function createTempProject(fixtureFileName = "locals.gml") {
    const project = await createIdentifierCaseProject({
        fixturesDirectory,
        scriptFixtures: [{ name: "demo", fixture: fixtureFileName }],
        eventFixture: null,
        projectPrefix: "gml-identifier-case-autodiscovery-"
    });

    return {
        projectRoot: project.projectRoot,
        fixtureSource: project.scriptSources[0],
        gmlPath: project.scriptPaths[0]
    };
}

async function fileExists(filePath) {
    try {
        await fs.stat(filePath);
        return true;
    } catch (error) {
        if (error && error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

void describe("identifier case project index bootstrap", () => {
    void it("does not apply identifier-case rewrites via formatter autodiscovery", async () => {
        const { projectRoot, fixtureSource, gmlPath } = await createTempProject();

        try {
            const baseOptions = {
                filepath: gmlPath,
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseLocals: "camel",
                gmlIdentifierCaseFunctions: "off",
                gmlIdentifierCaseStructs: "off",
                gmlIdentifierCaseMacros: "off",
                gmlIdentifierCaseInstance: "off",
                gmlIdentifierCaseGlobals: "off",
                gmlIdentifierCaseAssets: "off",
                identifierCaseDryRun: false,
                __identifierCaseDryRun: false
            };
            const firstRunOptions = { ...baseOptions };
            const formatWorkspace = await getFormat();
            const firstOutput = await formatWorkspace.format(fixtureSource, firstRunOptions);

            assert.ok(firstOutput.includes("counter_value"));

            const cacheFilePath = path.join(projectRoot, ".prettier-plugin-gml", "project-index-cache.json");
            assert.equal(await fileExists(cacheFilePath), false);

            const secondRunOptions = {
                ...baseOptions
            };
            const secondOutput = await formatWorkspace.format(firstOutput, secondRunOptions);
            assert.ok(secondOutput.includes("counter_value"));
        } finally {
            clearIdentifierCaseOptionStore(gmlPath);
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });

    void it("keeps identifier-case rewrites disabled when discovery cannot run", async () => {
        const missBase = path.join(currentDirectory, "../../tmp", "gml-identifier-case-autodiscovery-miss");
        await fs.mkdir(missBase, { recursive: true });
        const tempRoot = await fs.mkdtemp(path.join(missBase, "gml-identifier-case-autodiscovery-miss-"));

        let manifestStoreKey;
        try {
            const fixturePath = path.join(fixturesDirectory, "locals.gml");
            const fixtureSource = await fs.readFile(fixturePath, "utf8");
            const gmlPath = path.join(tempRoot, "scripts/demo.gml");
            manifestStoreKey = gmlPath;
            await fs.mkdir(path.dirname(gmlPath), { recursive: true });
            await fs.writeFile(gmlPath, fixtureSource, "utf8");

            const optionsWithoutManifest = {
                filepath: gmlPath,
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseLocals: "camel",
                gmlIdentifierCaseFunctions: "off",
                gmlIdentifierCaseStructs: "off",
                gmlIdentifierCaseMacros: "off",
                gmlIdentifierCaseInstance: "off",
                gmlIdentifierCaseGlobals: "off",
                gmlIdentifierCaseAssets: "off",
                identifierCaseDryRun: false,
                __identifierCaseDryRun: false
            };

            const formatWorkspace = await getFormat();
            const formattedWithoutManifest = await formatWorkspace.format(fixtureSource, optionsWithoutManifest);
            assert.ok(
                formattedWithoutManifest.includes("counter_value"),
                "Expected renames to be skipped when no project root is found"
            );
            const missingStore = getIdentifierCaseOptionStore(manifestStoreKey);
            assert.equal(missingStore?.__identifierCaseProjectIndexBootstrap ?? null, null);

            const { projectRoot, gmlPath: discoveredPath, fixtureSource: source } = await createTempProject();
            try {
                const disabledOptions = {
                    filepath: discoveredPath,
                    gmlIdentifierCase: "camel",
                    gmlIdentifierCaseLocals: "camel",
                    gmlIdentifierCaseFunctions: "off",
                    gmlIdentifierCaseStructs: "off",
                    gmlIdentifierCaseMacros: "off",
                    gmlIdentifierCaseInstance: "off",
                    gmlIdentifierCaseGlobals: "off",
                    gmlIdentifierCaseAssets: "off",
                    gmlIdentifierCaseDiscoverProject: false,
                    identifierCaseDryRun: false,
                    __identifierCaseDryRun: false
                };

                const formattedDisabled = await formatWorkspace.format(source, disabledOptions);
                assert.ok(
                    formattedDisabled.includes("counter_value"),
                    "Expected renames to be disabled when discovery is turned off"
                );
                const disabledStore = getIdentifierCaseOptionStore(discoveredPath);
                assert.equal(disabledStore?.__identifierCaseProjectIndexBootstrap ?? null, null);
            } finally {
                clearIdentifierCaseOptionStore(discoveredPath);
                await fs.rm(projectRoot, { recursive: true, force: true });
            }
        } finally {
            clearIdentifierCaseOptionStore(manifestStoreKey);
            await fs.rm(tempRoot, { recursive: true, force: true });
        }
    });
});
