import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { Semantic } from "@gml-modules/semantic";

async function withTempDir(run) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gml-bootstrap-"));
    try {
        return await run(tempRoot);
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
}

test("Semantic.bootstrapProjectIndex normalizes cache max size overrides", async () => {
    await withTempDir(async (projectRoot) => {
        const manifestPath = path.join(projectRoot, "project.yyp");
        await writeFile(manifestPath, "{}");
        const scriptsDir = path.join(projectRoot, "scripts");
        await mkdir(scriptsDir, { recursive: true });
        const scriptPath = path.join(scriptsDir, "main.gml");
        await writeFile(scriptPath, "// script\n");

        async function runCase(rawValue) {
            const descriptors = [];
            const coordinator = {
                async ensureReady(descriptor) {
                    descriptors.push(descriptor);
                    return { projectIndex: null, source: null, cache: null };
                },
                dispose() {}
            };

            const options = {
                filepath: scriptPath,
                __identifierCaseProjectIndexCoordinator: coordinator
            };
            if (rawValue !== undefined) {
                options.gmlIdentifierCaseProjectIndexCacheMaxBytes = rawValue;
            }

            await Semantic.bootstrapProjectIndex(options);

            return { options, descriptor: descriptors[0] ?? {} };
        }

        {
            const { options, descriptor } = await runCase("16");
            assert.equal(options.__identifierCaseProjectIndexCacheMaxBytes, 16);
            assert.equal(descriptor.maxSizeBytes, 16);
        }

        {
            const { options, descriptor } = await runCase("0");
            assert.strictEqual(
                options.__identifierCaseProjectIndexCacheMaxBytes,
                null
            );
            assert.strictEqual(descriptor.maxSizeBytes, null);
        }

        {
            const { options, descriptor } = await runCase(" ");
            assert.equal(
                Object.hasOwn(
                    options,
                    "__identifierCaseProjectIndexCacheMaxBytes"
                ),
                false
            );
            assert.equal("maxSizeBytes" in descriptor, false);
        }
    });
});

test("Semantic.bootstrapProjectIndex normalizes concurrency overrides", async () => {
    await withTempDir(async (projectRoot) => {
        const manifestPath = path.join(projectRoot, "project.yyp");
        await writeFile(manifestPath, "{}");
        const scriptsDir = path.join(projectRoot, "scripts");
        await mkdir(scriptsDir, { recursive: true });
        const scriptPath = path.join(scriptsDir, "main.gml");
        await writeFile(scriptPath, "// script\n");

        async function runCase(rawValue) {
            const descriptors = [];
            const coordinator = {
                async ensureReady(descriptor) {
                    descriptors.push(descriptor);
                    return { projectIndex: null, source: null, cache: null };
                },
                dispose() {}
            };

            const options = {
                filepath: scriptPath,
                __identifierCaseProjectIndexCoordinator: coordinator
            };

            if (rawValue !== undefined) {
                options.gmlIdentifierCaseProjectIndexConcurrency = rawValue;
            }

            await Semantic.bootstrapProjectIndex(options);

            return { options, descriptor: descriptors[0] ?? {} };
        }

        {
            const { options, descriptor } = await runCase("8");
            assert.equal(options.__identifierCaseProjectIndexConcurrency, 8);
            assert.equal(descriptor.buildOptions?.concurrency?.gml, 8);
            assert.equal(descriptor.buildOptions?.concurrency?.gmlParsing, 8);
        }

        {
            const { options, descriptor } = await runCase("64");
            assert.equal(options.__identifierCaseProjectIndexConcurrency, 16);
            assert.equal(descriptor.buildOptions?.concurrency?.gml, 16);
            assert.equal(descriptor.buildOptions?.concurrency?.gmlParsing, 16);
        }

        {
            const { options, descriptor } = await runCase("   ");
            assert.equal(
                Object.hasOwn(
                    options,
                    "__identifierCaseProjectIndexConcurrency"
                ),
                false
            );
            assert.equal(descriptor.buildOptions?.concurrency, undefined);
        }

        await assert.rejects(runCase("0"));
        await assert.rejects(runCase(-2));
    });
});

test("Semantic.bootstrapProjectIndex records build failures without throwing", async () => {
    await withTempDir(async (projectRoot) => {
        const manifestPath = path.join(projectRoot, "project.yyp");
        await writeFile(manifestPath, "{}");
        const scriptsDir = path.join(projectRoot, "scripts");
        await mkdir(scriptsDir, { recursive: true });
        const scriptPath = path.join(scriptsDir, "main.gml");
        await writeFile(scriptPath, "// script\n");

        const failure = new Error("index build failed");
        const coordinator = {
            async ensureReady() {
                throw failure;
            },
            dispose() {}
        };

        const options = {
            filepath: scriptPath,
            __identifierCaseProjectIndexCoordinator: coordinator
        };

        const result = await Semantic.bootstrapProjectIndex(options);

        assert.equal(result.status, "failed");
        assert.equal(result.reason, "build-error");
        assert.equal(result.projectIndex, null);
        assert.equal(result.projectRoot, projectRoot);
        assert.equal(result.error, failure);
        assert.equal(options.__identifierCaseProjectIndexBootstrap, result);
        assert.equal(typeof result.dispose, "function");
    });
});
