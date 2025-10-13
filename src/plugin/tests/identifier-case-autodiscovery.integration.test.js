import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

import {
    getIdentifierCaseOptionStore,
    clearIdentifierCaseOptionStore
} from "../src/identifier-case/option-store.js";

const currentDirectory = fileURLToPath(new URL(".", import.meta.url));
const pluginPath = path.resolve(currentDirectory, "../src/gml.js");
const fixturesDirectory = path.join(
    currentDirectory,
    "identifier-case-fixtures"
);

async function createTempProject(fixtureFileName = "locals.gml") {
    const tempRoot = await fs.mkdtemp(
        path.join(os.tmpdir(), "gml-identifier-case-autodiscovery-")
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
        "scripts/demo/demo.yy",
        JSON.stringify({ resourceType: "GMScript", name: "demo" })
    );

    const fixturePath = path.join(fixturesDirectory, fixtureFileName);
    const fixtureSource = await fs.readFile(fixturePath, "utf8");
    const gmlPath = await writeFile("scripts/demo/demo.gml", fixtureSource);

    return { projectRoot: tempRoot, fixtureSource, gmlPath };
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

describe("identifier case project index bootstrap", () => {
    it("discovers the project root and reuses the index cache", async () => {
        const { projectRoot, fixtureSource, gmlPath } =
            await createTempProject();

        try {
            const baseOptions = {
                plugins: [pluginPath],
                parser: "gml-parse",
                filepath: gmlPath,
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseLocals: "camel",
                gmlIdentifierCaseAssets: "off",
                identifierCaseDryRun: false,
                __identifierCaseDryRun: false
            };
            const firstRunOptions = { ...baseOptions };
            const firstOutput = await prettier.format(
                fixtureSource,
                firstRunOptions
            );

            assert.match(
                firstOutput,
                /counterValue/,
                "Expected automatic discovery to enable renames"
            );

            const store1 = getIdentifierCaseOptionStore(gmlPath);
            assert.ok(store1, "Expected bootstrap store to be captured");
            const bootstrap1 = store1.__identifierCaseProjectIndexBootstrap;
            assert.ok(bootstrap1, "Expected bootstrap metadata to be stored");
            assert.strictEqual(bootstrap1.status, "ready");
            assert.strictEqual(bootstrap1.source, "build");
            assert.ok(
                store1.__identifierCaseMetricsReport,
                "Expected metrics to be recorded during automatic planning"
            );

            const cacheFilePath = path.join(
                projectRoot,
                ".prettier-plugin-gml",
                "project-index-cache.json"
            );
            assert.ok(
                await fileExists(cacheFilePath),
                "Expected index cache to be written after the first run"
            );

            const secondRunOptions = {
                ...baseOptions
            };
            const secondOutput = await prettier.format(
                firstOutput,
                secondRunOptions
            );
            assert.match(
                secondOutput,
                /counterValue/,
                "Expected subsequent runs to keep applying renames"
            );
            const store2 = getIdentifierCaseOptionStore(gmlPath);
            assert.ok(store2, "Expected cached bootstrap metadata");
            const bootstrap2 = store2.__identifierCaseProjectIndexBootstrap;
            assert.ok(bootstrap2, "Expected cached bootstrap metadata");
            assert.strictEqual(bootstrap2.status, "ready");
            assert.strictEqual(bootstrap2.source, "cache");
            assert.strictEqual(bootstrap2.cache?.status, "hit");
        } finally {
            clearIdentifierCaseOptionStore(gmlPath);
            await fs.rm(projectRoot, { recursive: true, force: true });
        }
    });

    it("skips discovery when no manifest is present or discovery is disabled", async () => {
        const tempRoot = await fs.mkdtemp(
            path.join(os.tmpdir(), "gml-identifier-case-autodiscovery-miss-")
        );

        let manifestStoreKey;
        try {
            const fixturePath = path.join(fixturesDirectory, "locals.gml");
            const fixtureSource = await fs.readFile(fixturePath, "utf8");
            const gmlPath = path.join(tempRoot, "scripts/demo.gml");
            manifestStoreKey = gmlPath;
            await fs.mkdir(path.dirname(gmlPath), { recursive: true });
            await fs.writeFile(gmlPath, fixtureSource, "utf8");

            const optionsWithoutManifest = {
                plugins: [pluginPath],
                parser: "gml-parse",
                filepath: gmlPath,
                gmlIdentifierCase: "camel",
                gmlIdentifierCaseLocals: "camel",
                gmlIdentifierCaseAssets: "off",
                identifierCaseDryRun: false,
                __identifierCaseDryRun: false
            };

            const formattedWithoutManifest = await prettier.format(
                fixtureSource,
                optionsWithoutManifest
            );
            assert.ok(
                formattedWithoutManifest.includes("counter_value"),
                "Expected renames to be skipped when no project root is found"
            );
            const missingStore = getIdentifierCaseOptionStore(manifestStoreKey);
            const skippedBootstrap =
                missingStore?.__identifierCaseProjectIndexBootstrap;
            assert.ok(
                skippedBootstrap,
                "Expected skip metadata to be recorded"
            );
            assert.strictEqual(skippedBootstrap.status, "skipped");
            assert.strictEqual(
                skippedBootstrap.reason,
                "project-root-not-found"
            );

            const {
                projectRoot,
                gmlPath: discoveredPath,
                fixtureSource: source
            } = await createTempProject();
            try {
                const disabledOptions = {
                    plugins: [pluginPath],
                    parser: "gml-parse",
                    filepath: discoveredPath,
                    gmlIdentifierCase: "camel",
                    gmlIdentifierCaseLocals: "camel",
                    gmlIdentifierCaseAssets: "off",
                    gmlIdentifierCaseDiscoverProject: false,
                    identifierCaseDryRun: false,
                    __identifierCaseDryRun: false
                };

                const formattedDisabled = await prettier.format(
                    source,
                    disabledOptions
                );
                assert.ok(
                    formattedDisabled.includes("counter_value"),
                    "Expected renames to be disabled when discovery is turned off"
                );
                const disabledStore =
                    getIdentifierCaseOptionStore(discoveredPath);
                const disabledBootstrap =
                    disabledStore?.__identifierCaseProjectIndexBootstrap;
                assert.ok(disabledBootstrap);
                assert.strictEqual(disabledBootstrap.status, "skipped");
                assert.strictEqual(
                    disabledBootstrap.reason,
                    "discovery-disabled"
                );
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
